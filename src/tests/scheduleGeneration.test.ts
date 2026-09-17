import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSavedSundays,
  createEmptyMusicosIds,
  getSundayDateKeys,
  MusicosIds,
  ScheduleEntry,
  validateSelectedDates,
} from "../services/scheduleGeneration";

function entry(
  date: string,
  roles: Partial<MusicosIds> = {},
  outfitColor?: string
): ScheduleEntry {
  const ids = { ...createEmptyMusicosIds(), ...roles };
  return {
    date,
    ...(outfitColor === undefined ? {} : { outfitColor }),
    musicos: { ...ids },
    musicosIds: { ...ids },
  };
}

test("gera uma unica data", () => {
  const generated = entry("2026-09-13", { minister: ["m1"] });
  const saved = buildSavedSundays([], [generated], ["2026-09-13"], "replace");

  assert.deepEqual(saved, [{ ...generated, outfitColor: "" }]);
});

test("gera varias datas", () => {
  const generated = [
    entry("2026-09-13", { minister: ["m1"] }),
    entry("2026-09-20", { minister: ["m2"] }),
  ];
  const saved = buildSavedSundays(
    [],
    generated,
    ["2026-09-13", "2026-09-20"],
    "replace"
  );

  assert.deepEqual(saved.map((schedule) => schedule.date), ["2026-09-13", "2026-09-20"]);
});

test("preserva datas nao selecionadas", () => {
  const locked = entry("2026-09-06", { minister: ["locked"] }, "azul");
  const selected = entry("2026-09-13", { minister: ["old"] });
  const generated = entry("2026-09-13", { minister: ["new"] });
  const saved = buildSavedSundays(
    [locked, selected],
    [generated],
    ["2026-09-13"],
    "replace"
  );

  assert.strictEqual(saved[0], locked);
  assert.deepEqual(saved[0], locked);
});

test("preenche somente funcoes vazias", () => {
  const existing = entry("2026-09-13", {
    minister: ["manual-minister"],
    vocal: [],
  });
  const generated = entry("2026-09-13", {
    minister: ["generated-minister"],
    vocal: ["generated-vocal-1", "generated-vocal-2"],
  });
  const [saved] = buildSavedSundays(
    [existing],
    [generated],
    ["2026-09-13"],
    "fill-empty"
  );

  assert.deepEqual(saved.musicosIds.minister, ["manual-minister"]);
  assert.deepEqual(saved.musicosIds.vocal, ["generated-vocal-1", "generated-vocal-2"]);
});

test("substitui uma escala no modo replace", () => {
  const existing = entry("2026-09-13", { minister: ["old"] });
  const generated = entry("2026-09-13", { minister: ["new"] });
  const [saved] = buildSavedSundays(
    [existing],
    [generated],
    ["2026-09-13"],
    "replace"
  );

  assert.deepEqual(saved.musicosIds.minister, ["new"]);
});

test("preserva outfitColor da data selecionada", () => {
  const existing = entry("2026-09-13T00:00:00.000Z", { minister: ["old"] }, "verde");
  const generated = entry("2026-09-13", { minister: ["new"] });
  const [saved] = buildSavedSundays(
    [existing],
    [generated],
    ["2026-09-13"],
    "replace"
  );

  assert.equal(saved.outfitColor, "verde");
  assert.equal(saved.date, "2026-09-13");
});

test("rejeita uma segunda-feira", () => {
  assert.throws(
    () => validateSelectedDates(["2026-09-14"], 9, 2026),
    /nao e um domingo/
  );
});

test("rejeita data de outro mes", () => {
  assert.throws(
    () => validateSelectedDates(["2026-10-04"], 9, 2026),
    /nao pertence ao mes e ano/
  );
});

test("mantem o comportamento antigo quando dates nao e enviado", () => {
  const selectedDates = getSundayDateKeys(9, 2026);
  const generated = selectedDates.map((date, index) =>
    entry(date, { minister: [`minister-${index}`] })
  );
  const saved = buildSavedSundays([], generated, selectedDates, "replace");

  assert.deepEqual(selectedDates, [
    "2026-09-06",
    "2026-09-13",
    "2026-09-20",
    "2026-09-27",
  ]);
  assert.deepEqual(saved.map((schedule) => schedule.date), selectedDates);
});
