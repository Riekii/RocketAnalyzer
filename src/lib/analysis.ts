import { teamTotal, type Player, type Replay, type StatKey } from "./replay.ts";

export interface Insight {
  kind: "positive" | "focus" | "neutral";
  title: string;
  evidence: string;
  advice: string;
}

export function getInsights(player: Player, replay: Replay): Insight[] {
  const insights: Insight[] = [];
  if (player.shots !== null && player.shots >= 4 && player.shooting !== null) {
    const accurate = player.shooting >= 30;
    insights.push({
      kind: accurate ? "positive" : "focus",
      title: accurate ? "Buena conversión de tiros" : "Da más intención a tus tiros",
      evidence: `${player.goals} goles de ${player.shots} tiros (${player.shooting} %).`,
      advice: accurate
        ? "En esta partida has convertido al menos el 30 % de tus tiros. Practica mantener esa precisión con tiros colocados desde distintos ángulos."
        : "En esta partida has convertido menos del 30 % de tus tiros. Prueba 10 minutos de tiros a las esquinas antes de tu próxima sesión.",
    });
  } else if (player.shots !== null && player.shots <= 1) {
    insights.push({
      kind: "focus",
      title: "Revisa tus oportunidades de ataque",
      evidence: `${player.shots} ${player.shots === 1 ? "tiro registrado" : "tiros registrados"} en la repetición.`,
      advice: "Revisa si podías participar más en ataque sin romper la rotación. Un volumen bajo no implica por sí solo que hayas jugado mal.",
    });
  }
  if (player.assists !== null && player.assists >= 2) {
    insights.push({
      kind: "positive",
      title: "Has conectado con tu equipo",
      evidence: `${player.assists} asistencias registradas.`,
      advice: "Has participado como asistente en varias jugadas de gol. Sigue buscando compañeros disponibles antes de forzar una jugada individual.",
    });
  }
  if (player.saves !== null && player.saves >= 3) {
    insights.push({
      kind: "neutral",
      title: "Una partida con trabajo defensivo",
      evidence: `${player.saves} paradas registradas.`,
      advice: "Revisa las jugadas previas a esas paradas para distinguir buenas coberturas de presión defensiva sostenida. Las paradas no describen por sí solas tu posicionamiento.",
    });
  }
  const teamGoals = replay.scores[player.team];
  if (teamGoals !== null && teamGoals > 0 && player.goals !== null && player.assists !== null) {
    const involvement = player.goals + player.assists;
    // Own goals, disconnects and partial recordings can make this ratio inconsistent.
    if (involvement <= teamGoals) {
      insights.push({
        kind: involvement / teamGoals >= 0.6 ? "positive" : "neutral",
        title: "Tu participación en los goles",
        evidence: `${Math.round(involvement / teamGoals * 100)} % de participación directa (${involvement}/${teamGoals}).`,
        advice: "Este indicador cuenta goles y asistencias, no aperturas de espacio ni pases previos. Úsalo como contexto, no como una valoración global.",
      });
    }
  }
  if (!insights.length) {
    insights.push({
      kind: "neutral",
      title: "Necesitamos más contexto",
      evidence: "Las estadísticas disponibles no permiten destacar un patrón claro.",
      advice: "Revisa la repetición en el juego. No es fiable deducir tu nivel, tus rotaciones o el uso del turbo a partir de este marcador.",
    });
  }
  return insights;
}

export function radarValues(player: Player, replay: Replay): number[] {
  const keys: StatKey[] = ["score", "goals", "assists", "saves", "shots"];
  return keys.map((key) => {
    const best = Math.max(0, ...replay.players.map((member) => member[key] ?? 0));
    return best > 0 && player[key] !== null ? player[key] / best : 0;
  });
}

export function teamShooting(replay: Replay, side: 0 | 1): number | null {
  const goals = teamTotal(replay.players, side, "goals");
  const shots = teamTotal(replay.players, side, "shots");
  return goals !== null && shots !== null && shots > 0
    ? Math.round(goals / shots * 100)
    : null;
}
