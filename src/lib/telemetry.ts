import type { Player, Replay, Team } from "./replay.ts";

export interface Position { x: number; y: number; z: number }
export interface PlayerPosition extends Position { id: string; boost: number | null; ballTouches?: number }
export interface PositionSample {
  time: number;
  active: boolean | null;
  ball: Position | null;
  players: PlayerPosition[];
}
export interface BoostPickup {
  time: number;
  playerId: string;
  padId: string;
  position: Position | null;
  size: "small" | "large" | "unknown";
}
export interface Demolition {
  time: number;
  attackerId: string | null;
  victimId: string | null;
  cause: "player" | "self" | "goal";
}
export interface Telemetry {
  teamNames?: [string | null, string | null];
  samples: PositionSample[];
  pickups: BoostPickup[];
  pickupsObserved: boolean;
  demolitions: Demolition[];
  demolitionsObserved: boolean;
  standardField: boolean;
  sampleInterval: number;
  warnings: string[];
}
export interface BoostPad extends Position { id: string; large: boolean }

export const SAMPLE_INTERVAL = 0.2;
export const FIELD = { halfWidth: 4096, halfLength: 5120 };
export const HEAT_COLUMNS = 24;
export const HEAT_ROWS = 30;
export const RULES = { close: 700, far: 4000, pressure: 1000, cover: 500, minimumSeconds: 2 };

// Standard Soccar pad coordinates in Unreal units, matching the game's field axes.
const PAD_COORDINATES: [number, number, boolean][] = [
  [0, -4240, false], [-1792, -4184, false], [1792, -4184, false],
  [-3072, -4096, true], [3072, -4096, true], [-940, -3308, false], [940, -3308, false],
  [0, -2816, false], [-3584, -2484, false], [3584, -2484, false],
  [-1788, -2300, false], [1788, -2300, false], [-2048, -1036, false],
  [0, -1024, false], [2048, -1036, false], [-3584, 0, true], [-1024, 0, false],
  [1024, 0, false], [3584, 0, true], [-2048, 1036, false], [0, 1024, false],
  [2048, 1036, false], [-1788, 2300, false], [1788, 2300, false],
  [-3584, 2484, false], [3584, 2484, false], [0, 2816, false],
  [-940, 3308, false], [940, 3308, false], [-3072, 4096, true], [3072, 4096, true],
  [-1792, 4184, false], [1792, 4184, false], [0, 4240, false],
];
export const BOOST_PADS: BoostPad[] = PAD_COORDINATES.map(([x, y, large], index) => ({
  id: `pad-${index + 1}`, x, y, z: 0, large,
}));

