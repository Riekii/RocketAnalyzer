import { shootingPercentage, teamTotal, type Player, type Replay, type StatKey } from "./replay.ts";
import type { PlayerSpatialStats } from "./telemetry.ts";

export interface Insight {
  kind: "positive" | "focus" | "neutral";
  title: string;
  evidence: string;
  advice: string;
}

export interface Improvement {
  evidence: string;
  action: string;
}

export function getImprovementSummary(player: Player, replay: Replay, spatial?: PlayerSpatialStats): Improvement[] {
  const priorities: Improvement[] = [];
  if (spatial && spatial.evaluatedSeconds >= 20) {
    const percentage = (seconds: number) => Math.round(seconds / spatial.evaluatedSeconds * 100);
    if (spatial.coverageSeconds >= 3 && percentage(spatial.coverageSeconds) >= 5) priorities.push({
      evidence: `Faltó cobertura por detrás del balón durante el ${percentage(spatial.coverageSeconds)} % del tiempo evaluable.`,
      action: "Revisa las marcas de falta de cobertura y comprueba si alguien podía quedarse por detrás del balón cuando defendíais.",
    });
    if (spatial.pressureSeconds >= 3 && percentage(spatial.pressureSeconds) >= 5) priorities.push({
      evidence: `Posible doble presión en el ${percentage(spatial.pressureSeconds)} % del tiempo evaluable.`,
      action: "En las jugadas señaladas, comprueba si uno podía presionar y el otro mantener apoyo, en lugar de ir los dos al balón.",
    });
    if (spatial.closeSeconds >= 3 && percentage(spatial.closeSeconds) >= 5) priorities.push({
      evidence: `Estuviste a menos de 7 m de un compañero el ${percentage(spatial.closeSeconds)} % del tiempo evaluable.`,
      action: "Revisa si podías abrirte a otra línea de pase. Estar juntos puede ser intencional: comprueba la jugada antes de cambiar tu rotación.",
    });
    if (spatial.farSeconds >= 3 && percentage(spatial.farSeconds) >= 5) priorities.push({
      evidence: `Estuviste a más de 40 m del compañero más cercano el ${percentage(spatial.farSeconds)} % del tiempo evaluable.`,
      action: "Revisa si te quedaste sin apoyo por buscar turbo o si esa separación era necesaria para cubrir la portería.",
    });
  }
  if (spatial && spatial.boostSeconds >= 20 && spatial.lowBoostSeconds / spatial.boostSeconds >= 0.4) priorities.push({
    evidence: `Turbo por debajo del 20 % durante el ${Math.round(spatial.lowBoostSeconds / spatial.boostSeconds * 100)} % del tiempo observado.`,
    action: "Prueba a enlazar pads pequeños al volver a defender, sin abandonar la jugada para buscar un turbo grande.",
  });
  priorities.push(...getInsights(player, replay)
    .filter((insight) => insight.kind === "focus")
    .map((insight) => ({ evidence: insight.evidence, action: insight.advice })));

  if (player.saves !== null && player.saves >= 3) {
    priorities.push({
      evidence: `${player.saves} paradas: revisa las jugadas previas.`,
      action: "Mira cómo empezó cada ataque rival y busca una ocasión en la que pudieras cortar la jugada antes. Tener muchas paradas no significa defender mal.",
    });
  }

  if (!priorities.length) {
    return [{
      evidence: "El marcador no muestra un aspecto claro que debas corregir.",
      action: "Revisa un gol encajado o una ocasión fallada y elige una jugada para practicar. Con estos datos no se puede valorar cómo te colocas.",
    }];
  }
  return priorities.slice(0, 2);
}

export function getInsights(player: Player, replay: Replay): Insight[] {
  const insights: Insight[] = [];
  if (player.shots !== null && player.shots >= 4 && player.goals !== null && player.shooting !== null) {
    const accurate = player.goals / player.shots >= 0.3;
    insights.push({
      kind: accurate ? "positive" : "focus",
      title: accurate ? "Buena conversión de tiros" : "Da más intención a tus tiros",
      evidence: `${player.goals} goles de ${player.shots} tiros (${player.shooting} %).`,
      advice: accurate
        ? "Has superado la referencia de conversión de esta herramienta. Practica mantener esa precisión con tiros colocados desde distintos ángulos."
        : "Hay margen para mejorar la conversión. Prueba 10 minutos de tiros a las esquinas antes de tu próxima sesión.",
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
  return shootingPercentage(goals, shots);
}
