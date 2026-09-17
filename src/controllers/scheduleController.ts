import { Request, Response } from "express";
import { db } from "../repositories/firebaseService";
import { UserStatus } from "../enums/UserStatus";
import {
  buildSavedSundays,
  cloneMusicosIds,
  compareScheduleEvents,
  createEmptyMusicosIds,
  EventMusicosIds,
  GenerateScheduleOptions,
  GenerateSelectedScheduleRequest,
  getSundayDateKeys,
  MusicosIds,
  ScheduleEntry,
  ScheduleEvent,
  ScheduleMode,
  ScheduleRole,
  SCHEDULE_ROLES,
  normalizeGenerateSelection,
  normalizeStartTime,
  validateScheduleDate,
  validateSelectedDates,
} from "../services/scheduleGeneration";

type ScheduleMusicos = MusicosIds;

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

interface HistoryEntry {
  date: string;
  musicos: MusicosIds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

const DEFAULT_ROLE_ORDER = SCHEDULE_ROLES;

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
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.slice(0, 10));
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day;

  return isValid ? date : null;
}

function buildMonthId(month: number, year: number) {
  return `${pad(month)}-${year}`;
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

function toEventMusicosIds(musicos: MusicosIds, outfitColor?: string): EventMusicosIds {
  return {
    ...cloneMusicos(musicos),
    ...(typeof outfitColor === "string" ? { outfitColor } : {}),
  };
}

function normalizeSpecialSchedule(raw: unknown, id?: string, lookup?: UserLookup): ScheduleEvent {
  const record = asRecord(raw);
  const outfitColor = getOutfitColorPayload(record);
  const musicos = normalizeMusicos(getMusicosPayload(record), lookup);
  const startTime = typeof record.startTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.startTime)
    ? record.startTime
    : null;

  return {
    ...(id ? { id } : {}),
    evento: typeof record.evento === "string" ? record.evento : "",
    data: typeof record.data === "string" ? record.data : "",
    startTime,
    ...(outfitColor ? { outfitColor } : {}),
    musicosIds: toEventMusicosIds(musicos, outfitColor || undefined),
    ...(typeof record.createdAt === "string" ? { createdAt: record.createdAt } : {}),
    ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
    ...(typeof record.legacySourceId === "string" ? { legacySourceId: record.legacySourceId } : {}),
  };
}

function parseSpecialScheduleInput(raw: unknown, index: number): ScheduleEvent {
  const record = asRecord(raw);
  let data: string;
  let startTime: string | null;
  try {
    data = validateScheduleDate(record.data);
    startTime = normalizeStartTime(record.startTime);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`A escala ${index + 1} e invalida: ${reason}`);
  }

  if (record.evento !== undefined && typeof record.evento !== "string") {
    throw new Error(`A escala ${index + 1} possui evento invalido.`);
  }

  if (record.id !== undefined && (typeof record.id !== "string" || !record.id.trim())) {
    throw new Error(`A escala ${index + 1} possui id invalido.`);
  }

  if (record.outfitColor !== undefined && typeof record.outfitColor !== "string") {
    throw new Error(`A escala ${index + 1} possui outfitColor invalido.`);
  }

  const idsPayload = record["músicosIds"] ?? record.musicosIds;
  if (idsPayload === undefined || !isRecord(idsPayload)) {
    throw new Error(`A escala ${index + 1} deve informar musicosIds.`);
  }

  const nestedColor = asRecord(idsPayload).outfitColor;
  if (nestedColor !== undefined && typeof nestedColor !== "string") {
    throw new Error(`A escala ${index + 1} possui outfitColor invalido em musicosIds.`);
  }

  const outfitColor = typeof record.outfitColor === "string"
    ? record.outfitColor
    : typeof nestedColor === "string" ? nestedColor : undefined;
  const musicos = normalizeMusicos(idsPayload);

  return {
    ...(typeof record.id === "string" ? { id: record.id.trim() } : {}),
    evento: typeof record.evento === "string" ? record.evento : "",
    data,
    startTime,
    ...(outfitColor !== undefined ? { outfitColor } : {}),
    musicosIds: toEventMusicosIds(musicos, outfitColor),
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
  return createEmptyMusicosIds();
}

