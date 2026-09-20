export type MusicLinkOrderingData = {
  scheduleDate?: string | null;
  order?: number | null;
};

export function isValidScheduleDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return parsedDate.getUTCFullYear() === year
    && parsedDate.getUTCMonth() === month - 1
    && parsedDate.getUTCDate() === day;
}

function normalizedOrder(order: number | null | undefined): number {
  return typeof order === "number" && Number.isFinite(order)
    ? order
    : Number.MAX_SAFE_INTEGER;
}

export function compareMusicLinksByDateAndOrder(
  first: MusicLinkOrderingData,
  second: MusicLinkOrderingData
): number {
  const firstDate = first.scheduleDate;
  const secondDate = second.scheduleDate;
  const firstHasDate = isValidScheduleDate(firstDate);
  const secondHasDate = isValidScheduleDate(secondDate);

  if (firstHasDate && secondHasDate) {
    const dateComparison = firstDate.localeCompare(secondDate);
    return dateComparison || normalizedOrder(first.order) - normalizedOrder(second.order);
  }

  if (firstHasDate) return -1;
  if (secondHasDate) return 1;

  return normalizedOrder(first.order) - normalizedOrder(second.order);
}
