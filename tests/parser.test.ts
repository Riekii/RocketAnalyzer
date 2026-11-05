import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { Replay } from "../src/lib/replay.ts";
import { analyzeTelemetry } from "../src/lib/telemetry.ts";

test("lee posiciones reales, turbo y mapas de todos los jugadores de una partida local", {
  skip: !process.env.REPLAY_TEST_FILE,
  timeout: 65_000,
}, () => {
  const output = execFileSync(process.execPath, [
    fileURLToPath(new URL("../scripts/parse-replay.mjs", import.meta.url)),
    process.env.REPLAY_TEST_FILE!, "regression.replay", "regression",
  ], { encoding: "utf8", maxBuffer: 48 * 1024 * 1024, timeout: 60_000, windowsHide: true });
  const replay: Replay = JSON.parse(output);
  const { samples, pickups, warnings } = replay.telemetry;
  assert.deepEqual(warnings, []);
  assert.ok(replay.players.length >= 2);
  assert.ok(samples.length > 100);
  assert.ok(samples.some((sample) => sample.players.length === replay.players.length && sample.ball));
  assert.ok(samples.some((sample) => sample.active));
  assert.ok(pickups.length > 0);
  const analysis = analyzeTelemetry(replay);
  for (const player of replay.players) {
    const positions = samples.flatMap((sample) => sample.players.filter((point) => point.id === player.id));
    assert.ok(positions.length > 10, "Cada jugador debe tener posiciones observadas.");
    assert.ok(new Set(positions.map((point) => `${point.x},${point.y}`)).size > 10, "Debe haber movimiento real.");
    assert.ok(positions.some((point) => typeof point.boost === "number"), "Debe haber turbo observado.");
    assert.ok(analysis.heatmaps[player.id].some((seconds) => seconds > 0), "El mapa de calor no debe estar vacio.");
  }
});
