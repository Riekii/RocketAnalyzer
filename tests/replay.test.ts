import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTime,
  MAX_REPLAY_BYTES,
  normalizeReplay,
  ReplayValidationError,
  shootingPercentage,
  teamTotal,
} from "../src/lib/replay.ts";
import { getImprovementSummary, getInsights, radarValues, teamShooting } from "../src/lib/analysis.ts";
import { demoReplay } from "../src/lib/demo.ts";

function fixture(properties: Record<string, unknown> = {}) {
  return {
    game_type: "TAGame.Replay_Soccar_TA",
    properties: {
      TeamSize: 1,
      Team0Score: 1,
      Team1Score: 0,
      RecordFPS: 30,
      NumFrames: 9000,
      PlayerStats: [
        { Name: "Azul", Team: 0, Score: 220, Goals: 1, Shots: 4, Assists: 0, Saves: 1 },
        { Name: "Naranja", Team: 1, Score: 100, Goals: 0, Shots: 2, Assists: 0, Saves: 2 },
      ],
      Goals: [{ PlayerName: "Azul", PlayerTeam: 0, frame: 900 }],
      ...properties,
    },
  };
}

test("normaliza estadísticas, marcador cero, duración y goles reales", () => {
  const replay = normalizeReplay(fixture(), "partida.replay", "test");
  assert.equal(replay.id, "test");
  assert.equal(replay.title, "partida");
  assert.equal(replay.demo, false);
  assert.equal(replay.teamSize, 1);
  assert.deepEqual(replay.scores, [1, 0]);
  assert.equal(replay.duration, 300);
  assert.equal(replay.players[0].shooting, 25);
  assert.equal(replay.players[1].goals, 0);
  assert.equal(replay.goals[0].seconds, 30);
  assert.deepEqual(replay.warnings, []);
});

test("rechaza datos ajenos a Rocket League y juegos no compatibles", () => {
  for (const raw of [null, [], {}, { ...fixture(), game_type: "Otro" }]) {
    assert.throws(() => normalizeReplay(raw, "x.replay", "x"), ReplayValidationError);
  }
});

test("sitúa los goles con el tiempo real de los fotogramas, no con los FPS nominales", () => {
  const replay = normalizeReplay({
    ...fixture({ Goals: [{ PlayerName: "Azul", PlayerTeam: 0, frame: 2 }] }),
    network_frames: { frames: [{ time: 12.5 }, { time: 12.54 }, { time: 14.875 }] },
  }, "variable.replay", "test");
  assert.equal(replay.goals[0].seconds, 2.375);
});

test("no inventa tiempos de gol si el fotograma de red falta o tiene tiempo inválido", () => {
  for (const frames of [[], [{ time: 10 }], [{ time: 10 }, { time: 9 }], [{ time: 10 }, { time: null }]]) {
    const replay = normalizeReplay({
      ...fixture({ Goals: [{ PlayerName: "Azul", PlayerTeam: 0, frame: 1 }] }),
      network_frames: { frames },
    }, "partial.replay", "test");
    assert.equal(replay.goals[0].seconds, null);
  }
});

test("rechaza cabeceras sin jugadores, registros dañados y arrays excesivos", () => {
  for (const PlayerStats of [undefined, [], [null], Array(65).fill({})]) {
    assert.throws(() => normalizeReplay(fixture({ PlayerStats }), "x.replay", "x"), ReplayValidationError);
  }
});

test("no transforma estadísticas ausentes o inválidas en ceros", () => {
  const replay = normalizeReplay(fixture({
    PlayerStats: [{ Name: "Uno", Team: 0, Score: -1, Goals: undefined, Shots: "4", Saves: NaN, Assists: 1.5 }],
  }), "x.replay", "x");
  const player = replay.players[0];
  assert.equal(player.score, null);
  assert.equal(player.goals, null);
  assert.equal(player.shots, null);
  assert.equal(player.saves, null);
  assert.equal(player.assists, null);
  assert.equal(player.shooting, null);
  assert.ok(replay.warnings.some((warning) => warning.includes("N/D")));
});

