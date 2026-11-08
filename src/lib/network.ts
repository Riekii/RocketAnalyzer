import type { Player, Team } from "./replay.ts";
import {
  emptyTelemetry, nearestPad, SAMPLE_INTERVAL,
  type Position, type PlayerPosition, type Telemetry, type Rotation,
} from "./telemetry.ts";

interface Actor {
  kind: string;
  teamName?: string;
  customTeamName?: string;
  name?: string;
  team?: Team;
  teamActor?: number;
  pri?: number;
  vehicle?: number;
  position?: Position;
  rotation?: Rotation;
  positionTime?: number;
  sleeping?: boolean;
  boost?: number;
  boosting?: boolean;
  pickupState?: string;
  ballTouches?: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function actorId(value: unknown): number | null {
  const number = numeric(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function vector(value: unknown): Position | null {
  const row = record(value);
  const x = numeric(row?.x), y = numeric(row?.y), z = numeric(row?.z);
  return x !== null && y !== null && z !== null &&
    Math.abs(x) < 20000 && Math.abs(y) < 20000 && Math.abs(z) < 20000 ? { x, y, z } : null;
}
function reference(value: unknown): number | null {
  const row = record(value);
  return row?.active === true ? actorId(row.actor) : null;
}

function rotation(value: unknown): Rotation | undefined {
  const row = record(value);
  const x = numeric(row?.x), y = numeric(row?.y), z = numeric(row?.z), w = numeric(row?.w);
  if (x === null || y === null || z === null || w === null) return undefined;
  const length = Math.hypot(x, y, z, w);
  if (length < .5 || length > 1.5) return undefined;
  return { x: x / length, y: y / length, z: z / length, w: w / length };
}

export function isStandardField(map: string): boolean {
  return /^(stadium(_(foggy|winter|day))?|eurostadium(_(night|rainy|snowy))?|utopiastadium(_(dusk|snowy))?|trainstation(_(night|dawn))?|cs(_(day|hw))?|beach(_night)?|farm(_night)?|neotokyo_standard|wasteland_s|wasteland_night_s|arc_standard|arc_darc|chn_stadium(_day)?|ff_dusk|outlaw|street|woods|waterfront|music|aquadome)_p$/i.test(map);
}

export function extractTelemetry(raw: unknown, players: Player[], map: string): Telemetry {
  const root = record(raw);
  const network = record(root?.network_frames);
  if (!Array.isArray(network?.frames) || !Array.isArray(root?.objects)) {
    return emptyTelemetry("No hay fotogramas de red disponibles. No se pueden calcular posiciones ni turbo.");
  }
  const objects = root.objects;
  const actors = new Map<number, Actor>();
  const telemetry: Telemetry = {
    teamNames: [null, null],
    samples: [], pickups: [], pickupsObserved: false, demolitions: [],
    demolitionsObserved: objects.some((name) => typeof name === "string" && /:ReplicatedDemolish/.test(name)),
    standardField: isStandardField(map),
    sampleInterval: SAMPLE_INTERVAL, warnings: [],
  };
  const warnings = new Set<string>();
  if (!telemetry.standardField) warnings.add("Geometría del mapa no verificada: distancias tácticas y tipos de pad desactivados.");
  let firstTime: number | null = null;
  let previousTime = -Infinity;
  let nextSample = 0;
  let active: boolean | null = null;
  let matchOver = false;
  let liveAfter = Infinity;
  const objectName = (value: unknown) => {
    const id = actorId(value);
    return id !== null && typeof objects[id] === "string" ? objects[id] : "";
  };
  const identifyPri = (pri: Actor | undefined, team?: Team): Player | null => {
    const side = team ?? pri?.team ?? (pri?.teamActor === undefined ? undefined : actors.get(pri.teamActor)?.team);
    if (!pri?.name || side === undefined) return null;
    const matches = players.filter((player) => player.name === pri.name && player.team === side);
    if (matches.length > 1) warnings.add("Hay nombres duplicados en un equipo: se omiten sus posiciones para no atribuirlas a otra persona.");
    return matches.length === 1 ? matches[0] : null;
  };
  const identify = (car: Actor): Player | null =>
    identifyPri(car.pri === undefined ? undefined : actors.get(car.pri), car.team);
  const lastDemolition = new Map<number, number>();
  const fresh = (actor: Actor, time: number) =>
    actor.position !== undefined && actor.positionTime !== undefined &&
    (actor.sleeping === true || time - actor.positionTime <= 1);

  for (const frameValue of network.frames) {
    const frame = record(frameValue);
    const absolute = numeric(frame?.time);
    if (!frame || absolute === null) continue;
    if (firstTime === null) firstTime = absolute;
    const time = Math.round((absolute - firstTime) * 1000) / 1000;
    if (time < previousTime) {
      warnings.add("Se han omitido fotogramas con marcas de tiempo no crecientes.");
      continue;
    }
    previousTime = time;
    if (time > 3600 || telemetry.samples.length >= 18000) {
      warnings.add("El análisis espacial se ha limitado a una hora de grabación.");
      break;
    }
    // A demolition can detach the victim's PRI earlier in the very same frame.
    const frameIdentities = new Map<number, Player>();
    for (const [id, actor] of actors) {
      if (actor.pri === undefined) continue;
      const player = identify(actor);
      if (player) frameIdentities.set(id, player);
    }
    if (Array.isArray(frame.deleted_actors)) {
      for (const value of frame.deleted_actors) {
        const id = actorId(value);
        if (id !== null) {
          lastDemolition.delete(id);
          actors.delete(id);
          for (const actor of actors.values()) {
            if (actor.vehicle === id) { actor.vehicle = undefined; actor.boost = undefined; actor.boosting = undefined; }
            if (actor.pri === id) actor.pri = undefined;
            if (actor.teamActor === id) actor.teamActor = undefined;
          }
        }
      }
    }
    if (Array.isArray(frame.new_actors)) {
      for (const value of frame.new_actors) {
        const row = record(value);
        const id = actorId(row?.actor_id);
        if (!row || id === null) continue;
        frameIdentities.delete(id);
        const kind = objectName(row.object_id);
        const actor: Actor = { kind };
        const side = /(?:Team|TeamInfo)([01])(?:\D|$)/.exec(kind)?.[1];
        if (side) actor.team = side === "0" ? 0 : 1;
        // Spawn trajectories and RigidBody locations are both already in Unreal units.
        const position = vector(record(row.initial_trajectory)?.location);
        if (position) { actor.position = position; actor.positionTime = time; }
        actors.set(id, actor);
      }
    }
    const pendingPickups: { padActor: number; instigator: number }[] = [];
    const pendingDemolitions: { data: Record<string, unknown>; extended: boolean }[] = [];
    if (Array.isArray(frame.updated_actors)) {
      for (const value of frame.updated_actors) {
        const row = record(value);
        const id = actorId(row?.actor_id);
        const attr = record(row?.attribute);
        const actor = id === null ? undefined : actors.get(id);
        if (!row || !actor || !attr || id === null) continue;
        const property = objectName(row.object_id);
        if (property === "TAGame.CarComponent_TA:ReplicatedActive" && /CarComponent_Boost/.test(actor.kind)) {
          const value = attr.Byte;
          if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255) {
            actor.boosting = (value & 1) === 1;
          } else warnings.add("Estado de uso de turbo no reconocido; algunos efectos pueden faltar.");
        }
        if (property === "Engine.TeamInfo:TeamName" && typeof attr.String === "string") {
          actor.teamName = attr.String.trim() || undefined;
        }
        if (property === "TAGame.Team_TA:CustomTeamName" && typeof attr.String === "string") {
          actor.customTeamName = attr.String.trim() || undefined;
        }
        if (/:ReplicatedDemolish/.test(property)) {
          const data = record(attr.DemolishExtended ?? attr.DemolishFx ?? attr.Demolish);
          if (data) pendingDemolitions.push({ data, extended: attr.DemolishExtended !== undefined });
          else warnings.add("Formato de demolición no reconocido; algunos eventos pueden faltar.");
        }
        if (property.endsWith(":PlayerName") && typeof attr.String === "string") actor.name = attr.String.trim();
        if (property.endsWith(":BallTouches") && typeof attr.Int === "number" &&
          Number.isSafeInteger(attr.Int) && attr.Int >= 0) actor.ballTouches = attr.Int;
        if (property.endsWith(":Team")) {
          const target = reference(attr.ActiveActor);
          actor.teamActor = target ?? undefined;
        }
        if (property.endsWith(":TeamIndex")) {
          const side = attr.Int ?? attr.Byte;
          if (side === 0 || side === 1) actor.team = side;
        }
        if (property.endsWith(":PlayerReplicationInfo")) actor.pri = reference(attr.ActiveActor) ?? undefined;
        if (property.endsWith(":Vehicle")) actor.vehicle = reference(attr.ActiveActor) ?? undefined;
        const paint = record(attr.TeamPaint);
        if (paint?.team === 0 || paint?.team === 1) actor.team = paint.team;
        const rigidBody = record(attr.RigidBody);
        if (rigidBody) actor.rotation = rotation(rigidBody.rotation);
        const position = vector(rigidBody?.location);
        if (position) {
          actor.position = position;
          actor.positionTime = time;
          actor.sleeping = rigidBody?.sleeping === true;
        }
        const boost = record(attr.ReplicatedBoost);
        const boostAmount = numeric(boost?.boost_amount ?? (property.endsWith(":ReplicatedBoostAmount") ? attr.Byte : null));
        if (boostAmount !== null && boostAmount >= 0 && boostAmount <= 255) actor.boost = Math.round(boostAmount / 255 * 100);
        if (property.endsWith(":bBallHasBeenHit") && typeof attr.Boolean === "boolean") {
          active = attr.Boolean;
          if (active) liveAfter = time + 2;
        }
        if (property.endsWith(":bMatchIsOver") && typeof attr.Boolean === "boolean") matchOver = attr.Boolean;
        if (property.includes(":ReplicatedExplosionData") && /Ball[._]/i.test(actor.kind)) {
          active = false;
          liveAfter = Infinity;
        }
        if (/VehiclePickup/.test(actor.kind) && /ReplicatedPickupData$/.test(property)) {
          telemetry.pickupsObserved = true;
          const pickup = record(attr.PickupNew ?? attr.Pickup);
          if (!pickup) continue;
          const state = `${String(pickup.picked_up)}:${String(pickup.instigator)}`;
          const instigator = actorId(pickup.instigator);
          const picked = pickup.picked_up === true ||
            (typeof pickup.picked_up === "number" && pickup.picked_up > 0);
          if (picked && instigator !== null && actor.pickupState !== state && time > 1) {
            pendingPickups.push({ padActor: id, instigator });
          }
          actor.pickupState = state;
        }
      }
      for (const { data, extended } of pendingDemolitions) {
        const victimActor = extended ? reference(data.victim)
          : data.victim_flag === true ? actorId(data.victim) : null;
        if (victimActor === null || time <= 1) continue;
        const previous = lastDemolition.get(victimActor);
        if (previous !== undefined && time - previous < .5) continue;
        lastDemolition.set(victimActor, time);
        const attackerActor = extended ? reference(data.attacker)
          : data.attacker_flag === true ? actorId(data.attacker) : null;
        const attackerPri = extended ? reference(data.attacker_pri) : null;
        const victimCar = actors.get(victimActor);
        const attackerCar = attackerActor === null ? undefined : actors.get(attackerActor);
        const victim = (victimCar ? identify(victimCar) : null) ?? frameIdentities.get(victimActor) ?? null;
        const attacker = (attackerPri === null ? null : identifyPri(actors.get(attackerPri))) ??
          (attackerCar ? identify(attackerCar) : null) ??
          (attackerActor === null ? null : frameIdentities.get(attackerActor)) ?? null;
        const cause = extended && reference(data.goal_explosion_owner) !== null ? "goal"
          : data.self_demolish === true || (extended && reference(data.self_demo) !== null) ? "self" : "player";
        if (!victim || (cause === "player" && !attacker)) {
          warnings.add("Algunas demoliciones tienen participantes sin identificar.");
        }
        telemetry.demolitions.push({
          time, attackerId: cause === "player" ? attacker?.id ?? null : null, victimId: victim?.id ?? null, cause,
        });
      }
    }
    for (const pickup of pendingPickups) {
      const car = actors.get(pickup.instigator);
      const player = car ? identify(car) : null;
      if (!car || !player) {
        warnings.add("Algunas recogidas de turbo no se pudieron atribuir a un jugador.");
        continue;
      }
      const position = fresh(car, time) ? car.position ?? null : null;
      // The event proves a pickup; proximity only estimates which standard pad it was.
      const knownPad = position && telemetry.standardField ? nearestPad(position) : null;
      telemetry.pickups.push({
        time, playerId: player.id, padId: knownPad?.id ?? `actor-${pickup.padActor}`,
        position: knownPad ?? position,
        size: knownPad ? knownPad.large ? "large" : "small" : "unknown",
      });
    }
    for (const actor of actors.values()) {
      if (actor.team === undefined || !/(?:Team|TeamInfo)(?:[._0-9]|$)/.test(actor.kind)) continue;
      const name = actor.customTeamName ?? actor.teamName;
      if (name && telemetry.teamNames) telemetry.teamNames[actor.team] = name;
    }
    if (time + 0.001 < nextSample) continue;
    nextSample = (Math.floor((time + 0.001) / SAMPLE_INTERVAL) + 1) * SAMPLE_INTERVAL;
    const samples: PlayerPosition[] = [];
    const ambiguous = new Set<string>();
    let ball: Position | null = null;
    const boosts = new Map<number, number>();
    const boosting = new Map<number, boolean>();
    for (const actor of actors.values()) {
      if (/CarComponent_Boost/.test(actor.kind) && actor.vehicle !== undefined) {
        if (actor.boost !== undefined) boosts.set(actor.vehicle, actor.boost);
        if (actor.boosting !== undefined) boosting.set(actor.vehicle, actor.boosting);
      }
    }
    for (const [id, actor] of actors) {
      if (!fresh(actor, time) || !actor.position) continue;
      if (/(?:^|[.])Ball[_\.]/i.test(actor.kind)) ball = actor.position;
      const player = identify(actor);
      if (!player || ambiguous.has(player.id)) continue;
      if (samples.some((point) => point.id === player.id)) {
        warnings.add("Se han omitido coches duplicados para un mismo jugador.");
        const existing = samples.findIndex((point) => point.id === player.id);
        samples.splice(existing, 1);
        ambiguous.add(player.id);
        continue;
      }
      const touches = actor.pri === undefined ? undefined : actors.get(actor.pri)?.ballTouches;
      samples.push({ id: player.id, ...actor.position, boost: boosts.get(id) ?? null,
        ...(boosting.has(id) ? { boosting: boosting.get(id) } : {}),
        ...(actor.rotation ? { rotation: actor.rotation } : {}),
        ...(touches === undefined ? {} : { ballTouches: touches }) });
    }
    const phaseActive = matchOver
      ? false : active === true && time < liveAfter ? false : active;
    telemetry.samples.push({ time, active: phaseActive, ball, players: samples });
  }
  const tracked = new Set(telemetry.samples.flatMap((sample) => sample.players.map((player) => player.id)));
  if (tracked.size < players.length) warnings.add(`Posiciones identificadas para ${tracked.size}/${players.length} jugadores; el resto se muestra como N/D.`);
  if (!telemetry.samples.some((sample) => sample.active === true)) warnings.add("No se pudo identificar juego activo: valoración de rotaciones desactivada.");
  if (!telemetry.pickupsObserved) warnings.add("No se observaron datos de recogida de pads; sus contadores se muestran como N/D.");
  telemetry.warnings = [...warnings];
  return telemetry;
}
