import { Request, Response } from "express";
import { db } from "../repositories/firebaseService";
import { UserStatus } from "../enums/UserStatus";

type ScheduleRole =
  | "minister"
  | "vocal"
  | "teclas"
  | "violao"
  | "batera"
  | "bass"
  | "guita"
  | "sound";

interface ScheduleMusicos {
  minister: string[];
  vocal: string[];
  teclas: string[];
  violao: string[];
  batera: string[];
  bass: string[];
  guita: string[];
  sound: string[];
}

interface ScheduleEntry {
  date: string;
  outfitColor?: string;
  musicos: ScheduleMusicos;
  musicosIds: ScheduleMusicos;
}

interface GeneratedScheduleResult {
  monthId: string;
  sundays: ScheduleEntry[];
}

interface ActiveUser {
  id: string;
  name: string;
  nickname?: string | null;
  status?: string;
  roles: string[];
  rolesLower: string[];
  instruments: string[];
  canLeadWorship?: boolean;
}

interface UserLookup {
  byId: Map<string, ActiveUser>;
  byText: Map<string, ActiveUser>;
}

interface ScheduleMusicoDisplay {
  id: string;
  label: string;
  name: string;
  nickname: string | null;
}

const DEFAULT_ROLE_ORDER: ScheduleRole[] = [
  "minister",
  "vocal",
  "teclas",
  "violao",
  "batera",
  "bass",
  "guita",
  "sound",
];

const ROLE_ALIASES: Record<ScheduleRole, string[]> = {
  minister: ["minister", "ministro"],
  vocal: ["vocal", "voz", "cantor"],
  teclas: ["teclas", "keyboard", "teclado"],
  violao: ["violao", "violÃ£o"],
  batera: ["batera", "drums", "bateria"],
  bass: ["bass", "baixo"],
  guita: ["guita", "guitar", "guitarra"],
  sound: ["sound", "som", "audio", "Ã¡udio"],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildMonthId(month: number, year: number) {
  return `${pad(month)}-${year}`;
}

function getSundayDates(month: number, year: number) {
  const sundays: Date[] = [];
  const current = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 0) {
      sundays.push(date);
    }
  }

  return sundays;
}

function getUserLabel(user: ActiveUser) {
  return user.nickname?.trim() || user.name.trim() || user.id;
}

function getUserLookup(users: ActiveUser[]): UserLookup {
  const byId = new Map<string, ActiveUser>();
  const byText = new Map<string, ActiveUser>();

  for (const user of users) {
    byId.set(user.id, user);

    for (const value of [user.id, user.name, user.nickname ?? ""]) {
      const normalized = normalizeText(String(value));
      if (!normalized || byText.has(normalized)) {
        continue;
      }

      byText.set(normalized, user);
    }
  }

  return { byId, byText };
}

function resolveUserId(value: unknown, lookup?: UserLookup) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    if (lookup?.byId.has(trimmed)) {
      return trimmed;
    }

    const matched = lookup?.byText.get(normalizeText(trimmed));
    return matched?.id ?? trimmed;
  }

  if (value && typeof value === "object") {
    const maybeId = (value as { id?: unknown }).id;
    if (typeof maybeId === "string") {
      return resolveUserId(maybeId, lookup);
    }
  }

  return "";
}

function resolveUserDisplay(value: string, lookup?: UserLookup): ScheduleMusicoDisplay | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const user = lookup?.byId.get(trimmed) ?? lookup?.byText.get(normalizeText(trimmed));

  if (!user) {
    return {
      id: trimmed,
      label: trimmed,
      name: trimmed,
      nickname: null,
    };
  }

  return {
    id: user.id,
    label: getUserLabel(user),
    name: user.name,
    nickname: user.nickname ?? null,
  };
}

function resolveMusicosForResponse(musicos: ScheduleMusicos, lookup?: UserLookup) {
  return Object.fromEntries(
    DEFAULT_ROLE_ORDER.map((role) => [
      role,
      musicos[role]
        .map((value) => resolveUserDisplay(value, lookup))
        .filter(Boolean) as ScheduleMusicoDisplay[],
    ])
  ) as Record<ScheduleRole, ScheduleMusicoDisplay[]>;
}