function cloneMusicos(value: ScheduleMusicos) {
  return cloneMusicosIds(value);
}

function resolveScheduleForResponse(entry: unknown, lookup?: UserLookup) {
  const record = asRecord(entry);
  const musicos = normalizeMusicos(getMusicosPayload(record), lookup);
  const displays = resolveMusicosForResponse(musicos, lookup);

  return {
    ...record,
    date: typeof record.date === "string" ? record.date : "",
    outfitColor: typeof record.outfitColor === "string" ? record.outfitColor : "",
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

function normalizeMusicos(raw: unknown, lookup?: UserLookup): ScheduleMusicos {
  const record = asRecord(raw);
  const vocalFromArray = normalizeRoleList(record.vocal, lookup);
  const vocalFromLegacy = normalizeRoleList([record.vocal1, record.vocal2].filter(Boolean), lookup);

  return {
    minister: normalizeRoleList(record.minister, lookup),
    vocal: vocalFromArray.length > 0 ? vocalFromArray : vocalFromLegacy,
    teclas: normalizeRoleList(record.teclas, lookup),
    violao: normalizeRoleList(record.violao, lookup),
    batera: normalizeRoleList(record.batera, lookup),
    bass: normalizeRoleList(record.bass, lookup),
    guita: normalizeRoleList(record.guita, lookup),
    sound: normalizeRoleList(record.sound, lookup),
  };
}

function mergeMusicosPayload(raw: unknown) {
  const record = asRecord(raw);
  const ids = asRecord(record["músicosIds"] ?? record.musicosIds ?? record["mÃºsicosIds"] ?? record.ids);

  return {
    ...record,
    ...ids,
  };
}

function getMusicosPayload(raw: unknown) {
  const record = asRecord(raw);
  return record["músicos"] ?? record.musicos ?? record["mÃºsicos"] ?? record["músicosIds"] ?? record.musicosIds ?? record["mÃºsicosIds"] ?? record;
}

function getOutfitColorPayload(raw: unknown) {
  const record = asRecord(raw);
  if (typeof record.outfitColor === "string") {
    return record.outfitColor;
  }

  const nestedSources = [
    record["músicosIds"],
    record.musicosIds,
    record["músicos"],
    record.musicos,
    record.ids,
  ];

  for (const source of nestedSources) {
    const nested = asRecord(source);
    if (typeof nested.outfitColor === "string") {
      return nested.outfitColor;
    }
  }

  return "";
}

function normalizeStoredScheduleEntry(raw: unknown, lookup?: UserLookup): ScheduleEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.date !== "string") {
    return null;
  }

  const musicos = normalizeMusicos(getMusicosPayload(record), lookup);
  const outfitColor = getOutfitColorPayload(record);

  return {
    ...record,
    date: record.date.slice(0, 10),
    outfitColor,
    musicos: cloneMusicos(musicos),
    musicosIds: cloneMusicos(musicos),
  };
}

function extractHistoryFromDoc(data: unknown, lookup?: UserLookup): HistoryEntry[] {
  const record = asRecord(data);
  const sundays: unknown[] = Array.isArray(record.sundays) ? record.sundays : [];

  return sundays
    .map((entry): HistoryEntry | null => {
      const schedule = asRecord(entry);
      return typeof schedule.date === "string" ? {
        date: schedule.date.slice(0, 10),
        musicos: normalizeMusicos(getMusicosPayload(schedule), lookup),
      } : null;
    })
    .filter((entry): entry is HistoryEntry => entry !== null);
}

function buildHistoryMaps(entries: HistoryEntry[]) {
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
  for (const entry of entries) {
    const used = new Set<string>();
    const musicians = entry.musicos;

    for (const role of DEFAULT_ROLE_ORDER) {
      for (const name of musicians[role]) {
        const normalizedName = name.trim();
        if (!normalizedName) {
          continue;
        }

        roleCounts[role].set(normalizedName, (roleCounts[role].get(normalizedName) ?? 0) + 1);
        used.add(normalizedName);
      }
    }

    for (const name of used) {
      totalCounts.set(name, (totalCounts.get(name) ?? 0) + 1);
    }
  }

  return { roleCounts, totalCounts };
}

