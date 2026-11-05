import type { Replay } from "./replay.ts";
import { FIELD, sampleWeight, type PlayerPosition, type Position } from "./telemetry.ts";

export interface DetailedStats {
  seconds: number;
  boostSeconds: number;
  meanBoost: number | null;
  emptyBoostSeconds: number;
  fullBoostSeconds: number;
  airSeconds: number;
  contactSeconds: number;
  approaches: number;
  possibleMisses: number[];
}

const separation = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function detailedStats(replay: Replay): Record<string, DetailedStats> {
  const result: Record<string, DetailedStats> = {};
  const { samples, sampleInterval, standardField } = replay.telemetry;
  for (const player of replay.players) {
    const row: DetailedStats = {
      seconds: 0, boostSeconds: 0, meanBoost: null, emptyBoostSeconds: 0,
      fullBoostSeconds: 0, airSeconds: 0, contactSeconds: 0, approaches: 0, possibleMisses: [],
    };
    result[player.id] = row;
    let boostSum = 0;
    let previous: { point: PlayerPosition; ball: Position; distance: number; time: number } | undefined;
    let attempt: { time: number; touches: number; touched: boolean } | undefined;
    samples.forEach((sample, index) => {
      const point = sample.players.find((member) => member.id === player.id);
      const dt = sampleWeight(samples, index, sampleInterval);
      if (sample.active !== true || !point) {
        previous = undefined; attempt = undefined; return;
      }
      row.seconds += dt;
      if (point.boost !== null) {
        row.boostSeconds += dt;
        boostSum += point.boost * dt;
        if (point.boost <= 1) row.emptyBoostSeconds += dt;
        if (point.boost >= 99) row.fullBoostSeconds += dt;
      }
      // Height alone cannot distinguish wall driving from flying near the perimeter.
      if (standardField && point.z > 300 && Math.abs(point.x) < FIELD.halfWidth - 250 &&
        Math.abs(point.y) < FIELD.halfLength - 250) row.airSeconds += dt;
      if (!sample.ball || point.ballTouches === undefined) {
        previous = undefined; attempt = undefined; return;
      }
      row.contactSeconds += dt;
      const distance = separation(point, sample.ball);
      if (!previous || sample.time - previous.time > sampleInterval * 1.5 + .001 ||
        previous.point.ballTouches === undefined || point.ballTouches < previous.point.ballTouches ||
        separation(point, previous.point) > 2300 * (sample.time - previous.time) + 150) {
        attempt = undefined;
      } else {
        const towardBall = previous.distance > 0
          ? ((point.x - previous.point.x) * (previous.ball.x - previous.point.x) +
            (point.y - previous.point.y) * (previous.ball.y - previous.point.y) +
            (point.z - previous.point.z) * (previous.ball.z - previous.point.z)) / previous.distance
          : 0;
        if (!attempt && previous.distance > 600 && distance <= 600 &&
          previous.distance - distance >= 100 && towardBall >= 300 * (sample.time - previous.time)) {
          attempt = { time: sample.time, touches: previous.point.ballTouches, touched: false };
          row.approaches++;
        }
        if (attempt) {
          attempt.touched ||= point.ballTouches > attempt.touches;
          if (sample.time - attempt.time > 3) attempt = undefined;
          else if (distance > 900) {
            if (!attempt.touched) row.possibleMisses.push(attempt.time);
            attempt = undefined;
          }
        }
      }
      previous = { point, ball: sample.ball, distance, time: sample.time };
    });
    row.meanBoost = row.boostSeconds > 0 ? boostSum / row.boostSeconds : null;
  }
  return result;
}