test("conserva nombres Unicode y no interpreta HTML como código", () => {
  const replay = normalizeReplay(fixture({
    PlayerStats: [{ Name: "  日本 🚀 <script>  ", Team: 0, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0 }],
  }), "x.replay", "x");
  assert.equal(replay.players[0].name, "日本 🚀 <script>");
});

test("no divide por cero ni inventa tiempos cuando no existen FPS", () => {
  for (const RecordFPS of [undefined, 0, -30, Infinity]) {
    const replay = normalizeReplay(fixture({ RecordFPS }), "x.replay", "x");
    assert.equal(replay.duration, null);
    assert.equal(replay.goals[0].seconds, null);
  }
  assert.equal(shootingPercentage(0, 0), null);
  assert.equal(shootingPercentage(null, 4), null);
  assert.equal(shootingPercentage(0, 4), 0);
});

test("ordena eventos por fotograma y advierte si hay eventos incompletos", () => {
  const replay = normalizeReplay(fixture({
    Goals: [
      { PlayerName: "B", PlayerTeam: 1, frame: 1800 },
      null,
      { PlayerName: "A", PlayerTeam: 0, frame: 900 },
      { PlayerName: "C", PlayerTeam: 7, frame: 30 },
    ],
  }), "x.replay", "x");
  assert.deepEqual(replay.goals.map((goal) => goal.frame), [900, 1800]);
  assert.equal(replay.warnings.filter((warning) => warning.includes("evento de gol incompleto")).length, 1);
  assert.ok(replay.warnings.some((warning) => warning.includes("no coincide")));
});

test("marca ausencia de cronología y de marcador sin sumar jugadores que abandonaron", () => {
  const replay = normalizeReplay(fixture({ Goals: undefined, Team1Score: undefined }), "x.replay", "x");
  assert.deepEqual(replay.goals, []);
  assert.equal(replay.scores[1], null);
  assert.ok(replay.warnings.some((warning) => warning.includes("cronología")));
  assert.ok(replay.warnings.some((warning) => warning.includes("marcador oficial")));
});

test("excluye espectadores con aviso y rechaza una repetición sin equipos válidos", () => {
  const replay = normalizeReplay(fixture({
    PlayerStats: [
      { Name: "Espectador", Team: 255 },
      { Name: "Jugador", Team: 0, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0 },
    ],
  }), "x.replay", "x");
  assert.equal(replay.players.length, 1);
  assert.ok(replay.warnings.some((warning) => warning.includes("espectador")));
  assert.throws(() => normalizeReplay(fixture({
    PlayerStats: [{ Name: "Espectador", Team: 255 }],
  }), "x.replay", "x"), ReplayValidationError);
});

test("mantiene identificadores únicos aunque dos jugadores tengan el mismo nombre", () => {
  const replay = normalizeReplay(fixture({
    PlayerStats: [{ Name: "Igual", Team: 0 }, { Name: "Igual", Team: 0 }],
  }), "x.replay", "x");
  assert.notEqual(replay.players[0].id, replay.players[1].id);
});

test("los totales incompletos son N/D y el radar no contiene NaN", () => {
  const replay = normalizeReplay(fixture({
    PlayerStats: [{ Name: "Uno", Team: 0, Shots: 3 }, { Name: "Dos", Team: 0, Goals: 1 }],
  }), "x.replay", "x");
  assert.equal(teamTotal(replay.players, 0, "goals"), null);
  assert.equal(teamTotal(replay.players, 0, "shots"), null);
  assert.equal(teamTotal(replay.players, 1, "saves"), null);
  assert.equal(teamShooting(replay, 0), null);
  assert.ok(radarValues(replay.players[0], replay).every(Number.isFinite));
});

test("el radar normaliza cada eje al mejor valor de la partida", () => {
  const replay = normalizeReplay(fixture(), "x.replay", "x");
  assert.deepEqual(radarValues(replay.players[0], replay), [1, 1, 0, 0.5, 1]);
});

