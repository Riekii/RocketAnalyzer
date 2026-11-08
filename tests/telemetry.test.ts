import assert from "node:assert/strict";
import test from "node:test";
import { demoReplay } from "../src/lib/demo.ts";
import { extractTelemetry, isStandardField } from "../src/lib/network.ts";
import { getImprovementSummary } from "../src/lib/analysis.ts";
import {
  analyzeTelemetry, BOOST_PADS, distance, emptyTelemetry, FIELD, heatCell, heatmapFor,
  nearestPad, playerDistances, sampleSignals, type PositionSample,
} from "../src/lib/telemetry.ts";
import type { Replay } from "../src/lib/replay.ts";
import { replayLabel } from "../src/lib/replay.ts";

const objects = [
  "Archetypes.Teams.Team0", "Archetypes.Teams.Team1", "TAGame.PRI_TA",
  "Archetypes.Car.Car_Default", "Archetypes.CarComponents.CarComponent_Boost",
  "Archetypes.Ball.Ball_Default", "TAGame.VehiclePickup_Boost_TA",
  "Engine.PlayerReplicationInfo:PlayerName", "Engine.PlayerReplicationInfo:Team",
  "Engine.Pawn:PlayerReplicationInfo", "TAGame.CarComponent_TA:Vehicle",
  "TAGame.RBActor_TA:ReplicatedRBState", "TAGame.CarComponent_Boost_TA:ReplicatedBoost",
  "TAGame.CarComponent_Boost_TA:ReplicatedBoostAmount",
  "TAGame.VehiclePickup_TA:NewReplicatedPickupData",
  "TAGame.VehiclePickup_TA:ReplicatedPickupData",
  "TAGame.GameEvent_Soccar_TA:bBallHasBeenHit",
  "TAGame.Ball_TA:ReplicatedExplosionData", "Engine.GameReplicationInfo:bMatchIsOver",
  "TAGame.PRI_TA:BallTouches",
  "TAGame.Car_TA:ReplicatedDemolishExtended",
  "TAGame.Car_TA:ReplicatedDemolish",
  "Engine.TeamInfo:TeamName",
  "TAGame.Team_TA:CustomTeamName",
  "Engine.TeamInfo:TeamIndex",
  "TAGame.CarComponent_TA:ReplicatedActive",
];
function update(id: number, property: string, attribute: Record<string, unknown>) {
  return { actor_id: id, object_id: objects.indexOf(property), attribute };
}
function active(actor: number) { return { ActiveActor: { active: true, actor } }; }
function body(id: number, x: number, y: number, z = 17) {
  return update(id, "TAGame.RBActor_TA:ReplicatedRBState", { RigidBody: { location: { x, y, z }, sleeping: false } });
}
function fixture() {
  const new_actors = [
    { actor_id: 1, object_id: 0 }, { actor_id: 2, object_id: 1 },
    ...demoReplay.players.map((_, index) => ({ actor_id: 10 + index, object_id: 2 })),
    ...demoReplay.players.map((_, index) => ({ actor_id: 20 + index, object_id: 3 })),
    ...demoReplay.players.map((_, index) => ({ actor_id: 30 + index, object_id: 4 })),
    { actor_id: 40, object_id: 5 }, { actor_id: 50, object_id: 6 },
    { actor_id: 60, object_id: 2 },
  ];
  const initial = demoReplay.players.flatMap((player, index) => [
    update(10 + index, "Engine.PlayerReplicationInfo:PlayerName", { String: player.name }),
    update(10 + index, "Engine.PlayerReplicationInfo:Team", active(player.team + 1)),
    update(20 + index, "Engine.Pawn:PlayerReplicationInfo", active(10 + index)),
    update(30 + index, "TAGame.CarComponent_TA:Vehicle", active(20 + index)),
    update(30 + index, "TAGame.CarComponent_Boost_TA:ReplicatedBoost", { ReplicatedBoost: { boost_amount: 128 } }),
  ]);
  return {
    objects,
    network_frames: {
      frames: Array.from({ length: 31 }, (_, index) => ({
        time: 100 + index * 0.2,
        new_actors: index === 0 ? new_actors : [],
        deleted_actors: [] as number[],
        updated_actors: [
          ...(index === 0 ? [
            ...initial,
            update(60, "TAGame.GameEvent_Soccar_TA:bBallHasBeenHit", { Boolean: true }),
            update(50, "TAGame.VehiclePickup_TA:NewReplicatedPickupData", { PickupNew: { instigator: null, picked_up: 0 } }),
          ] : []),
          body(20, -3072, -4096), body(21, 0, -1800),
          body(22, 2000, 1000), body(23, 1000, 2500), body(40, 1000, -1000, 93),
        ],
      })),
    },
  };
}

