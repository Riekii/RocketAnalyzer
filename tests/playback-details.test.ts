import assert from "node:assert/strict";
import test from "node:test";
import { detailedStats } from "../src/lib/detailed-stats.ts";
import { interpolatedSample, playbackTime, sampleIndexAt } from "../src/lib/playback.ts";
import { demoReplay } from "../src/lib/demo.ts";
import { emptyTelemetry, type PositionSample } from "../src/lib/telemetry.ts";

const id = demoReplay.players[0].id;
test("el reloj respeta las cuatro velocidades, cambios sin salto y fin de partida", () => {
  for (const speed of [1, 1.5, 2, 3]) {
    assert.equal(playbackTime(10, 1000, speed, 100), 10 + speed);
    assert.equal(playbackTime(10, 2500, speed, 100), 10 + 2.5 * speed);
  }
  const atChange = playbackTime(10, 1000, 1.5, 100);
  assert.equal(playbackTime(atChange, 0, 3, 100), atChange);
  assert.equal(playbackTime(atChange, 1000, 3, 100), 14.5);
  assert.equal(playbackTime(99, 1000, 3, 100), 100);
  assert.equal(playbackTime(10, -1, 3, 100), 10);
});
function sample(time: number, x: number, touches = 1): PositionSample {
  return {
    time, active: true, ball: { x: 0, y: 0, z: 17 },
    players: [{ id, x, y: 0, z: 17, boost: 50, ballTouches: touches }],
  };
}
function analyze(samples: PositionSample[]) {
  return detailedStats({ ...demoReplay, telemetry: {
    ...emptyTelemetry(""), samples, standardField: true,
  } })[id];
}

test("interpola posiciones a medio fotograma sin inventar turbo o toques", () => {
  const samples = [sample(0, -800), sample(.2, -400, 2)];
  samples[1].players[0].boost = 100;
  assert.equal(interpolatedSample(samples, .1, .2)?.players[0].x, -600);
  assert.equal(interpolatedSample(samples, .1, .2)?.players[0].boost, 50);
  assert.equal(interpolatedSample(samples, .1, .2)?.players[0].ballTouches, 1);
  assert.equal(sampleIndexAt(samples, .19), 0);
  assert.equal(sampleIndexAt(samples, .2), 1);
  assert.equal(sampleIndexAt(samples, 10), 1);
  assert.equal(interpolatedSample([], 0, .2), undefined);
});

test("no interpola huecos, fases, respawns ni jugadores ausentes", () => {
  const before = sample(0, -800);
  assert.equal(interpolatedSample([before, sample(1, -400)], .1, .2), before);
  assert.equal(interpolatedSample([before, { ...sample(.2, -400), active: false }], .1, .2), before);
  assert.equal(interpolatedSample([before, sample(.2, 3000)], .1, .2)?.players[0].x, -800);
  assert.equal(interpolatedSample([before, { ...sample(.2, 0), players: [] }], .1, .2)?.players[0].x, -800);
  assert.equal(interpolatedSample([{ ...before, players: [] }, sample(.2, 0)], .1, .2)?.players.length, 0);
});

test("permite buscar hacia delante y atras entre muestras y no conserva posiciones en huecos", () => {
  const samples = [sample(0, -800), sample(.2, -400), sample(1, 0), sample(1.2, 400)];
  assert.ok(Math.abs(interpolatedSample(samples, 1.1, .2)!.players[0].x - 200) < 1e-8);
  assert.equal(interpolatedSample(samples, .05, .2)?.players[0].x, -700);
  const gap = interpolatedSample(samples, .8, .2);
  assert.equal(gap?.time, .8);
  assert.deepEqual(gap?.players, []);
  assert.equal(gap?.ball, null);
  assert.equal(interpolatedSample(samples, 1, .2)?.players[0].x, 0);
});

test("pondera turbo y aire por tiempo activo y excluye paredes", () => {
  const samples = [sample(0, 0), sample(.2, 0), sample(.4, 4000), sample(.6, 0), sample(.8, 0)];
  samples[0].players[0].boost = 0;
  samples[1].players[0].boost = 100;
  samples[1].players[0].z = 400;
  samples[2].players[0].z = 500;
  samples[3].active = false;
  const stats = analyze(samples);
  assert.ok(Math.abs(stats.seconds - .6) < 1e-8);
  assert.ok(Math.abs(stats.airSeconds - .2) < 1e-8);
  assert.ok(Math.abs(stats.meanBoost! - 50) < 1e-8);
  assert.ok(Math.abs(stats.emptyBoostSeconds - .2) < 1e-8);
  assert.ok(Math.abs(stats.fullBoostSeconds - .2) < 1e-8);
  const missing = sample(0, 0);
  missing.players[0].boost = null;
  assert.equal(analyze([missing, sample(.2, 0)]).meanBoost, null);
});

function attempt(touch = false) {
  return [
    sample(0, -800), sample(.2, -450), sample(.4, -150, touch ? 2 : 1),
    sample(.6, 250, touch ? 2 : 1), sample(.8, 650, touch ? 2 : 1),
    sample(1, 1000, touch ? 2 : 1), sample(1.2, 1200, touch ? 2 : 1),
  ];
}

test("detecta una aproximacion sin toque una sola vez y permite saltar al instante", () => {
  const stats = analyze(attempt());
  assert.equal(stats.approaches, 1);
  assert.deepEqual(stats.possibleMisses, [.2]);
  assert.deepEqual(analyze(attempt(true)).possibleMisses, []);
});

test("no considera fallos pausas, huecos, toques desconocidos ni contadores reiniciados", () => {
  for (const change of ["pause", "gap", "missing", "reset"] as const) {
    const samples = attempt();
    if (change === "pause") samples[2].active = false;
    if (change === "gap") samples.slice(2).forEach((point) => { point.time += 2; });
    if (change === "missing") samples.forEach((point) => { delete point.players[0].ballTouches; });
    if (change === "reset") samples.slice(2).forEach((point) => { point.players[0].ballTouches = 0; });
    assert.deepEqual(analyze(samples).possibleMisses, [], change);
  }
});

test("no atribuye un intento a un coche parado cuando se acerca el balon", () => {
  const samples = attempt().map((point) => ({
    ...point, ball: { x: -point.players[0].x, y: 0, z: 17 },
    players: [{ ...point.players[0], x: 0 }],
  }));
  assert.equal(analyze(samples).approaches, 0);
  assert.deepEqual(analyze(samples).possibleMisses, []);
});
