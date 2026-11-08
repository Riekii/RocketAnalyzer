import type { Position, PositionSample, Rotation } from "./telemetry.ts";

export function timelinePosition(seconds: number | null, start: number, end: number): number | null {
  return seconds !== null && Number.isFinite(seconds) && end > start && seconds >= start && seconds <= end
    ? (seconds - start) / (end - start) * 100 : null;
}

export function initialPlaybackTime(samples: PositionSample[], playerCount: number): number {
  return (samples.find((sample) => sample.ball && sample.players.length >= playerCount && playerCount > 0)
    ?? samples.find((sample) => sample.ball && sample.players.length > 0)
    ?? samples.find((sample) => sample.players.length > 0)
    ?? samples[0])?.time ?? 0;
}

export function interpolateRotation(a: Rotation, b: Rotation, ratio: number): Rotation {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  const angle = Math.acos(dot);
  const sine = Math.sin(angle);
  const first = dot > .9995 ? 1 - ratio : Math.sin((1 - ratio) * angle) / sine;
  const second = (dot > .9995 ? ratio : Math.sin(ratio * angle) / sine) * sign;
  const result = { x: a.x * first + b.x * second, y: a.y * first + b.y * second,
    z: a.z * first + b.z * second, w: a.w * first + b.w * second };
  const length = Math.hypot(result.x, result.y, result.z, result.w);
  return { x: result.x / length, y: result.y / length, z: result.z / length, w: result.w / length };
}

export function playbackTime(from: number, elapsedMilliseconds: number, speed: number, end: number): number {
  return Math.min(end, from + Math.max(0, elapsedMilliseconds) / 1000 * speed);
}

export function sampleIndexAt(samples: PositionSample[], time: number): number {
  let low = 0, high = samples.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (samples[middle].time <= time) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function interpolatedSample(samples: PositionSample[], time: number, interval: number): PositionSample | undefined {
  const index = sampleIndexAt(samples, time);
  const before = samples[index], after = samples[index + 1];
  if (!before) return undefined;
  if (time - before.time > interval * 1.5 + .001) {
    return { time, active: null, ball: null, players: [] };
  }
  if (!after || time <= before.time) return before;
  const gap = after.time - before.time;
  if (gap <= 0 || gap > interval * 1.5 + .001 || before.active !== after.active) return before;
  const ratio = Math.min(1, (time - before.time) / gap);
  const blend = (a: Position, b: Position, speed: number): Position => {
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > speed * gap + 150) return a;
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, z: a.z + (b.z - a.z) * ratio };
  };
  return {
    ...before, time,
    ball: before.ball && after.ball ? blend(before.ball, after.ball, 6500) : before.ball,
    players: before.players.map((point) => {
      const next = after.players.find((other) => other.id === point.id);
      if (!next) return point;
      const position = blend(point, next, 2300);
      return { ...point, ...position,
        ...(position !== point && point.rotation && next.rotation
          ? { rotation: interpolateRotation(point.rotation, next.rotation, ratio) } : {}) };
    }),
  };
}