test("reconstruye identidad, posiciones en uu y turbo desde actores de boxcars", () => {
  const raw = fixture();
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.standardField, true);
  assert.equal(telemetry.samples[0].time, 0);
  assert.equal(telemetry.samples[0].players.length, 4);
  assert.deepEqual(telemetry.samples[0].players[0], {
    id: demoReplay.players[0].id, x: -3072, y: -4096, z: 17, boost: 50,
  });

  assert.equal(telemetry.samples[0].active, false);
  assert.equal(telemetry.samples[11].active, true);
  assert.equal(telemetry.samples[10].ball?.z, 93);
});

test("lee los nombres de equipo y prioriza los nombres personalizados de la repetición", () => {
  const raw = fixture();
  raw.network_frames.frames[0].updated_actors.push(
    update(1, "Engine.TeamInfo:TeamName", { String: "Blue" }),
    update(1, "TAGame.Team_TA:CustomTeamName", { String: "  Equipo Uno  " }),
    update(2, "TAGame.Team_TA:CustomTeamName", { String: "Equipo Dos" }),
  );
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.deepEqual(telemetry.teamNames, ["Equipo Uno", "Equipo Dos"]);
  assert.equal(replayLabel({ ...demoReplay, telemetry }), "Equipo Uno vs Equipo Dos");
});

test("extrae y normaliza la rotación real del coche sin inventar valores ausentes", () => {
  const raw = fixture();
  raw.network_frames.frames[0].updated_actors.push(update(20, "TAGame.RBActor_TA:ReplicatedRBState", {
    RigidBody: { location: { x: 10, y: 20, z: 30 }, rotation: { x: 0, y: 0, z: .7, w: .7 } },
  }));
  const point = extractTelemetry(raw, demoReplay.players, "cs_p").samples[0].players[0];
  assert.ok(Math.abs(point.rotation!.z - Math.SQRT1_2) < 1e-8);
  assert.ok(Math.abs(point.rotation!.w - Math.SQRT1_2) < 1e-8);
  assert.equal(extractTelemetry(fixture(), demoReplay.players, "cs_p").samples[0].players[0].rotation, undefined);
});

test("asocia nombres al TeamIndex aunque llegue después del nombre y no mezcla jugadores", () => {
  const raw = fixture();
  raw.objects = [...objects, "TAGame.Team_TA"];
  raw.network_frames.frames[0].new_actors.push({ actor_id: 70, object_id: raw.objects.length - 1 });
  raw.network_frames.frames[0].updated_actors.push(
    update(70, "TAGame.Team_TA:CustomTeamName", { String: "Equipo Naranja" }),
    update(70, "Engine.TeamInfo:TeamIndex", { Int: 1 }),
    update(10, "TAGame.Team_TA:CustomTeamName", { String: "No es un equipo" }),
  );
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.deepEqual(telemetry.teamNames, [null, "Equipo Naranja"]);
});

test("los nombres ausentes se indican sin inventar equipos ni usar nombres de jugadores", () => {
  const telemetry = extractTelemetry(fixture(), demoReplay.players, "cs_p");
  assert.deepEqual(telemetry.teamNames, [null, null]);
  assert.equal(replayLabel({ ...demoReplay, telemetry }), "Azul (sin nombre) vs Naranja (sin nombre)");
  assert.equal(replayLabel({ ...demoReplay, telemetry: emptyTelemetry("Sin datos") }),
    "Azul (sin nombre) vs Naranja (sin nombre)");
});

