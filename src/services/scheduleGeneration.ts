export type ScheduleMode = "fill-empty" | "replace";

export type ScheduleRole =
  | "minister"
  | "vocal"
  | "teclas"
  | "violao"
  | "batera"
  | "bass"
  | "guita"
  | "sound";

export interface MusicosIds {
  minister: string[];
  vocal: string[];
  teclas: string[];
  violao: string[];
  batera: string[];
  bass: string[];
  guita: string[];
  sound: string[];
}

export interface EventMusicosIds extends MusicosIds {
  outfitColor?: string;
}

export interface ScheduleEvent {
  id?: string;
  evento: string;
  data: string;
  startTime?: string | null;
  outfitColor?: string;
  musicosIds: EventMusicosIds;
  createdAt?: string;
  updatedAt?: string;
  legacySourceId?: string;
}

export interface ScheduleEntry {
  date: string;
  outfitColor?: string;
  musicos: MusicosIds;
  musicosIds: MusicosIds;
  [key: string]: unknown;
}

export interface GenerateScheduleOptions {
  selectedDates: string[];
  lockedSchedules: ScheduleEntry[];
  selectedSchedules?: ScheduleEntry[];
  mode: ScheduleMode;
}

export interface GenerateSelectedScheduleRequest {
  month: number;
  year: number;
  dates?: string[];
  mode?: ScheduleMode;
}

export const SCHEDULE_ROLES: ScheduleRole[] = [
  "minister",
  "vocal",
  "teclas",
  "violao",
  "batera",
  "bass",
  "guita",
  "sound",
];

export function createEmptyMusicosIds(): MusicosIds {
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

export function cloneMusicosIds(value: MusicosIds): MusicosIds {
  return Object.fromEntries(
    SCHEDULE_ROLES.map((role) => [role, [...value[role]]])
  ) as unknown as MusicosIds;
}

export function getSundayDateKeys(month: number, year: number): string[] {
  const dates: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 0) {
      dates.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }

  return dates;
}

export function validateSelectedDates(value: unknown, month: number, year: number): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("O campo dates deve ser um array nao vazio.");
  }

  const normalizedDates: string[] = [];
  const seen = new Set<string>();

  for (const rawDate of value) {
    if (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      throw new Error("Todas as datas devem usar o formato YYYY-MM-DD.");
    }

    const [dateYear, dateMonth, dateDay] = rawDate.split("-").map(Number);
    const date = new Date(Date.UTC(dateYear, dateMonth - 1, dateDay));
    const isRealDate =
      date.getUTCFullYear() === dateYear &&
      date.getUTCMonth() + 1 === dateMonth &&
      date.getUTCDate() === dateDay;

    if (!isRealDate) {
      throw new Error(`Data invalida: ${rawDate}.`);
    }

    if (dateMonth !== month || dateYear !== year) {
      throw new Error(`A data ${rawDate} nao pertence ao mes e ano informados.`);
    }

    if (date.getUTCDay() !== 0) {
      throw new Error(`A data ${rawDate} nao e um domingo.`);
    }

    if (seen.has(rawDate)) {
      throw new Error(`A data ${rawDate} foi enviada mais de uma vez.`);
    }

    seen.add(rawDate);
    normalizedDates.push(rawDate);
  }

  return normalizedDates.sort();
}

export function validateScheduleDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("A data deve usar o formato YYYY-MM-DD.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;

  if (!isRealDate) {
    throw new Error(`Data invalida: ${value}.`);
  }

  return value;
}

export function normalizeStartTime(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("O horario deve usar o formato HH:mm.");
  }

  return value;
}

