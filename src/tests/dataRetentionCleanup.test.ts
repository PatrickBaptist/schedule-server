import { test } from "node:test";
import assert from "node:assert/strict";

// Simulated repository: these tests never connect to Firebase or delete real data.
const documents = new Map<string, Record<string, unknown>>();
const deleted: string[] = [];
function collection(path: string, field?: string, cutoff?: unknown, limit = 400): any {
  return {
    doc: (id: string) => ({
      collection: (name: string) => collection(`${path}/${id}/${name}`),
      get: async () => ({ exists: path.endsWith("/maintenance") }),
    }),
    where: (key: string, _operator: string, value: unknown) => collection(path, key, value, limit),
    orderBy: () => collection(path, field, cutoff, limit),
    limit: (size: number) => collection(path, field, cutoff, size),
    get: async () => {
      const matches = [...documents.entries()].filter(([key, data]) => key.startsWith(`${path}/`) && (!field || (typeof data[field] === "string" && typeof cutoff === "string" && (data[field] as string) < cutoff)));
      const docs = matches.slice(0, limit).map(([key, data]) => ({ ref: { path: key }, data: () => data }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}
require.cache[require.resolve("../repositories/firebaseService")] = {
  exports: { db: { collection, batch: () => {
    const pending: string[] = [];
    return { delete: (ref: { path: string }) => pending.push(ref.path), commit: async () => pending.forEach(path => { documents.delete(path); deleted.push(path); }) };
  } }, admin: { firestore: { Timestamp: { fromDate: (date: Date) => date } } } },
} as any;
require.cache[require.resolve("../services/organizationJobs")] = {
  exports: { forEachActiveOrganization: async (job: (id: string) => Promise<void>) => { for (const id of ["a", "b"]) await job(id); } },
} as any;
const { getRetentionCutoff, runDataRetentionCleanup } = require("../utils/dataRetentionCleanup");

test("retention uses one calendar month, including short and leap months", () => {
  for (const [date, expected] of [["2026-10-12", "2026-09-12"], ["2026-03-31", "2026-02-28"], ["2024-03-31", "2024-02-29"]]) {
    assert.equal(getRetentionCutoff(new Date(`${date}T12:00:00Z`), 1).toISOString().slice(0, 10), expected);
  }
});

test("cleanup removes old music by organization and preserves recent, future and invalid dates", async () => {
  documents.clear(); deleted.length = 0;
  const dates: Record<string, unknown> = { old: "2026-09-11", boundary: "2026-09-12", recent: "2026-10-01", future: "2026-11-01", invalid: "2026-02-30", empty: "", null: null };
  for (const [id, scheduleDate] of Object.entries(dates)) documents.set(`organizations/a/musicLinks/${id}`, { scheduleDate });
  documents.set("organizations/a/musicLinks/missing", {});
  documents.set("organizations/b/musicLinks/old", { scheduleDate: "2026-08-01" });
  documents.set("organizations/disabled/musicLinks/old", { scheduleDate: "2026-08-01" });
  documents.set("organizations/a/allMusicLinks/history", { name: "Preserved history" });
  const date = new Date("2026-10-12T12:00:00Z");
  const first = runDataRetentionCleanup(date);
  assert.equal(runDataRetentionCleanup(date), first);
  const results = await first;
  assert.deepEqual(deleted.sort(), ["organizations/a/musicLinks/old", "organizations/b/musicLinks/old"]);
  assert.equal(results.filter((entry: any) => entry.collection === "musicLinks").reduce((total: number, entry: any) => total + entry.deleted, 0), 2);
  assert.equal(documents.has("organizations/a/allMusicLinks/history"), true);
});

test("cleanup limits deletions to 400 per organization in each execution", async () => {
  documents.clear(); deleted.length = 0;
  for (let index = 0; index < 401; index++) documents.set(`organizations/a/musicLinks/${index}`, { scheduleDate: "2026-08-01" });
  const results = await runDataRetentionCleanup(new Date("2026-10-12T12:00:00Z"));
  assert.equal(deleted.length, 400); assert.equal(documents.size, 1);
  assert.equal(results.find((entry: any) => entry.collection === "musicLinks")?.hasMore, true);
});