test("registra recogidas reales, evita duplicados y estima el pad por proximidad", () => {
  const raw = fixture();
  for (const index of [15, 16]) {
    raw.network_frames.frames[index].updated_actors.push(update(50, "TAGame.VehiclePickup_TA:NewReplicatedPickupData", {
      PickupNew: { instigator: 20, picked_up: 1 },
    }));
  }
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.pickupsObserved, true);
  assert.equal(telemetry.pickups.length, 1);
  assert.equal(telemetry.pickups[0].playerId, demoReplay.players[0].id);
  assert.equal(telemetry.pickups[0].size, "large");
  assert.equal(telemetry.pickups[0].time, 3);
  assert.equal(telemetry.pickups[0].padId, "pad-4");
});

test("una subida de turbo no se inventa como recogida de pad", () => {
  const raw = fixture();
  raw.network_frames.frames[15].updated_actors.push(update(30, "TAGame.CarComponent_Boost_TA:ReplicatedBoostAmount", { Byte: 255 }));
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.pickups.length, 0);
  assert.equal(telemetry.samples[15].players[0].boost, 100);
});

test("el uso de turbo sigue el estado replicado del componente, no la bajada del nivel", () => {
  const raw = fixture();
  raw.network_frames.frames[0].updated_actors.push(
    update(30, "TAGame.CarComponent_TA:ReplicatedActive", { Byte: 3 }),
    update(31, "TAGame.CarComponent_TA:ReplicatedActive", { Byte: 2 }),
    update(20, "TAGame.CarComponent_TA:ReplicatedActive", { Byte: 1 }),
  );
  raw.network_frames.frames[1].updated_actors.push(
    update(30, "TAGame.CarComponent_TA:ReplicatedActive", { Byte: 4 }),
  );
  const telemetry = extractTelemetry(raw, demoReplay.players, "Unknown_P");
  assert.equal(telemetry.samples[0].players[0].boosting, true);
  assert.equal(telemetry.samples[0].players[1].boosting, false);
  assert.equal(telemetry.samples[1].players[0].boosting, false);
  assert.equal(telemetry.samples[0].players[2].boosting, undefined);
  assert.equal(telemetry.standardField, false);
  assert.ok(telemetry.samples[0].ball);
  assert.equal(telemetry.samples[0].players.length, 4);
});

test("soporta eventos de recogida antiguos y no clasifica un pad demasiado lejano", () => {
  const raw = fixture();
  raw.network_frames.frames[15].updated_actors.push(update(50, "TAGame.VehiclePickup_TA:ReplicatedPickupData", {
    Pickup: { instigator: 21, picked_up: true },
  }));
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.pickups.length, 1);
  assert.equal(telemetry.pickups[0].size, "unknown");
});

test("elimina coches destruidos y no conserva posiciones de más de un segundo", () => {
  const raw = fixture();
  raw.network_frames.frames[10].deleted_actors.push(20);
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.ok(!telemetry.samples[10].players.some((player) => player.id === demoReplay.players[0].id));
  const stale = fixture();
  for (let index = 1; index < stale.network_frames.frames.length; index++) {
    stale.network_frames.frames[index].updated_actors = stale.network_frames.frames[index].updated_actors.filter((entry) => entry.actor_id !== 20);
  }
  assert.ok(!extractTelemetry(stale, demoReplay.players, "cs_p").samples[10].players.some((player) => player.id === demoReplay.players[0].id));
});

test("no atribuye trayectorias cuando hay nombres ambiguos en un equipo", () => {
  const raw = fixture();
  const duplicates = demoReplay.players.map((player) => ({ ...player }));
  duplicates[1].name = duplicates[0].name;
  const telemetry = extractTelemetry(raw, duplicates, "cs_p");
  assert.ok(!telemetry.samples[0].players.some((player) => player.id === duplicates[0].id));
  assert.ok(telemetry.warnings.some((warning) => warning.includes("duplicados")));
});

