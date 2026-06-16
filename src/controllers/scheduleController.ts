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
  minister: string;
  vocal: string[];
  teclas: string;
  violao: string;
  batera: string;
  bass: string;
  guita: string;
  sound: string;
}

interface ScheduleEntry {
  date: string;
  músicos: ScheduleMusicos;
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
  violao: ["violao", "violão"],
  batera: ["batera", "drums", "bateria"],
  bass: ["bass", "baixo"],
  guita: ["guita", "guitar", "guitarra"],
  sound: ["sound", "som", "audio", "áudio"],
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
    minister: "",
    vocal: [],
    teclas: "",
    violao: "",
    batera: "",
    bass: "",
    guita: "",
    sound: "",
  };
}

function cloneMusicos(value: ScheduleMusicos) {
  return {
    ...value,
    vocal: [...value.vocal],
  };
}

function normalizeVocalList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeMusicos(raw: any): ScheduleMusicos {
  const vocalFromArray = normalizeVocalList(raw?.vocal);
  const vocalFromLegacy = normalizeVocalList([raw?.vocal1, raw?.vocal2].filter(Boolean));

  return {
    minister: typeof raw?.minister === "string" ? raw.minister : "",
    vocal: vocalFromArray.length > 0 ? vocalFromArray : vocalFromLegacy,
    teclas: typeof raw?.teclas === "string" ? raw.teclas : "",
    violao: typeof raw?.violao === "string" ? raw.violao : "",
    batera: typeof raw?.batera === "string" ? raw.batera : "",
    bass: typeof raw?.bass === "string" ? raw.bass : "",
    guita: typeof raw?.guita === "string" ? raw.guita : "",
    sound: typeof raw?.sound === "string" ? raw.sound : "",
  };
}

function extractHistoryFromDoc(data: any) {
  const sundays = Array.isArray(data?.sundays) ? data.sundays : [];

  return sundays
    .map((entry: any) => ({
      date: typeof entry?.date === "string" ? entry.date : null,
      músicos: normalizeMusicos(entry?.músicos ?? entry?.musicos ?? {}),
    }))
    .filter((entry: { date: string | null; músicos: any }) => Boolean(entry.date));
}

function buildHistoryMaps(entries: Array<{ date: string; músicos: any }>) {
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
    const musicians = normalizeMusicos(entry.músicos ?? {});

    const singleRoles: Exclude<ScheduleRole, "vocal">[] = [
      "minister",
      "teclas",
      "violao",
      "batera",
      "bass",
      "guita",
      "sound",
    ];

    for (const role of singleRoles) {
      const rawName = musicians[role];
      if (typeof rawName !== "string" || rawName.trim() === "") {
        continue;
      }

      const name = rawName.trim();
      roleCounts[role].set(name, (roleCounts[role].get(name) ?? 0) + 1);
      totalCounts.set(name, (totalCounts.get(name) ?? 0) + 1);
      used.add(name);
    }

    for (const name of musicians.vocal) {
      const normalizedName = name.trim();
      if (!normalizedName) {
        continue;
      }

      roleCounts.vocal.set(normalizedName, (roleCounts.vocal.get(normalizedName) ?? 0) + 1);
      totalCounts.set(normalizedName, (totalCounts.get(normalizedName) ?? 0) + 1);
      used.add(normalizedName);
    }

    byDate.set(dateKey, used);
  }

  return { roleCounts, totalCounts, byDate };
}