function normalizeSpecialSchedule(raw: any, lookup?: UserLookup): SpecialSchedule {
  return {
    evento: typeof raw?.evento === "string" ? raw.evento : "",
    data: typeof raw?.data === "string" ? raw.data : "",
    outfitColor: typeof raw?.outfitColor === "string" ? raw.outfitColor : undefined,
    ...normalizeMusicos(raw, lookup),
  };
}

function mergeSpecialSchedulePayload(raw: any) {
  const ids = raw?.músicosIds ?? raw?.musicosIds ?? raw?.ids ?? {};

  return {
    ...raw,
    ...ids,
  };
}

function resolveSpecialScheduleForResponse(raw: SpecialSchedule, lookup?: UserLookup): SpecialScheduleDisplay {
  return {
    evento: raw.evento,
    data: raw.data,
    outfitColor: raw.outfitColor,
    ...resolveMusicosForResponse(raw, lookup),
  };
}

function getUserTokens(user: ActiveUser) {
  const roleTokens = [
    ...user.roles.map((role) => normalizeText(role)),
    ...user.rolesLower.map((role) => normalizeText(role)),
    ...user.instruments.map((instrument) => normalizeText(instrument)),
  ];

  return new Set(roleTokens);
}

function matchesRole(user: ActiveUser, role: ScheduleRole) {
  const tokens = getUserTokens(user);

  if (role === "minister" && user.canLeadWorship) {
    return true;
  }

  return ROLE_ALIASES[role].some((alias) => tokens.has(normalizeText(alias)));
}

function buildEmptyMusicos(): ScheduleMusicos {
  return {
    minister: [],
    vocal: [],
    teclas: [],
    violao: [],
    batera: [],
    bass: [],
    guita: [],
    sound: [],
  };
}

function cloneMusicos(value: ScheduleMusicos) {
  return Object.fromEntries(
    DEFAULT_ROLE_ORDER.map((role) => [role, [...value[role]]])
  ) as unknown as ScheduleMusicos;
}

function resolveScheduleForResponse(entry: any, lookup?: UserLookup) {
  const musicos = normalizeMusicos(getMusicosPayload(entry), lookup);
  const displays = resolveMusicosForResponse(musicos, lookup);

  return {
    ...entry,
    date: typeof entry?.date === "string" ? entry.date : "",
    outfitColor: typeof entry?.outfitColor === "string" ? entry.outfitColor : "",
    ...displays,
    musicos: displays,
    musicosIds: cloneMusicos(musicos),
    músicos: displays,
    músicosIds: cloneMusicos(musicos),
  };
}

function normalizeRoleList(value: unknown, lookup?: UserLookup): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => resolveUserId(item, lookup)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => resolveUserId(item, lookup))
      .filter(Boolean);
  }

  return [];
}

function normalizeMusicos(raw: any, lookup?: UserLookup): ScheduleMusicos {
  const vocalFromArray = normalizeRoleList(raw?.vocal, lookup);
  const vocalFromLegacy = normalizeRoleList([raw?.vocal1, raw?.vocal2].filter(Boolean), lookup);

  return {
    minister: normalizeRoleList(raw?.minister, lookup),
    vocal: vocalFromArray.length > 0 ? vocalFromArray : vocalFromLegacy,
    teclas: normalizeRoleList(raw?.teclas, lookup),
    violao: normalizeRoleList(raw?.violao, lookup),
    batera: normalizeRoleList(raw?.batera, lookup),
    bass: normalizeRoleList(raw?.bass, lookup),
    guita: normalizeRoleList(raw?.guita, lookup),
    sound: normalizeRoleList(raw?.sound, lookup),
  };
}

function mergeMusicosPayload(raw: any) {
  const ids = raw?.músicosIds ?? raw?.musicosIds ?? raw?.["mÃºsicosIds"] ?? raw?.ids ?? {};

  return {
    ...raw,
    ...ids,
  };
}

function getMusicosPayload(raw: any) {
  return raw?.músicos ?? raw?.musicos ?? raw?.["mÃºsicos"] ?? raw?.músicosIds ?? raw?.musicosIds ?? raw?.["mÃºsicosIds"] ?? {};
}