test("no emite consejos de precisión con una muestra menor de cuatro tiros", () => {
  const player = { ...demoReplay.players[0], goals: 1, shots: 3, shooting: 33 };
  const insights = getInsights(player, demoReplay);
  assert.ok(!insights.some((insight) => insight.title.includes("tiros")));
});

test("aplica el umbral declarado de conversión al 30 % con al menos cuatro tiros", () => {
  const base = { ...demoReplay.players[0], shots: 10 };
  const low = getInsights({ ...base, goals: 2, shooting: 20 }, demoReplay);
  const high = getInsights({ ...base, goals: 3, shooting: 30 }, demoReplay);
  assert.ok(low.some((insight) => insight.kind === "focus" && insight.title.includes("tiros")));
  assert.ok(high.some((insight) => insight.kind === "positive" && insight.title.includes("conversión")));
});

test("no cruza el umbral del 30 % por redondear el porcentaje mostrado", () => {
  const player = { ...demoReplay.players[0], goals: 59, shots: 200, shooting: 30 };
  const insights = getInsights(player, demoReplay);
  assert.ok(insights.some((insight) => insight.kind === "focus" && insight.title.includes("tiros")));
  assert.ok(!insights.some((insight) => insight.title === "Buena conversión de tiros"));
});

test("no atribuye participación imposible ni inventa observaciones sin datos", () => {
  const player = {
    ...demoReplay.players[0],
    goals: 5, assists: 1, saves: null, shots: null, shooting: null,
  };
  assert.ok(!getInsights(player, demoReplay).some((insight) => insight.title.includes("participación")));
  const insights = getInsights({ ...player, goals: null, assists: null }, demoReplay);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].title, "Necesitamos más contexto");
});

test("el ejemplo está marcado y su cronología coincide con el marcador", () => {
  assert.equal(demoReplay.demo, true);
  assert.equal(demoReplay.goals.length, (demoReplay.scores[0] ?? 0) + (demoReplay.scores[1] ?? 0));
  assert.equal(demoReplay.warnings.length, 0);
  assert.equal(teamTotal(demoReplay.players, 0, "shots"), 11);
  assert.equal(teamShooting(demoReplay, 0), 36);
});

test("formatea tiempos de grabación, incluidos cero y minutos adicionales", () => {
  assert.equal(formatTime(null), "N/D");
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(605), "10:05");
});

test("el límite de subida es exactamente 32 MiB", () => {
  assert.equal(MAX_REPLAY_BYTES, 33_554_432);
});

test("el resumen final prioriza qué practicar y contiene como máximo dos recomendaciones", () => {
  const player = { ...demoReplay.players[0], goals: 1, shots: 10, shooting: 10, saves: 4 };
  const summary = getImprovementSummary(player, demoReplay);
  assert.equal(summary.length, 2);
  assert.match(summary[0].evidence, /1 goles de 10 tiros/);
  assert.match(summary[0].action, /10 minutos/);
  assert.match(summary[1].evidence, /4 paradas/);
  assert.match(summary[1].action, /no significa defender mal/);
});

test("el resumen cambia con el jugador y no inventa defectos sin evidencia", () => {
  const lowShots = { ...demoReplay.players[0], shots: 0, goals: 0, shooting: null, saves: 0 };
  const summary = getImprovementSummary(lowShots, demoReplay);
  assert.equal(summary.length, 1);
  assert.match(summary[0].evidence, /0 tiros/);
  const noData = { ...lowShots, shots: null, goals: null, assists: null, saves: null };
  const fallback = getImprovementSummary(noData, demoReplay);
  assert.equal(fallback.length, 1);
  assert.match(fallback[0].evidence, /no muestra un aspecto claro/);
});

test("el resumen no presenta buenos resultados como debilidades", () => {
  const player = { ...demoReplay.players[0], saves: 1 };
  const summary = getImprovementSummary(player, demoReplay);
  assert.equal(summary.length, 1);
  assert.match(summary[0].evidence, /no muestra un aspecto claro/);
});
