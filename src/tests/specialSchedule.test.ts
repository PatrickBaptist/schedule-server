import assert from "node:assert/strict";
import test from "node:test";
import {
  compareScheduleEvents,
  createEmptyMusicosIds,
  normalizeGenerateSelection,
  normalizeStartTime,
  ScheduleEvent,
  validateScheduleDate,
} from "../services/scheduleGeneration";

function schedule(
  id: string,
  data: string,
  startTime: string | null,
  evento: string
): ScheduleEvent {
  return {
    id,
    data,
    startTime,
    evento,
    musicosIds: createEmptyMusicosIds(),
  };
}

test("aceita qualquer dia da semana no calendario unificado", () => {
  assert.equal(validateScheduleDate("2026-09-14"), "2026-09-14");
});

test("rejeita uma data inexistente", () => {
  assert.throws(() => validateScheduleDate("2026-02-30"), /Data invalida/);
});

test("aceita horario nulo ou vazio e normaliza para null", () => {
  assert.equal(normalizeStartTime(null), null);
  assert.equal(normalizeStartTime(""), null);
});

test("rejeita horario fora do formato HH:mm", () => {
  assert.throws(() => normalizeStartTime("25:00"), /formato HH:mm/);
  assert.throws(() => normalizeStartTime("9:00"), /formato HH:mm/);
});

test("ordena por data, horario e evento, deixando sem horario por ultimo", () => {
  const schedules = [
    schedule("d", "2026-09-28", "08:00", "D"),
    schedule("c", "2026-09-27", null, "C"),
    schedule("b", "2026-09-27", "19:00", "B"),
    schedule("a", "2026-09-27", "09:00", "A"),
  ];

  schedules.sort(compareScheduleEvents);

  assert.deepEqual(schedules.map((item) => item.id), ["a", "b", "c", "d"]);
});

test("mantem duas escalas diferentes na mesma data", () => {
  const schedules = [
    schedule("manha", "2026-09-27", "09:00", ""),
    schedule("noite", "2026-09-27", "19:00", ""),
  ];

  schedules.sort(compareScheduleEvents);

  assert.equal(schedules.length, 2);
  assert.deepEqual(schedules.map((item) => item.id), ["manha", "noite"]);
});

test("geracao aceita somente escala existente", () => {
  assert.deepEqual(normalizeGenerateSelection(["id-1"], []), {
    scheduleIds: ["id-1"],
    dates: [],
  });
});

test("geracao aceita somente data nova", () => {
  assert.deepEqual(normalizeGenerateSelection([], ["2026-09-28"]), {
    scheduleIds: [],
    dates: ["2026-09-28"],
  });
});

test("geracao aceita escala existente e data nova e remove duplicados", () => {
  assert.deepEqual(
    normalizeGenerateSelection(["id-1", " id-1 "], ["2026-09-28", "2026-09-28"]),
    { scheduleIds: ["id-1"], dates: ["2026-09-28"] }
  );
});

test("geracao rejeita quando nenhuma escala ou data foi selecionada", () => {
  assert.throws(
    () => normalizeGenerateSelection([], []),
    /Selecione pelo menos uma escala existente ou uma nova data/
  );
});

test("geracao rejeita data inexistente ou fora do formato exato", () => {
  assert.throws(() => normalizeGenerateSelection([], ["2026-02-31"]), /Data invalida/);
  assert.throws(() => normalizeGenerateSelection([], ["28\/09\/2026"]), /YYYY-MM-DD/);
  assert.throws(() => normalizeGenerateSelection([], ["2026-09-28T12:00:00Z"]), /YYYY-MM-DD/);
});