function getOutfitColorPayload(raw: any) {
  if (typeof raw?.outfitColor === "string") {
    return raw.outfitColor;
  }

  const nestedSources = [
    raw?.["músicosIds"],
    raw?.musicosIds,
    raw?.["músicos"],
    raw?.musicos,
    raw?.ids,
  ];

  for (const source of nestedSources) {
    if (typeof source?.outfitColor === "string") {
      return source.outfitColor;
    }
  }

  return "";
}

function extractHistoryFromDoc(data: any, lookup?: UserLookup) {
  const sundays = Array.isArray(data?.sundays) ? data.sundays : [];

  return sundays
    .map((entry: any) => ({
      date: typeof entry?.date === "string" ? entry.date : null,
      mÃºsicos: normalizeMusicos(getMusicosPayload(entry), lookup),
    }))
    .filter((entry: { date: string | null; mÃºsicos: any }) => Boolean(entry.date));
}

function buildHistoryMaps(entries: Array<{ date: string; mÃºsicos: any }>) {
  const roleCounts: Record<ScheduleRole, Map<string, number>> = {
    minister: new Map(),
    vocal: new Map(),
    teclas: new Map(),
    violao: new Map(),
    batera: new Map(),
    bass: new Map(),
    guita: new Map(),
    sound: new Map(),
  };

  const totalCounts = new Map<string, number>();
  const byDate = new Map<string, Set<string>>();

  for (const entry of entries) {
    const dateKey = toDateKey(parseDateKey(entry.date) ?? new Date(entry.date));
    const used = new Set<string>();
    const musicians = normalizeMusicos(entry.mÃºsicos ?? {});

    for (const role of DEFAULT_ROLE_ORDER) {
      for (const name of musicians[role]) {
        const normalizedName = name.trim();
        if (!normalizedName) {
          continue;
        }

        roleCounts[role].set(normalizedName, (roleCounts[role].get(normalizedName) ?? 0) + 1);
        totalCounts.set(normalizedName, (totalCounts.get(normalizedName) ?? 0) + 1);
        used.add(normalizedName);
      }
    }

    byDate.set(dateKey, used);
  }

  return { roleCounts, totalCounts, byDate };
}

function getLastSundayAssignments(history: Array<{ date: string; mÃºsicos: any }>, targetDate: Date, lookup?: UserLookup) {
  const previousDate = new Date(targetDate);
  previousDate.setDate(targetDate.getDate() - 7);
  const previousDateKey = toDateKey(previousDate);

  const match = history.find((entry) => toDateKey(parseDateKey(entry.date) ?? new Date(entry.date)) === previousDateKey);

  return match?.mÃºsicos ? normalizeMusicos(match.mÃºsicos, lookup) : null;
}

function collectBlockedNamesByRole(schedule: ScheduleMusicos | null) {
  const blockedByRole: Record<ScheduleRole, Set<string>> = {
    minister: new Set(),
    vocal: new Set(),
    teclas: new Set(),
    violao: new Set(),
    batera: new Set(),
    bass: new Set(),
    guita: new Set(),
    sound: new Set(),
  };

  if (!schedule) {
    return blockedByRole;
  }

  for (const role of DEFAULT_ROLE_ORDER) {
    for (const value of schedule[role]) {
      const trimmed = value.trim();
      if (trimmed) {
        blockedByRole[role].add(trimmed);
      }
    }
  }

  return blockedByRole;
}