function getLastSundayAssignments(history: Array<{ date: string; músicos: any }>, targetDate: Date) {
  const previousDate = new Date(targetDate);
  previousDate.setDate(targetDate.getDate() - 7);
  const previousDateKey = toDateKey(previousDate);

  const match = history.find((entry) => toDateKey(parseDateKey(entry.date) ?? new Date(entry.date)) === previousDateKey);

  return match?.músicos ? normalizeMusicos(match.músicos) : null;
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

  if (schedule.minister.trim()) {
    blockedByRole.minister.add(schedule.minister.trim());
  }

  for (const name of schedule.vocal) {
    const trimmed = name.trim();
    if (trimmed) {
      blockedByRole.vocal.add(trimmed);
    }
  }

  for (const role of ["teclas", "violao", "batera", "bass", "guita", "sound"] as const) {
    const value = schedule[role];
    if (value.trim()) {
      blockedByRole[role].add(value.trim());
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
    label: string;
    roleCount: number;
    totalCount: number;
    flexibility: number;
  };

  const flexibilityByUser = new Map<string, number>();
  for (const user of users) {
    const label = getUserLabel(user);
    const flexibility = DEFAULT_ROLE_ORDER.filter((role) => matchesRole(user, role)).length;
    flexibilityByUser.set(label, flexibility);
  }

  function getCandidates(role: ScheduleRole, usedThisSunday: Set<string>) {
    return users
      .filter((user) => matchesRole(user, role))
      .filter((user) => !blockedByRole[role].has(getUserLabel(user)))
      .filter((user) => !usedThisSunday.has(getUserLabel(user)))
      .map((user): Candidate => {
        const label = getUserLabel(user);
        return {
          user,
          label,
          roleCount: roleCounts[role].get(label) ?? 0,
          totalCount: totalCounts.get(label) ?? 0,
          flexibility: flexibilityByUser.get(label) ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.roleCount !== b.roleCount) return a.roleCount - b.roleCount;
        if (a.totalCount !== b.totalCount) return a.totalCount - b.totalCount;
        if (a.flexibility !== b.flexibility) return a.flexibility - b.flexibility;
        return a.label.localeCompare(b.label);
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
    return {
      ...source,
      vocal: [...source.vocal],
    };
  }

  function addRoleToAssignment(target: ScheduleMusicos, role: ScheduleRole, label: string) {
    if (role === "vocal") {
      target.vocal.push(label);
      return;
    }

    target[role] = label;
  }

  function removeRoleFromAssignment(target: ScheduleMusicos, role: ScheduleRole) {
    if (role === "vocal") {
      target.vocal.pop();
      return;
    }

    target[role] = "";
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
      addRoleToAssignment(currentAssignment, role, "");
      const result = backtrack(nextRemaining, usedThisSunday, currentAssignment);
      removeRoleFromAssignment(currentAssignment, role);
      return result;
    }

    let bestResult: { assignment: ScheduleMusicos; score: number } | null = null;

    for (const candidate of candidates) {
      addRoleToAssignment(currentAssignment, role, candidate.label);
      usedThisSunday.add(candidate.label);

      const nextResult = backtrack(nextRemaining, usedThisSunday, currentAssignment);

      usedThisSunday.delete(candidate.label);
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

  if (users.length === 0) {
    throw new Error("Nenhum usuario ativo encontrado.");
  }

  const allSchedulesSnapshot = await db.collection("schedules").get();
  const allHistoryEntries = allSchedulesSnapshot.docs
    .filter((doc) => doc.id !== monthId)
    .flatMap((doc) => extractHistoryFromDoc(doc.data()));

  const historicalEntries = allHistoryEntries.filter((entry) => {
    const entryDate = parseDateKey(entry.date);
    if (!entryDate) return false;
    return toDateKey(entryDate) < targetMonthStartKey;
  });

  const { roleCounts, totalCounts } = buildHistoryMaps(historicalEntries);
  const sundays = getSundayDates(month, year);
  const generated: ScheduleEntry[] = [];

  let previousSundayAssignments = getLastSundayAssignments(historicalEntries, targetMonthStart);

  for (const sunday of sundays) {
    const blockedByRole = collectBlockedNamesByRole(previousSundayAssignments);

    const sundayResult = fillSundaySchedule(users, roleCounts, totalCounts, blockedByRole);

    if (!sundayResult.assignment) {
      throw new Error(`Nao foi possivel montar a escala para ${toDateKey(sunday)}. Falta pessoa para a funcao "${sundayResult.missingRole}".`);
    }

    const musicos = cloneMusicos(sundayResult.assignment);
    generated.push({
      date: toDateKey(sunday),
      músicos: musicos,
    });

    for (const role of DEFAULT_ROLE_ORDER) {
      if (role === "vocal") {
        for (const label of musicos.vocal) {
          roleCounts.vocal.set(label, (roleCounts.vocal.get(label) ?? 0) + 1);
          totalCounts.set(label, (totalCounts.get(label) ?? 0) + 1);
        }
        continue;
      }

      const label = musicos[role];
      if (!label) {
        continue;
      }

      roleCounts[role].set(label, (roleCounts[role].get(label) ?? 0) + 1);
      totalCounts.set(label, (totalCounts.get(label) ?? 0) + 1);
    }

    previousSundayAssignments = musicos;
  }

  return {
    monthId,
    sundays: generated,
  };
}

interface SpecialSchedule {
  evento: string;
  data: string;
  vocal1: string;
  vocal2: string;
  teclas: string;
  violao: string;
  batera: string;
  bass: string;
  guita: string;
}

export const getMonthlySchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.params;

    if (!month) {
      res.status(400).json({ message: "Mês obrigatório" });
      return;
    }

    const docRef = db.collection("schedules").doc(month);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Escala não encontrada para esse mês." });
      return;
    }

    res.json(docSnap.data());
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
      res.status(404).json({ message: "Documento do mês não encontrado." });
      return;
    }

    const data = snapshot.data();
    const sundays = Array.isArray(data?.sundays) ? data.sundays : [];

    const nextSundayISO = nextSunday.toISOString().split('T')[0];

    const matchingSchedule = sundays.find((s: any) => {
      const sundayDate = new Date(s.date).toISOString().split('T')[0];
      return sundayDate === nextSundayISO;
    });

    if (!matchingSchedule) {
      res.status(404).json({ message: "Escala para o próximo domingo não encontrada." });
      return;
    }

    res.json({
      date: nextSundayISO,
      ...matchingSchedule.músicos,
    });

  } catch (err) {
    console.error("Erro ao buscar escala do próximo domingo:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const upsertSchedule = async (req: Request, res: Response): Promise<void> => {
  const { month, year, date, músicos } = req.body;

  if (!month || !year || !date || !músicos) {
    res.status(400).json({ message: "Parâmetros obrigatórios ausentes." });
    return;
  }

  const monthId = `${month}-${year}`;
  const docRef = db.collection("schedules").doc(monthId);

  try {
    const docSnap = await docRef.get();
    let sundays = [];
    const normalizedMusicos = normalizeMusicos(músicos);

    if (docSnap.exists) {
      const data = docSnap.data();
      sundays = data?.sundays || [];

      const toDateOnly = (d: string) => new Date(d).toISOString().slice(0, 10);
      const existingIndex = sundays.findIndex((s: any) => toDateOnly(s.date) === toDateOnly(date));

      if (existingIndex >= 0) {
        sundays[existingIndex] = { date, músicos: normalizedMusicos };
      } else {
        sundays.push({ date, músicos: normalizedMusicos });
      }
    } else {
      sundays.push({ date, músicos: normalizedMusicos });
    }

    await docRef.set({ sundays });
    res.status(200).json({ message: "Escala salva/atualizada com sucesso." });

  } catch (error) {
    console.error("Erro ao salvar escala:", error);
    res.status(500).json({ message: "Erro interno", error: String(error) });
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
    await db.collection("schedules").doc(result.monthId).set({
      sundays: result.sundays,
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
    const snapshot = db.collection("specialSchedules").get()
      const schedules = (await snapshot).docs.map(doc =>  ({
          id: doc.id,
          ...doc.data(),
      }));
    res.status(200).json(schedules);
  } catch (err) {
    console.error("Erro ao buscar escala especial:", err);  
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const postSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { schedules } = req.body;
    if (!Array.isArray(schedules)) {
      res.status(400).json({ message: "Parâmetro 'schedules' inválido ou ausente." });
      return;
    }

    for (const s of schedules) {
      if (
        typeof s.evento !== "string" ||
        typeof s.data !== "string" ||
        typeof s.minister !== "string" ||
        typeof s.vocal1 !== "string" ||
        typeof s.vocal2 !== "string" ||
        typeof s.teclas !== "string" ||
        typeof s.violao !== "string" ||
        typeof s.batera !== "string" ||
        typeof s.bass !== "string" ||
        typeof s.guita !== "string" ||
        typeof s.sound !== "string"
      ) {
        res.status(400).json({ message: "Objeto 'SpecialSchedule' inválido." });
        return;
      }
    }

    for (const s of schedules) {
      const { id, ...rest } = s;
      await db.collection("specialSchedules").doc(s.data).set({
        ...rest,
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
      res.status(400).json({ success: false, error: "ID é obrigatório." });
      return;
    }

    const docRef = db.collection("specialSchedules").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Escala especial não encontrada." });
      return;
    }

    await docRef.delete();
    res.status(200).json({ message: "Escala especial deletada com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar escala especial:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};