function getLastSundayAssignments(history: HistoryEntry[], targetDate: Date, lookup?: UserLookup) {
  const previousDate = new Date(targetDate);
  previousDate.setDate(targetDate.getDate() - 7);
  const previousDateKey = toDateKey(previousDate);

  const match = history.find((entry) => toDateKey(parseDateKey(entry.date) ?? new Date(entry.date)) === previousDateKey);

  return match?.musicos ? normalizeMusicos(match.musicos, lookup) : null;
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
  blockedByRole: Record<ScheduleRole, Set<string>>,
  initialAssignment: ScheduleMusicos = buildEmptyMusicos(),
  initialSlots: ScheduleRole[] = ["minister", "vocal", "vocal", "teclas", "violao", "batera", "bass", "guita", "sound"],
  allowPartial = false
) {
  let missingRole: ScheduleRole | null = null;
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
  ): { assignment: ScheduleMusicos; score: number; filledSlots: number } | null {
    if (remainingSlots.length === 0) {
      return { assignment: cloneAssignment(currentAssignment), score: 0, filledSlots: 0 };
    }

    const next = getNextRole(remainingSlots, usedThisSunday);

    if (!next) {
      return { assignment: cloneAssignment(currentAssignment), score: 0, filledSlots: 0 };
    }

    const { role, candidates } = next;
    const roleIndex = remainingSlots.indexOf(role);
    const nextRemaining = roleIndex >= 0 ? buildRemainingSlots(remainingSlots, roleIndex) : remainingSlots.slice(1);

    if (candidates.length === 0) {
      missingRole = role;
      return allowPartial
        ? backtrack(nextRemaining, usedThisSunday, currentAssignment)
        : null;
    }

    let bestResult: { assignment: ScheduleMusicos; score: number; filledSlots: number } | null = null;

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
      const branchFilledSlots = nextResult.filledSlots + 1;
      if (
        !bestResult ||
        branchFilledSlots > bestResult.filledSlots ||
        (branchFilledSlots === bestResult.filledSlots && branchScore < bestResult.score)
      ) {
        bestResult = {
          assignment: nextResult.assignment,
          score: branchScore,
          filledSlots: branchFilledSlots,
        };
      }
    }

    return bestResult;
  }

  const usedInitially = new Set(
    DEFAULT_ROLE_ORDER.flatMap((role) => initialAssignment[role])
  );
  const result = backtrack(initialSlots, usedInitially, cloneMusicos(initialAssignment));

  return {
    assignment: result?.assignment ?? null,
    missingRole,
  };
}