function fillSundaySchedule(
  users: ActiveUser[],
  roleCounts: Record<ScheduleRole, Map<string, number>>,
  totalCounts: Map<string, number>,
  blockedByRole: Record<ScheduleRole, Set<string>>
) {
  type Candidate = {
    user: ActiveUser;
    id: string;
    roleCount: number;
    totalCount: number;
    flexibility: number;
  };

  const flexibilityByUser = new Map<string, number>();
  for (const user of users) {
    const label = user.id;
    const flexibility = DEFAULT_ROLE_ORDER.filter((role) => matchesRole(user, role)).length;
    flexibilityByUser.set(label, flexibility);
  }

  function getCandidates(role: ScheduleRole, usedThisSunday: Set<string>) {
    return users
      .filter((user) => matchesRole(user, role))
      .filter((user) => !blockedByRole[role].has(user.id))
      .filter((user) => !usedThisSunday.has(user.id))
      .map((user): Candidate => {
        const label = user.id;
        return {
          user,
          id: label,
          roleCount: roleCounts[role].get(label) ?? 0,
          totalCount: totalCounts.get(label) ?? 0,
          flexibility: flexibilityByUser.get(label) ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.roleCount !== b.roleCount) return a.roleCount - b.roleCount;
        if (a.totalCount !== b.totalCount) return a.totalCount - b.totalCount;
        if (a.flexibility !== b.flexibility) return a.flexibility - b.flexibility;
        return a.id.localeCompare(b.id);
      });
  }

  function getNextRole(
    remainingSlots: ScheduleRole[],
    usedThisSunday: Set<string>
  ): { role: ScheduleRole; candidates: Candidate[] } | null {
    let best: { role: ScheduleRole; candidates: Candidate[] } | null = null;

    for (const role of remainingSlots) {
      const candidates = getCandidates(role, usedThisSunday);

      if (best === null || candidates.length < best.candidates.length) {
        best = { role, candidates };
      }

      if (candidates.length === 0) {
        return { role, candidates };
      }
    }

    return best;
  }

  function scoreCandidate(candidate: Candidate, role: ScheduleRole) {
    const roleWeight = role === "minister" ? 1000 : role === "vocal" ? 900 : 800;
    return candidate.roleCount * 1000 + candidate.totalCount * 100 + candidate.flexibility * 10 + roleWeight;
  }

  function cloneAssignment(source: ScheduleMusicos) {
    return cloneMusicos(source);
  }

  function addRoleToAssignment(target: ScheduleMusicos, role: ScheduleRole, label: string) {
    target[role].push(label);
  }

  function removeRoleFromAssignment(target: ScheduleMusicos, role: ScheduleRole) {
    target[role].pop();
  }

  function buildRemainingSlots(remainingSlots: ScheduleRole[], chosenIndex: number) {
    return remainingSlots.filter((_, index) => index !== chosenIndex);
  }

  function backtrack(
    remainingSlots: ScheduleRole[],
    usedThisSunday: Set<string>,
    currentAssignment: ScheduleMusicos
  ): { assignment: ScheduleMusicos; score: number } | null {
    if (remainingSlots.length === 0) {
      return { assignment: cloneAssignment(currentAssignment), score: 0 };
    }

    const next = getNextRole(remainingSlots, usedThisSunday);

    if (!next) {
      return { assignment: cloneAssignment(currentAssignment), score: 0 };
    }

    const { role, candidates } = next;
    const roleIndex = remainingSlots.indexOf(role);
    const nextRemaining = roleIndex >= 0 ? buildRemainingSlots(remainingSlots, roleIndex) : remainingSlots.slice(1);

    if (candidates.length === 0) {
      return backtrack(nextRemaining, usedThisSunday, currentAssignment);
    }

    let bestResult: { assignment: ScheduleMusicos; score: number } | null = null;

    for (const candidate of candidates) {
      addRoleToAssignment(currentAssignment, role, candidate.id);
      usedThisSunday.add(candidate.id);

      const nextResult = backtrack(nextRemaining, usedThisSunday, currentAssignment);

      usedThisSunday.delete(candidate.id);
      removeRoleFromAssignment(currentAssignment, role);

      if (!nextResult) {
        continue;
      }

      const branchScore = scoreCandidate(candidate, role) + nextResult.score;
      if (!bestResult || branchScore < bestResult.score) {
        bestResult = {
          assignment: nextResult.assignment,
          score: branchScore,
        };
      }
    }

    return bestResult;
  }

  const initialSlots: ScheduleRole[] = ["minister", "vocal", "vocal", "teclas", "violao", "batera", "bass", "guita", "sound"];
  const result = backtrack(initialSlots, new Set<string>(), buildEmptyMusicos());

  return {
    assignment: result?.assignment ?? buildEmptyMusicos(),
    missingRole: null as ScheduleRole | null,
  };
}

