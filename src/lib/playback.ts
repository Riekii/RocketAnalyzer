import type { Position, PositionSample } from "./telemetry.ts";

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
  if (!before || !after || time <= before.time) return before;
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
      return next ? { ...point, ...blend(point, next, 2300) } : point;
    }),
  };
}