test("no hereda el turbo de un coche destruido al reutilizarse su identificador", () => {
  const raw = fixture();
  raw.network_frames.frames[10].deleted_actors.push(20);
  raw.network_frames.frames[11].new_actors.push({ actor_id: 20, object_id: 3 });
  raw.network_frames.frames[11].updated_actors.push(update(20, "Engine.Pawn:PlayerReplicationInfo", active(10)));
  raw.network_frames.frames[12].updated_actors.push(
    update(30, "TAGame.CarComponent_TA:Vehicle", active(20)),
    update(30, "TAGame.CarComponent_Boost_TA:ReplicatedBoostAmount", { Byte: 64 }),
  );
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.samples[11].players.find((player) => player.id === demoReplay.players[0].id)?.boost, null);
  assert.equal(telemetry.samples[12].players.find((player) => player.id === demoReplay.players[0].id)?.boost, 25);
});

test("desactiva valoraciones tras un gol y en mapas no verificados", () => {
  const raw = fixture();
  raw.network_frames.frames[20].updated_actors.push(update(40, "TAGame.Ball_TA:ReplicatedExplosionData", { Explosion: {} }));
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.samples[20].active, false);
  assert.equal(isStandardField("cs_p"), true);
  assert.equal(isStandardField("stadium_p"), true);
  assert.equal(isStandardField("Underpass_P"), false);
  assert.equal(extractTelemetry(raw, demoReplay.players, "Unknown_P").standardField, false);
});

test("los datos de red ausentes son explícitos y no rellenan trayectorias", () => {
  const telemetry = extractTelemetry({}, demoReplay.players, "cs_p");
  assert.equal(telemetry.samples.length, 0);
  assert.equal(telemetry.pickupsObserved, false);
  assert.ok(telemetry.warnings[0].includes("No hay fotogramas"));
});

test("extrae demos con atacante PRI, victima y sin duplicar la misma demolicion", () => {
  const raw = fixture();
  const data = {
    attacker_pri: { active: true, actor: 10 },
    attacker: { active: true, actor: 999 },
    victim: { active: true, actor: 22 },
    self_demo: { active: false, actor: -1 }, self_demolish: false,
    goal_explosion_owner: { active: false, actor: -1 },
  };
  for (const index of [10, 11]) raw.network_frames.frames[index].updated_actors.push(
    update(22, "TAGame.Car_TA:ReplicatedDemolishExtended", { DemolishExtended: data }),
  );
  raw.network_frames.frames[10].updated_actors.unshift(
    update(22, "Engine.Pawn:PlayerReplicationInfo", { ActiveActor: { active: false, actor: -1 } }),
  );
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.demolitionsObserved, true);
  assert.deepEqual(telemetry.demolitions, [{
    time: 2, attackerId: demoReplay.players[0].id, victimId: demoReplay.players[2].id, cause: "player",
  }]);
});

test("soporta demos antiguas y no atribuye autodemos ni explosiones de gol a un atacante", () => {
  const raw = fixture();
  raw.network_frames.frames[10].updated_actors.push(update(22, "TAGame.Car_TA:ReplicatedDemolish", {
    Demolish: { attacker_flag: true, attacker: 20, victim_flag: true, victim: 22 },
  }));
  for (const [index, cause] of [[15, "self"], [20, "goal"]] as const) {
    raw.network_frames.frames[index].updated_actors.push(update(23, "TAGame.Car_TA:ReplicatedDemolishExtended", {
      DemolishExtended: {
        attacker_pri: { active: true, actor: 10 }, victim: { active: true, actor: 23 },
        self_demolish: cause === "self", goal_explosion_owner: { active: cause === "goal", actor: 10 },
      },
    }));
  }
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.deepEqual(telemetry.demolitions.map((event) => [event.cause, event.attackerId]),
    [["player", demoReplay.players[0].id], ["self", null], ["goal", null]]);
  assert.deepEqual(extractTelemetry({}, demoReplay.players, "cs_p").demolitions, []);
});

test("una desaparicion no inventa una demo y una identidad desconocida se conserva como desconocida", () => {
  const raw = fixture();
  raw.network_frames.frames[10].deleted_actors.push(20);
  raw.network_frames.frames[15].updated_actors.push(update(22, "TAGame.Car_TA:ReplicatedDemolishExtended", {
    DemolishExtended: { victim: { active: true, actor: 22 }, attacker_pri: { active: true, actor: 999 } },
  }));
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.demolitions.length, 1);
  assert.equal(telemetry.demolitions[0].attackerId, null);
  assert.ok(telemetry.warnings.some((warning) => warning.includes("demoliciones")));
});