async function generateMonthlySchedule(month: number, year: number): Promise<GeneratedScheduleResult> {
  const monthId = buildMonthId(month, year);
  const targetMonthStart = new Date(year, month - 1, 1);
  const targetMonthStartKey = toDateKey(targetMonthStart);

  const usersSnapshot = await db
    .collection("users")
    .where("status", "==", UserStatus.Enabled)
    .get();

  const users: ActiveUser[] = usersSnapshot.docs.map((doc) => {
    const data = doc.data() as Partial<ActiveUser> & {
      name?: string;
      nickname?: string | null;
      roles?: string[];
      rolesLower?: string[];
      instruments?: string[];
      canLeadWorship?: boolean;
      status?: string;
    };

    return {
      id: doc.id,
      name: data.name ?? "",
      nickname: data.nickname ?? null,
      status: data.status,
      roles: Array.isArray(data.roles) ? data.roles : [],
      rolesLower: Array.isArray(data.rolesLower) ? data.rolesLower : [],
      instruments: Array.isArray(data.instruments) ? data.instruments : [],
      canLeadWorship: Boolean(data.canLeadWorship),
    };
  });
  const lookup = getUserLookup(users);

  if (users.length === 0) {
    throw new Error("Nenhum usuario ativo encontrado.");
  }

  const allSchedulesSnapshot = await db.collection("schedules").get();
  const allHistoryEntries = allSchedulesSnapshot.docs
    .filter((doc) => doc.id !== monthId)
    .flatMap((doc) => extractHistoryFromDoc(doc.data(), lookup));

  const historicalEntries = allHistoryEntries.filter((entry) => {
    const entryDate = parseDateKey(entry.date);
    if (!entryDate) return false;
    return toDateKey(entryDate) < targetMonthStartKey;
  });

  const { roleCounts, totalCounts } = buildHistoryMaps(historicalEntries);
  const sundays = getSundayDates(month, year);
  const generated: ScheduleEntry[] = [];

  let previousSundayAssignments = getLastSundayAssignments(historicalEntries, targetMonthStart, lookup);

  for (const sunday of sundays) {
    const blockedByRole = collectBlockedNamesByRole(previousSundayAssignments);

    const sundayResult = fillSundaySchedule(users, roleCounts, totalCounts, blockedByRole);

    if (!sundayResult.assignment) {
      throw new Error(`Nao foi possivel montar a escala para ${toDateKey(sunday)}. Falta pessoa para a funcao "${sundayResult.missingRole}".`);
    }

    const musicos = cloneMusicos(sundayResult.assignment);
    generated.push({
      date: toDateKey(sunday),
      musicos,
      musicosIds: cloneMusicos(musicos),
    });

    for (const role of DEFAULT_ROLE_ORDER) {
      for (const label of musicos[role]) {
          roleCounts[role].set(label, (roleCounts[role].get(label) ?? 0) + 1);
          totalCounts.set(label, (totalCounts.get(label) ?? 0) + 1);
      }
    }

    previousSundayAssignments = musicos;
  }

  return {
    monthId,
    sundays: generated,
  };
}

async function loadActiveUsersAndLookup() {
  const usersSnapshot = await db
    .collection("users")
    .where("status", "==", UserStatus.Enabled)
    .get();

  const users: ActiveUser[] = usersSnapshot.docs.map((doc) => {
    const data = doc.data() as Partial<ActiveUser> & {
      name?: string;
      nickname?: string | null;
      roles?: string[];
      rolesLower?: string[];
      instruments?: string[];
      canLeadWorship?: boolean;
      status?: string;
    };

    return {
      id: doc.id,
      name: data.name ?? "",
      nickname: data.nickname ?? null,
      status: data.status,
      roles: Array.isArray(data.roles) ? data.roles : [],
      rolesLower: Array.isArray(data.rolesLower) ? data.rolesLower : [],
      instruments: Array.isArray(data.instruments) ? data.instruments : [],
      canLeadWorship: Boolean(data.canLeadWorship),
    };
  });

  return {
    users,
    lookup: getUserLookup(users),
  };
}

interface SpecialSchedule extends ScheduleMusicos {
  evento: string;
  data: string;
  outfitColor?: string;
}

