import { emptyTelemetry, type Telemetry } from "./telemetry.ts";

export const MAX_REPLAY_BYTES = 32 * 1024 * 1024;
export const MAX_REPLAY_LABEL = "32 MB";

export type Team = 0 | 1;
export type StatKey = "score" | "goals" | "assists" | "saves" | "shots";

export interface Player {
  id: string;
  name: string;
  team: Team;
  score: number | null;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  shots: number | null;
  shooting: number | null;
}

export interface Goal {
  player: string;
  team: Team;
  frame: number;
  seconds: number | null;
}

export interface Replay {
  id: string;
  filename: string;
  title: string;
  map: string;
  date: string | null;
  teamSize: number;
  duration: number | null;
  scores: [number | null, number | null];
  players: Player[];
  goals: Goal[];
  warnings: string[];
  demo: boolean;
  telemetry: Telemetry;
}

export class ReplayValidationError extends Error {}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function integer(value: unknown): number | null {
  const result = number(value);
  return result !== null && Number.isSafeInteger(result) ? result : null;
}

function team(value: unknown): Team | null {
  return value === 0 || value === 1 ? value : null;
}

export function teamTotal(players: Player[], side: Team, stat: StatKey): number | null {
  const members = players.filter((player) => player.team === side);
  if (!members.length || members.some((player) => player[stat] === null)) return null;
  return members.reduce((total, player) => total + (player[stat] ?? 0), 0);
}

export function shootingPercentage(goals: number | null, shots: number | null): number | null {
  return goals !== null && shots !== null && shots > 0
    ? Math.round((goals / shots) * 100)
    : null;
}

export function normalizeReplay(raw: unknown, filename: string, id: string): Replay {
  const root = object(raw);
  const props = object(root?.properties);
  if (!props || root?.game_type !== "TAGame.Replay_Soccar_TA") {
    throw new ReplayValidationError("El archivo no contiene una repetición de fútbol de Rocket League compatible.");
  }
  if (!Array.isArray(props.PlayerStats) || !props.PlayerStats.length) {
    throw new ReplayValidationError("La repetición no incluye estadísticas de jugadores.");
  }
  if (props.PlayerStats.length > 64) {
    throw new ReplayValidationError("La repetición contiene demasiados registros de jugadores.");
  }

  const warnings: string[] = [];
  const players: Player[] = [];
  for (const [index, entry] of props.PlayerStats.entries()) {
    const row = object(entry);
    if (!row) throw new ReplayValidationError("Las estadísticas de un jugador están dañadas.");
    const side = team(row.Team);
    if (side === null) {
      warnings.push("Se ha excluido un registro sin equipo válido (posible espectador).");
      continue;
    }
    const goals = integer(row.Goals);
    const shots = integer(row.Shots);
    players.push({
      id: `${side}-${index}`,
      name: text(row.Name) ?? `Jugador ${index + 1}`,
      team: side,
      score: integer(row.Score),
      goals,
      assists: integer(row.Assists),
      saves: integer(row.Saves),
      shots,
      shooting: shootingPercentage(goals, shots),
    });
  }
  if (!players.length) throw new ReplayValidationError("No hay jugadores con un equipo válido.");
  if (players.some((player) =>
    [player.score, player.goals, player.assists, player.saves, player.shots].includes(null),
  )) {
    warnings.push("Algunas estadísticas no están presentes; se muestran como N/D, nunca como cero.");
  }

  const fps = number(props.RecordFPS);
  const frames = integer(props.NumFrames);
  const duration = fps !== null && fps > 0 && frames !== null ? frames / fps : null;
  const goals: Goal[] = [];
  if (Array.isArray(props.Goals)) {
    for (const entry of props.Goals) {
      const row = object(entry);
      const side = team(row?.PlayerTeam);
      const frame = integer(row?.frame);
      if (!row || side === null || frame === null) {
        warnings.push("Se ha omitido un evento de gol incompleto.");
        continue;
      }
      goals.push({
        player: text(row.PlayerName) ?? "Autor no disponible",
        team: side,
        frame,
        seconds: fps !== null && fps > 0 ? frame / fps : null,
      });
    }
    goals.sort((a, b) => a.frame - b.frame);
  } else {
    warnings.push("Esta repetición no incluye una cronología de goles.");
  }
  const scores: Replay["scores"] = [
    integer(props.Team0Score),
    integer(props.Team1Score),
  ];
  if (scores.some((score) => score === null)) {
    warnings.push("Falta parte del marcador oficial. No se infiere sumando jugadores que pudieron abandonar.");
  }
  const expectedGoals = scores[0] !== null && scores[1] !== null ? scores[0] + scores[1] : null;
  if (expectedGoals !== null && expectedGoals !== goals.length && Array.isArray(props.Goals)) {
    warnings.push("La cronología de goles no coincide con el marcador; puede ser una grabación parcial.");
  }
  const recordedTeamSize = integer(props.TeamSize);
  return {
    id,
    filename,
    title: text(props.ReplayName) ?? filename.replace(/\.replay$/i, ""),
    map: text(props.MapName) ?? "Mapa no disponible",
    date: text(props.Date),
    teamSize: recordedTeamSize && recordedTeamSize <= 32
      ? recordedTeamSize
      : Math.max(players.filter((player) => player.team === 0).length,
        players.filter((player) => player.team === 1).length),
    duration,
    scores,
    players,
    goals,
    warnings: [...new Set(warnings)],
    demo: false,
    telemetry: emptyTelemetry("No hay datos espaciales en este informe."),
  };
}

export function formatTime(seconds: number | null): string {
  if (seconds === null) return "N/D";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