test("una demo no hereda la identidad de un actor destruido y reutilizado en el mismo fotograma", () => {
  const raw = fixture();
  const frame = raw.network_frames.frames[10];
  frame.deleted_actors.push(22);
  frame.new_actors.push({ actor_id: 22, object_id: 3 });
  frame.updated_actors.push(update(22, "TAGame.Car_TA:ReplicatedDemolishExtended", {
    DemolishExtended: { victim: { active: true, actor: 22 }, attacker_pri: { active: true, actor: 10 } },
  }));
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.demolitions.length, 1);
  assert.equal(telemetry.demolitions[0].victimId, null);
});

test("mide todas las parejas sin duplicados: triangulos completos en 3v3 y distancias entre rivales", () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    ...demoReplay.players[0], id: `player-${index}`, team: index < 3 ? 0 as const : 1 as const,
  }));
  const sample: PositionSample = {
    time: 0, active: true, ball: null,
    players: players.map((player, index) => ({ id: player.id, x: index * 100, y: 0, z: 17, boost: 50 })),
  };
  const pairs = playerDistances(sample, players);
  assert.equal(pairs.length, 15);
  assert.equal(pairs.filter((pair) => pair.team === 0).length, 3);
  assert.equal(pairs.filter((pair) => pair.team === 1).length, 3);
  assert.equal(pairs.filter((pair) => pair.team === null).length, 9);
  assert.equal(pairs.find((pair) => pair.first.id === players[0].id && pair.second.id === players[2].id)?.units, 200);
  assert.equal(playerDistances({ ...sample, players: sample.players.slice(0, 2) }, players).length, 1);
  assert.deepEqual(playerDistances(undefined, players), []);
});

test("extrae el contador real de toques del PRI sin inventar ceros ausentes", () => {
  const raw = fixture();
  raw.network_frames.frames[5].updated_actors.push(update(10, "TAGame.PRI_TA:BallTouches", { Int: 2 }));
  const telemetry = extractTelemetry(raw, demoReplay.players, "cs_p");
  assert.equal(telemetry.samples[0].players[0].ballTouches, undefined);
  assert.equal(telemetry.samples[5].players[0].ballTouches, 2);
  assert.equal(telemetry.samples[6].players[0].ballTouches, 2);
});

function tacticalSample(time: number): PositionSample {
  return {
    time, active: true, ball: { x: 300, y: -1400, z: 93 },
    players: [
      { id: demoReplay.players[0].id, x: 0, y: -1000, z: 17, boost: 10 },
      { id: demoReplay.players[1].id, x: 600, y: -1000, z: 17, boost: 50 },
      { id: demoReplay.players[2].id, x: -1000, y: 2000, z: 17, boost: null },
      { id: demoReplay.players[3].id, x: 2000, y: 4000, z: 17, boost: 75 },
    ],
  };
}

test("mide distancias horizontales sin convertirlas en una nota universal", () => {
  assert.equal(distance({ x: 0, y: 0, z: 0 }, { x: 300, y: 400, z: 2000 }), 500);
  const signals = sampleSignals(tacticalSample(0), demoReplay.players, true);
  assert.ok(signals.some((signal) => signal.kind === "close" && signal.team === 0));
  assert.ok(signals.some((signal) => signal.kind === "pressure" && signal.team === 0));
  assert.ok(signals.some((signal) => signal.kind === "coverage" && signal.team === 0));
});

test("no juzga pausas, saques, mapas desconocidos, 1v1 ni equipos incompletos", () => {
  const sample = tacticalSample(0);
  assert.deepEqual(sampleSignals({ ...sample, active: false }, demoReplay.players, true), []);
  assert.deepEqual(sampleSignals({ ...sample, active: null }, demoReplay.players, true), []);
  assert.deepEqual(sampleSignals(sample, demoReplay.players, false), []);
  assert.deepEqual(sampleSignals({ ...sample, ball: { x: 0, y: 0, z: 93 } }, demoReplay.players, true), []);
  assert.deepEqual(sampleSignals({ ...sample, players: sample.players.slice(0, 1) }, demoReplay.players, true), []);
  assert.deepEqual(sampleSignals(sample, [demoReplay.players[0]], true), []);
});