interface SpecialScheduleDisplay extends Record<ScheduleRole, ScheduleMusicoDisplay[]> {
  evento: string;
  data: string;
  outfitColor?: string;
}

export const getMonthlySchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.params;

    if (!month) {
      res.status(400).json({ message: "MÃªs obrigatÃ³rio" });
      return;
    }

    const docRef = db.collection("schedules").doc(month);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Escala nÃ£o encontrada para esse mÃªs." });
      return;
    }

    const { lookup } = await loadActiveUsersAndLookup();
    const data = docSnap.data();
    const sundays = Array.isArray(data?.sundays) ? data.sundays : [];

    res.json({
      ...data,
      sundays: sundays.map((entry: any) => resolveScheduleForResponse(entry, lookup)),
    });
  } catch (err) {
    console.error("Erro ao buscar escala:", err);
    res.status(500).json({ message: "Erro ao buscar escala", error: String(err) });
  }
};

export const getNextSundaySchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();
    const day = today.getDay(); // 0 = domingo
    const daysUntilSunday = (7 - day) % 7;

    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    nextSunday.setHours(0, 0, 0, 0);

    const formattedMonth = (nextSunday.getMonth() + 1).toString().padStart(2, "0");
    const year = nextSunday.getFullYear();
    const monthId = `${formattedMonth}-${year}`;

    const docRef = db.collection("schedules").doc(monthId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      res.status(404).json({ message: "Documento do mÃªs nÃ£o encontrado." });
      return;
    }

    const { lookup } = await loadActiveUsersAndLookup();
    const data = snapshot.data();
    const sundays = Array.isArray(data?.sundays) ? data.sundays : [];

    const nextSundayISO = nextSunday.toISOString().split('T')[0];

    const matchingSchedule = sundays.find((s: any) => {
      const sundayDate = new Date(s.date).toISOString().split('T')[0];
      return sundayDate === nextSundayISO;
    });

    if (!matchingSchedule) {
      res.status(404).json({ message: "Escala para o prÃ³ximo domingo nÃ£o encontrada." });
      return;
    }

    res.json({
      ...resolveScheduleForResponse(matchingSchedule, lookup),
      date: nextSundayISO,
    });

  } catch (err) {
    console.error("Erro ao buscar escala do prÃ³ximo domingo:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const upsertSchedule = async (req: Request, res: Response): Promise<void> => {
  const body = req.body ?? {};
  const month = body.month;
  const year = body.year;
  const date = body.date;
  const rawMusicos = mergeMusicosPayload(body['músicosIds'] ?? body['musicosIds'] ?? body['músicos'] ?? body['musicos'] ?? {});
  const outfitColor = getOutfitColorPayload(body);

  if (!month || !year || !date) {
    res.status(400).json({ message: 'Parâmetros obrigatórios ausentes.' });
    return;
  }

  const monthId = `${month}-${year}`;
  const docRef = db.collection('schedules').doc(monthId);

  try {
    const docSnap = await docRef.get();
    let sundays = [];
    const { lookup } = await loadActiveUsersAndLookup();
    const normalizedMusicos = normalizeMusicos(rawMusicos, lookup);

    if (docSnap.exists) {
      const data = docSnap.data();
      sundays = data?.sundays || [];

      const toDateOnly = (d: string) => new Date(d).toISOString().slice(0, 10);
      const existingIndex = sundays.findIndex((s: any) => toDateOnly(s.date) === toDateOnly(date));
      const sundayEntry = {
        date,
        outfitColor,
        musicos: normalizedMusicos,
        musicosIds: {
          ...cloneMusicos(normalizedMusicos),
          outfitColor,
        },
      };

      if (existingIndex >= 0) {
        sundays[existingIndex] = sundayEntry;
      } else {
        sundays.push(sundayEntry);
      }
    } else {
      sundays.push({
        date,
        outfitColor,
        musicos: normalizedMusicos,
        musicosIds: {
          ...cloneMusicos(normalizedMusicos),
          outfitColor,
        },
      });
    }

    await docRef.set({ sundays });
    res.status(200).json({ message: 'Escala salva/atualizada com sucesso.' });
  } catch (error) {
    console.error('Erro ao salvar escala:', error);
    res.status(500).json({ message: 'Erro interno', error: String(error) });
  }
};

export const generateMonthlyAutoSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawMonth = req.body?.month ?? req.query?.month ?? new Date().getMonth() + 1;
    const rawYear = req.body?.year ?? req.query?.year ?? new Date().getFullYear();

    const month = Number(rawMonth);
    const year = Number(rawYear);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ message: "Mes invalido." });
      return;
    }

    if (!Number.isInteger(year) || year < 2000) {
      res.status(400).json({ message: "Ano invalido." });
      return;
    }

    const result = await generateMonthlySchedule(month, year);
    const existingSnapshot = await db.collection("schedules").doc(result.monthId).get();
    const existingSundays = existingSnapshot.exists ? (existingSnapshot.data()?.sundays ?? []) : [];
    const outfitColorByDate = new Map<string, string>();

    for (const entry of Array.isArray(existingSundays) ? existingSundays : []) {
      if (typeof entry?.date === "string" && typeof entry?.outfitColor === "string") {
        outfitColorByDate.set(entry.date.slice(0, 10), entry.outfitColor);
      }
    }

    await db.collection("schedules").doc(result.monthId).set({
      sundays: result.sundays.map((entry) => ({
        ...entry,
        musicosIds: {
          ...entry.musicosIds,
          outfitColor: typeof entry.outfitColor === "string" ? entry.outfitColor : ((entry.musicosIds as any)?.outfitColor ?? ""),
        },
        outfitColor: outfitColorByDate.get(entry.date) ?? entry.outfitColor ?? "",
      })),
      generatedAt: new Date().toISOString(),
    });

    res.status(201).json({
      message: "Escala mensal gerada com sucesso.",
      monthId: result.monthId,
      sundays: result.sundays,
    });
  } catch (err) {
    console.error("Erro ao gerar escala mensal:", err);
    res.status(409).json({
      message: "Nao foi possivel gerar a escala automaticamente.",
      error: String(err),
    });
  }
};