async function generateMonthlySchedule(
  month: number,
  year: number,
  options: GenerateScheduleOptions
): Promise<GeneratedScheduleResult> {
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

  const lockedHistory = options.lockedSchedules.map((entry) => ({
    date: entry.date.slice(0, 10),
    musicos: cloneMusicos(entry.musicosIds),
  }));
  const selectedByDate = new Map(
    (options.selectedSchedules ?? []).map((entry) => [entry.date.slice(0, 10), entry])
  );
  const manuallySelectedHistory = options.mode === "fill-empty"
    ? [...selectedByDate.values()].map((entry) => ({
        date: entry.date.slice(0, 10),
        musicos: cloneMusicos(entry.musicosIds),
      }))
    : [];
  const countingHistory = [...historicalEntries, ...lockedHistory, ...manuallySelectedHistory];
  const { roleCounts, totalCounts } = buildHistoryMaps(countingHistory);
  const selectedDates = [...options.selectedDates].sort();
  const generated: ScheduleEntry[] = [];
  const timeline = [...historicalEntries, ...lockedHistory];

  for (const selectedDate of selectedDates) {
    const sunday = parseDateKey(selectedDate);
    if (!sunday) {
      throw new Error(`Data invalida: ${selectedDate}.`);
    }

    const previousSundayAssignments = getLastSundayAssignments(timeline, sunday, lookup);
    const blockedByRole = collectBlockedNamesByRole(previousSundayAssignments);
    const existing = selectedByDate.get(selectedDate);
    const initialAssignment = options.mode === "fill-empty" && existing
      ? cloneMusicos(existing.musicosIds)
      : buildEmptyMusicos();
    const emptyRoles = DEFAULT_ROLE_ORDER.flatMap((role) => {
      if (initialAssignment[role].length > 0) {
        return [];
      }
      return role === "vocal" ? [role, role] : [role];
    });
    const sundayResult = fillSundaySchedule(
      users,
      roleCounts,
      totalCounts,
      blockedByRole,
      initialAssignment,
      emptyRoles
    );

    if (!sundayResult.assignment) {
      throw new Error(`Nao foi possivel montar a escala para ${toDateKey(sunday)}. Falta pessoa para a funcao "${sundayResult.missingRole}".`);
    }

    const musicos = cloneMusicos(sundayResult.assignment);
    generated.push({
      date: selectedDate,
      musicos,
      musicosIds: cloneMusicos(musicos),
    });

    for (const role of DEFAULT_ROLE_ORDER) {
      const generatedForRole = initialAssignment[role].length === 0 ? musicos[role] : [];
      for (const label of generatedForRole) {
          roleCounts[role].set(label, (roleCounts[role].get(label) ?? 0) + 1);
          totalCounts.set(label, (totalCounts.get(label) ?? 0) + 1);
      }
    }

    timeline.push({ date: selectedDate, musicos: cloneMusicos(musicos) });
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
      sundays: sundays.map((entry: unknown) => resolveScheduleForResponse(entry, lookup)),
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

    const matchingSchedule = sundays.find((value: unknown) => {
      const schedule = asRecord(value);
      if (typeof schedule.date !== "string") {
        return false;
      }
      const sundayDate = new Date(schedule.date).toISOString().split('T')[0];
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
      const existingIndex = sundays.findIndex((value: unknown) => {
        const schedule = asRecord(value);
        return typeof schedule.date === "string" && toDateOnly(schedule.date) === toDateOnly(date);
      });
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
    const request = (req.body ?? {}) as Partial<GenerateSelectedScheduleRequest>;
    const rawMonth = request.month ?? req.query?.month ?? new Date().getMonth() + 1;
    const rawYear = request.year ?? req.query?.year ?? new Date().getFullYear();

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

    const mode: ScheduleMode = request.mode ?? "replace";
    if (mode !== "fill-empty" && mode !== "replace") {
      res.status(400).json({ message: "Modo invalido. Use fill-empty ou replace." });
      return;
    }

    let selectedDates: string[];
    try {
      selectedDates = request.dates === undefined
        ? getSundayDateKeys(month, year)
        : validateSelectedDates(request.dates, month, year);
    } catch (validationError) {
      res.status(400).json({ message: String(validationError instanceof Error ? validationError.message : validationError) });
      return;
    }

    const monthId = buildMonthId(month, year);
    const docRef = db.collection("schedules").doc(monthId);
    const selectedDateSet = new Set(selectedDates.map((date) => date.slice(0, 10)));

    const savedSundays = await db.runTransaction(async (transaction) => {
      const existingSnapshot = await transaction.get(docRef);
      const existingData = existingSnapshot.exists ? existingSnapshot.data() : undefined;
      const rawSundays: unknown[] = Array.isArray(existingData?.sundays)
        ? existingData.sundays
        : [];
      const normalizedExisting = rawSundays
        .map((entry) => normalizeStoredScheduleEntry(entry))
        .filter((entry): entry is ScheduleEntry => entry !== null);
      const selectedSchedules = normalizedExisting.filter((entry) =>
        selectedDateSet.has(entry.date.slice(0, 10))
      );
      const lockedSchedules = normalizedExisting.filter((entry) =>
        !selectedDateSet.has(entry.date.slice(0, 10))
      );

      const result = await generateMonthlySchedule(month, year, {
        selectedDates,
        selectedSchedules,
        lockedSchedules,
        mode,
      });
      const normalizedSelectedByDate = new Map(
        selectedSchedules.map((entry) => [entry.date.slice(0, 10), entry])
      );
      const mergeBase = rawSundays
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => {
          const dateKey = typeof entry.date === "string" ? entry.date.slice(0, 10) : "";
          return normalizedSelectedByDate.get(dateKey) ?? entry as ScheduleEntry;
        });
      const finalSundays = buildSavedSundays(mergeBase, result.sundays, selectedDates, mode);

      transaction.set(docRef, {
        sundays: finalSundays,
        generatedAt: new Date().toISOString(),
      }, { merge: true });

      return finalSundays;
    });

    res.status(201).json({
      message: "Escalas selecionadas geradas com sucesso.",
      monthId,
      generatedDates: selectedDates,
      sundays: savedSundays,
    });
  } catch (err) {
    console.error("Erro ao gerar escala mensal:", err);
    res.status(409).json({
      message: "Nao foi possivel gerar a escala automaticamente.",
      error: String(err),
    });
  }
};

class TeamGenerationError extends Error {
  constructor(public readonly scheduleId: string, role: ScheduleRole | null) {
    super(`Nao foi possivel montar uma equipe valida para a escala ${scheduleId}${role ? `: falta pessoa para a funcao ${role}` : ""}.`);
  }
}

function buildSpecialScheduleTeams(
  users: ActiveUser[],
  selectedSchedules: ScheduleEvent[],
  lockedSchedules: ScheduleEvent[],
  mode: ScheduleMode
): ScheduleEvent[] {
  const lockedHistory: HistoryEntry[] = lockedSchedules.map((schedule) => ({
    date: schedule.data,
    musicos: cloneMusicos(schedule.musicosIds),
  }));
  const manualHistory: HistoryEntry[] = mode === "fill-empty"
    ? selectedSchedules.map((schedule) => ({
        date: schedule.data,
        musicos: cloneMusicos(schedule.musicosIds),
      }))
    : [];
  const { roleCounts, totalCounts } = buildHistoryMaps([...lockedHistory, ...manualHistory]);
  const ordered = [...selectedSchedules].sort((a, b) => {
    const dateComparison = a.data.localeCompare(b.data);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    const aTime = a.startTime || "99:99";
    const bTime = b.startTime || "99:99";
    return aTime.localeCompare(bTime) || (a.id ?? "").localeCompare(b.id ?? "");
  });

  return ordered.map((schedule) => {
    const initialAssignment = mode === "fill-empty"
      ? cloneMusicos(schedule.musicosIds)
      : buildEmptyMusicos();
    const emptyRoles = DEFAULT_ROLE_ORDER.flatMap((role) => {
      if (initialAssignment[role].length > 0) {
        return [];
      }
      return role === "vocal" ? [role, role] : [role];
    });
    const result = fillSundaySchedule(
      users,
      roleCounts,
      totalCounts,
      collectBlockedNamesByRole(null),
      initialAssignment,
      emptyRoles,
      true
    );

    if (!result.assignment) {
      throw new TeamGenerationError(schedule.id ?? "sem-id", result.missingRole);
    }

    const generatedIds = cloneMusicos(result.assignment);
    const generatedPeople = new Set<string>();
    for (const role of DEFAULT_ROLE_ORDER) {
      if (initialAssignment[role].length > 0) {
        continue;
      }
      for (const userId of generatedIds[role]) {
        roleCounts[role].set(userId, (roleCounts[role].get(userId) ?? 0) + 1);
        generatedPeople.add(userId);
      }
    }
    for (const userId of generatedPeople) {
      totalCounts.set(userId, (totalCounts.get(userId) ?? 0) + 1);
    }

    return {
      ...schedule,
      musicosIds: toEventMusicosIds(generatedIds, schedule.outfitColor),
    };
  });
}

export const generateSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const rawScheduleIds = body.scheduleIds;
    const rawDates = body.dates;
    let scheduleIds: string[];
    let dates: string[];
    try {
      ({ scheduleIds, dates } = normalizeGenerateSelection(rawScheduleIds, rawDates));
    } catch (validationError) {
      res.status(400).json({
        message: validationError instanceof Error ? validationError.message : String(validationError),
      });
      return;
    }

    const mode = body.mode;
    if (mode !== "fill-empty" && mode !== "replace") {
      res.status(400).json({ message: "mode deve ser fill-empty ou replace." });
      return;
    }

    const { users } = await loadActiveUsersAndLookup();
    if (users.length === 0) {
      res.status(409).json({ message: "Nao foi possivel gerar as escalas: nenhum usuario ativo encontrado." });
      return;
    }

    const selectedIdSet = new Set(scheduleIds);
    const createdAt = new Date().toISOString();
    const newSchedules = dates.map((date): ScheduleEvent => {
      const reference = db.collection("specialSchedules").doc();
      return {
        id: reference.id,
        evento: "",
        data: date,
        startTime: null,
        outfitColor: "",
        musicosIds: toEventMusicosIds(buildEmptyMusicos(), ""),
        createdAt,
        updatedAt: createdAt,
      };
    });
    const newScheduleIds = new Set(newSchedules.flatMap((schedule) => schedule.id ? [schedule.id] : []));
    const generatedSchedules = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(db.collection("specialSchedules"));
      const allSchedules = snapshot.docs.map((doc) =>
        normalizeSpecialSchedule(doc.data(), doc.id)
      );
      const foundIds = new Set(allSchedules.map((schedule) => schedule.id));
      const missingIds = scheduleIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        const error = new Error(`Escalas nao encontradas: ${missingIds.join(", ")}.`);
        error.name = "SchedulesNotFoundError";
        throw error;
      }

      const selected = [
        ...allSchedules.filter((schedule) => schedule.id && selectedIdSet.has(schedule.id)),
        ...newSchedules,
      ];
      const locked = allSchedules.filter((schedule) => !schedule.id || !selectedIdSet.has(schedule.id));
      const generated = buildSpecialScheduleTeams(users, selected, locked, mode);
      const updatedAt = new Date().toISOString();

      for (const schedule of generated) {
        if (!schedule.id) {
          continue;
        }
        const docRef = db.collection("specialSchedules").doc(schedule.id);
        if (newScheduleIds.has(schedule.id)) {
          const { id, ...newScheduleData } = schedule;
          transaction.set(docRef, { ...newScheduleData, updatedAt });
        } else {
          transaction.set(docRef, {
            musicosIds: schedule.musicosIds,
            updatedAt,
          }, { merge: true });
        }
        schedule.updatedAt = updatedAt;
      }

      return generated;
    });

    res.status(200).json({
      message: "Escalas geradas com sucesso.",
      generatedScheduleIds: generatedSchedules.flatMap((schedule) => schedule.id ? [schedule.id] : []),
      schedules: generatedSchedules,
    });
  } catch (error) {
    if (error instanceof TeamGenerationError) {
      res.status(409).json({ message: error.message, scheduleId: error.scheduleId });
      return;
    }
    if (error instanceof Error && error.name === "SchedulesNotFoundError") {
      res.status(404).json({ message: error.message });
      return;
    }

    console.error("Erro ao gerar escalas especiais:", error);
    res.status(500).json({ message: "Erro inesperado ao gerar escalas.", error: String(error) });
  }
};