export function normalizeGenerateSelection(
  rawScheduleIds: unknown,
  rawDates: unknown
): { scheduleIds: string[]; dates: string[] } {
  const scheduleIds = Array.isArray(rawScheduleIds)
    ? [...new Set(
        rawScheduleIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean)
      )]
    : [];
  const rawStringDates = Array.isArray(rawDates)
    ? rawDates.filter((date): date is string => typeof date === "string")
    : [];
  const dates = [...new Set(rawStringDates.map((date) => date.slice(0, 10)).filter(Boolean))];

  if (scheduleIds.length === 0 && dates.length === 0) {
    throw new Error("Selecione pelo menos uma escala existente ou uma nova data.");
  }

  for (const rawDate of rawStringDates) {
    if (rawDate !== rawDate.slice(0, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      throw new Error(`Data invalida: ${rawDate}. Use o formato YYYY-MM-DD.`);
    }
    validateScheduleDate(rawDate);
  }

  return { scheduleIds, dates };
}

export function compareScheduleEvents(a: ScheduleEvent, b: ScheduleEvent): number {
  const dateComparison = a.data.localeCompare(b.data);
  if (dateComparison !== 0) {
    return dateComparison;
  }

  const aHasTime = typeof a.startTime === "string" && a.startTime.length > 0;
  const bHasTime = typeof b.startTime === "string" && b.startTime.length > 0;
  if (aHasTime !== bHasTime) {
    return aHasTime ? -1 : 1;
  }

  if (aHasTime && bHasTime) {
    const timeComparison = (a.startTime as string).localeCompare(b.startTime as string);
    if (timeComparison !== 0) {
      return timeComparison;
    }
  }

  return a.evento.localeCompare(b.evento);
}

function mergeFillEmpty(existing: MusicosIds, generated: MusicosIds): MusicosIds {
  return Object.fromEntries(
    SCHEDULE_ROLES.map((role) => [
      role,
      existing[role].length > 0 ? [...existing[role]] : [...generated[role]],
    ])
  ) as unknown as MusicosIds;
}

export function buildSavedSundays(
  existingSundays: ScheduleEntry[],
  generatedSundays: ScheduleEntry[],
  selectedDates: string[],
  mode: ScheduleMode
): ScheduleEntry[] {
  const selected = new Set(selectedDates.map((date) => date.slice(0, 10)));
  const generatedByDate = new Map(
    generatedSundays.map((entry) => [entry.date.slice(0, 10), entry])
  );
  const existingByDate = new Map(
    existingSundays.map((entry) => [entry.date.slice(0, 10), entry])
  );

  const mergeEntry = (dateKey: string, generated: ScheduleEntry): ScheduleEntry => {
    const existing = existingByDate.get(dateKey);
    const generatedIds = cloneMusicosIds(generated.musicosIds);
    const finalIds = existing && mode === "fill-empty"
      ? mergeFillEmpty(existing.musicosIds, generatedIds)
      : generatedIds;
    const generatedHasColor = Object.prototype.hasOwnProperty.call(generated, "outfitColor")
      && typeof generated.outfitColor === "string";
    const outfitColor = generatedHasColor
      ? generated.outfitColor
      : existing?.outfitColor ?? "";

    return {
      ...(existing ?? {}),
      ...generated,
      date: generated.date.slice(0, 10),
      outfitColor,
      musicos: cloneMusicosIds(finalIds),
      musicosIds: cloneMusicosIds(finalIds),
    };
  };

  const saved = existingSundays.map((entry) => {
    const dateKey = entry.date.slice(0, 10);
    if (!selected.has(dateKey)) {
      return entry;
    }

    const generated = generatedByDate.get(dateKey);
    return generated ? mergeEntry(dateKey, generated) : entry;
  });

  const savedDateKeys = new Set(saved.map((entry) => entry.date.slice(0, 10)));
  for (const dateKey of selectedDates.map((date) => date.slice(0, 10))) {
    const generated = generatedByDate.get(dateKey);
    if (generated && !savedDateKeys.has(dateKey)) {
      saved.push(mergeEntry(dateKey, generated));
      savedDateKeys.add(dateKey);
    }
  }

  return saved;
}
