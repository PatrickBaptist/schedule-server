import assert from "node:assert/strict";
import test from "node:test";
import {
  compareMusicLinksByDateAndOrder,
  isValidScheduleDate,
} from "../utils/musicLinks";

test("valida somente datas reais no formato YYYY-MM-DD", () => {
  assert.equal(isValidScheduleDate("2026-09-23"), true);
  assert.equal(isValidScheduleDate("23/09/2026"), false);
  assert.equal(isValidScheduleDate("2026-02-30"), false);
  assert.equal(isValidScheduleDate(undefined), false);
});

test("ordena por data e depois pela ordem", () => {
  const musicLinks = [
    { scheduleDate: "2026-09-24", order: 1 },
    { scheduleDate: "2026-09-23", order: 2 },
    { scheduleDate: "2026-09-23", order: 1 },
  ];

  musicLinks.sort(compareMusicLinksByDateAndOrder);

  assert.deepEqual(musicLinks, [
    { scheduleDate: "2026-09-23", order: 1 },
    { scheduleDate: "2026-09-23", order: 2 },
    { scheduleDate: "2026-09-24", order: 1 },
  ]);
});

test("mantem musicas antigas sem data no final sem causar erro", () => {
  const musicLinks = [
    { order: 2 },
    { scheduleDate: "2026-09-23", order: 1 },
    { scheduleDate: null, order: 1 },
  ];

  musicLinks.sort(compareMusicLinksByDateAndOrder);

  assert.deepEqual(musicLinks, [
    { scheduleDate: "2026-09-23", order: 1 },
    { scheduleDate: null, order: 1 },
    { order: 2 },
  ]);
});