test("descarta proximidad y doble presión aérea y respeta los umbrales exactos", () => {
  const sample = tacticalSample(0);
  sample.players[1].x = 700;
  assert.ok(!sampleSignals(sample, demoReplay.players, true).some((signal) => signal.kind === "close"));
  sample.players[1].z = 400;
  assert.ok(!sampleSignals(sample, demoReplay.players, true).some((signal) => signal.kind === "pressure"));
});

test("exige dos segundos continuos y no une señales separadas por pausas", () => {
  const makeReplay = (samples: PositionSample[]): Replay => ({
    ...demoReplay, telemetry: { ...emptyTelemetry(""), standardField: true, warnings: [], samples },
  });
  const short = analyzeTelemetry(makeReplay(Array.from({ length: 6 }, (_, index) => tacticalSample(index * .2))));
  assert.equal(short.events.length, 0);
  const long = analyzeTelemetry(makeReplay(Array.from({ length: 13 }, (_, index) => tacticalSample(index * .2))));
  assert.ok(long.events.some((event) => event.kind === "pressure"));
  assert.ok(long.players[demoReplay.players[0].id].closeSeconds >= 2);
  const interrupted = Array.from({ length: 15 }, (_, index) => tacticalSample(index * .2));
  interrupted[7].active = false;
  assert.equal(analyzeTelemetry(makeReplay(interrupted)).events.length, 0);
});

test("el calor pondera tiempo, recorta intervalos y excluye pausas y puntos fuera del campo", () => {
  const id = demoReplay.players[0].id;
  const samples = [tacticalSample(0), tacticalSample(.2), tacticalSample(.4), tacticalSample(.6)];
  samples[1].active = false;
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum(heatmapFor(samples, .2, id)) - .4) < 1e-8);
  assert.ok(Math.abs(sum(heatmapFor(samples, .2, id, .1, .5)) - .2) < 1e-8);
  assert.equal(heatCell({ x: FIELD.halfWidth + 1, y: 0, z: 0 }), null);
  assert.equal(heatCell({ x: FIELD.halfWidth, y: FIELD.halfLength, z: 0 }), 24 * 30 - 1);
  assert.equal(heatCell({ x: -FIELD.halfWidth, y: -FIELD.halfLength, z: 0 }), 0);
});

test("un hueco sin datos no mantiene una señal táctica de forma artificial", () => {
  const samples = [
    ...Array.from({ length: 6 }, (_, index) => tacticalSample(index * .2)),
    ...Array.from({ length: 6 }, (_, index) => tacticalSample(10 + index * .2)),
  ];
  const result = analyzeTelemetry({
    ...demoReplay, telemetry: { ...emptyTelemetry(""), standardField: true, warnings: [], samples },
  });
  assert.equal(result.events.length, 0);
});

test("valida seis pads grandes, distancias máximas y tipo desconocido lejos de un pad", () => {
  assert.equal(BOOST_PADS.length, 34);
  assert.equal(BOOST_PADS.filter((pad) => pad.large).length, 6);
  assert.equal(nearestPad({ x: -3072, y: -4096, z: 17 })?.large, true);
  assert.equal(nearestPad({ x: 0, y: -4240, z: 17 })?.large, false);
  assert.equal(nearestPad({ x: 0, y: 0, z: 17 }), null);
});

test("el resumen final prioriza señales espaciales con una muestra suficiente", () => {
  const analysis = analyzeTelemetry({ ...demoReplay, telemetry: emptyTelemetry("") });
  const spatial = {
    ...analysis.players[demoReplay.players[0].id],
    evaluatedSeconds: 100, coverageSeconds: 10, pressureSeconds: 20,
  };
  const summary = getImprovementSummary(demoReplay.players[0], demoReplay, spatial);
  assert.equal(summary.length, 2);
  assert.match(summary[0].evidence, /cobertura/);
  assert.match(summary[1].evidence, /doble presión/);
});