export const migrateLegacySchedules = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [monthlySnapshot, specialSnapshot] = await Promise.all([
      db.collection("schedules").get(),
      db.collection("specialSchedules").get(),
    ]);
    const existingLegacySources = new Set(
      specialSnapshot.docs
        .map((doc) => doc.data().legacySourceId)
        .filter((value): value is string => typeof value === "string")
    );
    const pending: Array<{ ref: FirebaseFirestore.DocumentReference; data: Omit<ScheduleEvent, "id"> }> = [];
    let skipped = 0;
    let totalLegacy = 0;
    const now = new Date().toISOString();

    for (const monthlyDoc of monthlySnapshot.docs) {
      const monthlyData = asRecord(monthlyDoc.data());
      const sundays: unknown[] = Array.isArray(monthlyData.sundays) ? monthlyData.sundays : [];

      sundays.forEach((rawSchedule) => {
        totalLegacy += 1;
        const record = asRecord(rawSchedule);
        const rawDate = typeof record.date === "string" ? record.date.slice(0, 10) : "";
        const legacySourceId = `${monthlyDoc.id}:${rawDate}`;
        if (existingLegacySources.has(legacySourceId)) {
          skipped += 1;
          return;
        }

        let data: string;
        try {
          data = validateScheduleDate(rawDate);
        } catch {
          throw new Error(`Data invalida na escala legada ${legacySourceId}.`);
        }

        const outfitColor = getOutfitColorPayload(record);
        const musicos = normalizeMusicos(getMusicosPayload(record));
        pending.push({
          ref: db.collection("specialSchedules").doc(),
          data: {
            evento: "",
            data,
            startTime: null,
            ...(outfitColor ? { outfitColor } : {}),
            musicosIds: toEventMusicosIds(musicos, outfitColor || undefined),
            createdAt: now,
            updatedAt: now,
            legacySourceId,
          },
        });
        existingLegacySources.add(legacySourceId);
      });
    }

    for (let offset = 0; offset < pending.length; offset += 450) {
      const batch = db.batch();
      for (const item of pending.slice(offset, offset + 450)) {
        batch.set(item.ref, item.data);
      }
      await batch.commit();
    }

    const verificationSnapshot = await db.collection("specialSchedules").get();
    const migratedSources = new Set(
      verificationSnapshot.docs
        .map((doc) => doc.data().legacySourceId)
        .filter((value): value is string => typeof value === "string")
    );
    const missingAfterMigration = [...existingLegacySources].filter((source) => !migratedSources.has(source));
    if (missingAfterMigration.length > 0) {
      throw new Error(`Falha ao confirmar migracao de: ${missingAfterMigration.join(", ")}.`);
    }

    res.status(200).json({
      message: "Migracao concluida e verificada; os documentos antigos nao foram excluidos.",
      totalLegacy,
      migrated: pending.length,
      skipped,
      verified: true,
    });
  } catch (error) {
    console.error("Erro ao migrar escalas antigas:", error);
    res.status(500).json({ message: "Erro ao migrar escalas antigas.", error: String(error) });
  }
};