export function emptyTelemetry(warning: string): Telemetry {
  return {
    samples: [], pickups: [], pickupsObserved: false, demolitions: [], demolitionsObserved: false, standardField: false,
    sampleInterval: SAMPLE_INTERVAL, warnings: [warning],
  };
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function playerDistances(sample: PositionSample | undefined, players: Player[]) {
  const points = sample?.players ?? [];
  return points.flatMap((first, index) => {
    const player = players.find((member) => member.id === first.id);
    if (!player) return [];
    return points.slice(index + 1).flatMap((second) => {
      const other = players.find((member) => member.id === second.id);
      return other ? [{ first, second, team: player.team === other.team ? player.team : null,
        units: distance(first, second) }] : [];
    });
  });
}

export function nearestPad(position: Position): BoostPad | null {
  const nearest = BOOST_PADS.reduce((best, pad) =>
    distance(position, pad) < distance(position, best) ? pad : best);
  return position.z < 300 && distance(position, nearest) <= 350 ? nearest : null;
}

export type TacticalKind = "close" | "far" | "pressure" | "coverage";
export const TACTICAL_LABELS: Record<TacticalKind, string> = {
  close: "Compañeros muy juntos",
  far: "Jugador aislado",
  pressure: "Posible doble presión",
  coverage: "Sin cobertura por detrás del balón",
};
export interface TacticalSignal { kind: TacticalKind; team: Team; playerIds: string[] }
export interface TacticalEvent extends TacticalSignal { start: number; end: number }
export interface PlayerSpatialStats {
  trackedSeconds: number;
  evaluatedSeconds: number;
  meanDistance: number | null;
  closeSeconds: number;
  farSeconds: number;
  pressureSeconds: number;
  coverageSeconds: number;
  lowBoostSeconds: number;
  boostSeconds: number;
  meanBoost: number | null;
  largePickups: number;
  smallPickups: number;
  unknownPickups: number;
}
export interface SpatialAnalysis {
  players: Record<string, PlayerSpatialStats>;
  heatmaps: Record<string, number[]>;
  events: TacticalEvent[];
}

export function sampleSignals(sample: PositionSample, players: Player[], standardField: boolean): TacticalSignal[] {
  const ball = sample.ball;
  if (!standardField || sample.active !== true || !ball || Math.hypot(ball.x, ball.y) < 350) return [];
  const signals: TacticalSignal[] = [];
  for (const team of [0, 1] as const) {
    const roster = players.filter((player) => player.team === team);
    if (roster.length < 2) continue;
    const members = sample.players.filter((point) => roster.some((player) => player.id === point.id));
    // Missing or demolished teammates must not be interpreted as bad rotation.
    if (members.length !== roster.length) continue;
    const grounded = members.filter((member) => member.z < 300);
    const close = grounded.filter((member) =>
      grounded.some((other) => member.id !== other.id && distance(member, other) < RULES.close));
    if (close.length) signals.push({ kind: "close", team, playerIds: close.map((member) => member.id) });
    const far = members.filter((member) =>
      members.every((other) => member.id === other.id || distance(member, other) > RULES.far));
    if (far.length) signals.push({ kind: "far", team, playerIds: far.map((member) => member.id) });
    const pressing = grounded.filter((member) => ball.z < 300 && distance(member, ball) < RULES.pressure);
    if (pressing.length >= 2) signals.push({ kind: "pressure", team, playerIds: pressing.map((member) => member.id) });
    const direction = team === 0 ? 1 : -1;
    if (ball.y * direction < -500 && !members.some((member) => member.y * direction < ball.y * direction - RULES.cover)) {
      signals.push({ kind: "coverage", team, playerIds: members.map((member) => member.id) });
    }
  }
  return signals;
}

export function sampleWeight(samples: PositionSample[], index: number, interval: number): number {
  const next = samples[index + 1];
  return next ? Math.max(0, Math.min(next.time - samples[index].time, interval * 1.5)) : 0;
}

export function heatCell(point: Position): number | null {
  if (Math.abs(point.x) > FIELD.halfWidth || Math.abs(point.y) > FIELD.halfLength) return null;
  const col = Math.min(HEAT_COLUMNS - 1, Math.floor((point.x + FIELD.halfWidth) / (FIELD.halfWidth * 2) * HEAT_COLUMNS));
  const row = Math.min(HEAT_ROWS - 1, Math.floor((point.y + FIELD.halfLength) / (FIELD.halfLength * 2) * HEAT_ROWS));
  return row * HEAT_COLUMNS + col;
}

export function heatmapFor(samples: PositionSample[], interval: number, playerId: string, start = 0, end = Infinity): number[] {
  const heat = Array<number>(HEAT_COLUMNS * HEAT_ROWS).fill(0);
  samples.forEach((sample, index) => {
    if (sample.active === false) return;
    const point = sample.players.find((player) => player.id === playerId);
    if (!point) return;
    const cell = heatCell(point);
    const dt = Math.max(0, Math.min(end, sample.time + sampleWeight(samples, index, interval)) - Math.max(start, sample.time));
    if (cell !== null) heat[cell] += dt;
  });
  return heat;
}

export function analyzeTelemetry(replay: Replay): SpatialAnalysis {
  const telemetry = replay.telemetry;
  const heatmaps: Record<string, number[]> = {};
  const stats: Record<string, PlayerSpatialStats> = {};
  const distanceSums: Record<string, number> = {};
  const distanceTimes: Record<string, number> = {};
  const boostSums: Record<string, number> = {};
  for (const player of replay.players) {
    heatmaps[player.id] = Array<number>(HEAT_COLUMNS * HEAT_ROWS).fill(0);
    stats[player.id] = {
      trackedSeconds: 0, evaluatedSeconds: 0, meanDistance: null,
      closeSeconds: 0, farSeconds: 0, pressureSeconds: 0, coverageSeconds: 0,
      lowBoostSeconds: 0, boostSeconds: 0, meanBoost: null,
      largePickups: 0, smallPickups: 0, unknownPickups: 0,
    };
    distanceSums[player.id] = 0;
    distanceTimes[player.id] = 0;
    boostSums[player.id] = 0;
  }
  const events: TacticalEvent[] = [];
  const runs = new Map<string, TacticalEvent>();
  const finish = (key: string) => {
    const run = runs.get(key);
    if (run && run.end - run.start >= RULES.minimumSeconds - 0.001) events.push(run);
    runs.delete(key);
  };
  telemetry.samples.forEach((sample, index) => {
    const dt = sampleWeight(telemetry.samples, index, telemetry.sampleInterval);
    const signals = sampleSignals(sample, replay.players, telemetry.standardField);
    const activeKeys = new Set<string>();
    for (const signal of signals) {
      const key = `${signal.team}-${signal.kind}-${signal.playerIds.slice().sort().join(",")}`;
      activeKeys.add(key);
      const previous = runs.get(key);
      if (previous && sample.time - previous.end > 0.001) finish(key);
      const run = runs.get(key);
      if (run) run.end = sample.time + dt;
      else runs.set(key, { ...signal, start: sample.time, end: sample.time + dt });
    }
    for (const key of runs.keys()) if (!activeKeys.has(key)) finish(key);
    for (const point of sample.players) {
      const player = replay.players.find((member) => member.id === point.id);
      const row = stats[point.id];
      if (!player || !row || sample.active === false) continue;
      row.trackedSeconds += dt;
      if (point.boost !== null) {
        row.boostSeconds += dt;
        boostSums[point.id] += point.boost * dt;
        if (point.boost < 20) row.lowBoostSeconds += dt;
      }
      const cell = heatCell(point);
      if (cell !== null) heatmaps[point.id][cell] += dt;
      const teammates = sample.players.filter((other) =>
        other.id !== point.id && replay.players.some((member) => member.id === other.id && member.team === player.team));
      const roster = replay.players.filter((member) => member.team === player.team);
      const complete = roster.every((member) => sample.players.some((other) => other.id === member.id));
      if (sample.active === true && sample.ball && Math.hypot(sample.ball.x, sample.ball.y) >= 350 &&
        telemetry.standardField && complete && roster.length >= 2) {
        row.evaluatedSeconds += dt;
        distanceSums[point.id] += Math.min(...teammates.map((other) => distance(point, other))) * dt;
        distanceTimes[point.id] += dt;
      }
    }
  });
  for (const key of runs.keys()) finish(key);
  // Only persistent signals contribute to the tactical percentages.
  for (const event of events) {
    for (const id of event.playerIds) {
      const row = stats[id];
      if (!row) continue;
      const seconds = event.end - event.start;
      if (event.kind === "close") row.closeSeconds += seconds;
      if (event.kind === "far") row.farSeconds += seconds;
      if (event.kind === "pressure") row.pressureSeconds += seconds;
      if (event.kind === "coverage") row.coverageSeconds += seconds;
    }
  }
  for (const pickup of telemetry.pickups) {
    const row = stats[pickup.playerId];
    if (!row) continue;
    if (pickup.size === "large") row.largePickups++;
    else if (pickup.size === "small") row.smallPickups++;
    else row.unknownPickups++;
  }
  for (const player of replay.players) {
    const row = stats[player.id];
    row.meanDistance = distanceTimes[player.id] > 0 ? distanceSums[player.id] / distanceTimes[player.id] : null;
    row.meanBoost = row.boostSeconds > 0 ? boostSums[player.id] / row.boostSeconds : null;
  }
  return { players: stats, heatmaps, events: events.sort((a, b) => a.start - b.start) };
}