export const getSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { lookup } = await loadActiveUsersAndLookup();
    const snapshot = await db.collection("specialSchedules").get();
    const schedules = snapshot.docs.map((doc) => {
      const data = normalizeSpecialSchedule(doc.data(), lookup);
      const displays = resolveSpecialScheduleForResponse(data, lookup);
      const ids = cloneMusicos(data);
      const musicos = resolveMusicosForResponse(data, lookup);
      return {
        id: doc.id,
        ...displays,
        ids: data,
        musicos,
        musicosIds: ids,
        músicos: musicos,
        músicosIds: ids,
      };
    });
    res.status(200).json(schedules);
  } catch (err) {
    console.error("Erro ao buscar escala especial:", err);  
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const postSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const schedules = Array.isArray(req.body?.schedules)
      ? req.body.schedules
      : req.body && typeof req.body === "object"
        ? [req.body]
        : null;

    if (!schedules || schedules.length === 0) {
      res.status(400).json({ message: "Parâmetro 'schedules' inválido ou ausente." });
      return;
    }

    const { lookup } = await loadActiveUsersAndLookup();

    for (const s of schedules) {
      const payload = mergeSpecialSchedulePayload(s);
      if (typeof payload?.evento !== "string" || typeof payload?.data !== "string") {
        res.status(400).json({ message: "Objeto 'SpecialSchedule' inválido." });
        return;
      }
    }

    for (const s of schedules) {
      const payload = mergeSpecialSchedulePayload(s);
      const { id, ids, musicosIds, músicosIds, ...rest } = payload;
      const normalized = normalizeSpecialSchedule(rest, lookup);
      await db.collection("specialSchedules").doc(normalized.data).set({
        ...normalized,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({ message: "Escala especial salva com sucesso." });
  } catch (err) {
    console.error("Erro ao salvar escala especial:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const deleteSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ success: false, error: "ID Ã© obrigatÃ³rio." });
      return;
    }

    const docRef = db.collection("specialSchedules").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Escala especial nÃ£o encontrada." });
      return;
    }

    await docRef.delete();
    res.status(200).json({ message: "Escala especial deletada com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar escala especial:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};