export const getSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await db.collection("specialSchedules").get();
    const schedules = snapshot.docs
      .map((doc) => normalizeSpecialSchedule(doc.data(), doc.id))
      .sort(compareScheduleEvents);
    res.status(200).json(schedules);
  } catch (err) {
    console.error("Erro ao buscar escala especial:", err);  
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const postSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const schedules: unknown[] | null = Array.isArray(body.schedules)
      ? body.schedules
      : isRecord(req.body) ? [req.body] : null;

    if (!schedules || schedules.length === 0) {
      res.status(400).json({ message: "Parâmetro 'schedules' inválido ou ausente." });
      return;
    }

    let parsedSchedules: ScheduleEvent[];
    try {
      parsedSchedules = schedules.map((schedule, index) => parseSpecialScheduleInput(schedule, index));
    } catch (validationError) {
      res.status(400).json({
        message: validationError instanceof Error ? validationError.message : String(validationError),
      });
      return;
    }

    const batch = db.batch();
    const now = new Date().toISOString();
    const savedIds: Array<{ id: string }> = [];
    const idsToUpdate = parsedSchedules.flatMap((schedule) => schedule.id ? [schedule.id] : []);

    if (idsToUpdate.length > 0) {
      const updateSnapshots = await db.getAll(
        ...idsToUpdate.map((id) => db.collection("specialSchedules").doc(id))
      );
      const missingIds = updateSnapshots
        .filter((snapshot) => !snapshot.exists)
        .map((snapshot) => snapshot.id);
      if (missingIds.length > 0) {
        res.status(404).json({ message: `Escalas nao encontradas: ${missingIds.join(", ")}.` });
        return;
      }
    }

    for (const schedule of parsedSchedules) {
      const docRef = schedule.id
        ? db.collection("specialSchedules").doc(schedule.id)
        : db.collection("specialSchedules").doc();
      const { id, ...scheduleData } = schedule;

      if (id) {
        batch.set(docRef, { ...scheduleData, updatedAt: now }, { merge: true });
      } else {
        batch.set(docRef, { ...scheduleData, createdAt: now, updatedAt: now });
      }
      savedIds.push({ id: docRef.id });
    }

    await batch.commit();

    res.status(201).json({ message: "Escalas salvas com sucesso.", schedules: savedIds });
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


