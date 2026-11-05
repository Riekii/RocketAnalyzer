import { memo, useId } from "react";
import type { Replay } from "@/lib/replay";
import {
  BOOST_PADS, FIELD, HEAT_COLUMNS, HEAT_ROWS, playerDistances,
  type Position, type PositionSample, type BoostPickup,
} from "@/lib/telemetry";

export const TEAM_COLORS = ["#6bb8ff", "#ffae6c"] as const;

function coordinates(point: Position): [number, number] {
  return [35 + (point.y + FIELD.halfLength) / (FIELD.halfLength * 2) * 500,
    28 + (FIELD.halfWidth - point.x) / (FIELD.halfWidth * 2) * 400];
}

export const FieldMap = memo(function FieldMap({ replay, sample, heat, selectedId, pickups = [], onSelect, small = false }: {
  replay: Replay;
  sample?: PositionSample;
  heat?: number[];
  selectedId: string;
  pickups?: BoostPickup[];
  onSelect?: (id: string) => void;
  small?: boolean;
}) {
  const clip = useId();
  const maximum = Math.max(0, ...(heat ?? []));
  const pairs = !heat ? playerDistances(sample, replay.players).filter((pair) => pair.team !== null) : [];
  return (
    <svg className={`field-map ${small ? "mini-field" : ""}`} viewBox="0 0 570 456" role="img"
      aria-label={heat ? "Mapa de calor: más intensidad indica más tiempo observado en esa zona." : "Posiciones en el instante seleccionado. Los números corresponden a los jugadores de la tabla."}>
      <defs><clipPath id={clip}><rect x="35" y="28" width="500" height="400" rx="38" /></clipPath></defs>
      <rect x="35" y="28" width="500" height="400" rx="38" fill="#16292a" stroke="#64817e" strokeWidth="2" />
      <g clipPath={`url(#${clip})`}>
        <rect x="35" y="28" width="250" height="400" fill="#244e731f" />
        <rect x="285" y="28" width="250" height="400" fill="#78502f1f" />
        {heat && maximum > 0 && heat.map((seconds, index) => {
          if (!seconds) return null;
          const row = Math.floor(index / HEAT_COLUMNS), col = index % HEAT_COLUMNS;
          const [x, y] = coordinates({
            x: -FIELD.halfWidth + (col + 0.5) / HEAT_COLUMNS * FIELD.halfWidth * 2,
            y: -FIELD.halfLength + (row + 0.5) / HEAT_ROWS * FIELD.halfLength * 2, z: 0,
          });
          return <rect key={index} x={x - 250 / HEAT_ROWS} y={y - 200 / HEAT_COLUMNS}
            width={500 / HEAT_ROWS + 0.5} height={400 / HEAT_COLUMNS + 0.5}
            fill={`hsl(${55 - seconds / maximum * 50} 95% 58%)`}
            opacity={0.15 + Math.sqrt(seconds / maximum) * 0.75}>
            <title>{seconds.toFixed(1)} s observados</title>
          </rect>;
        })}
        <path d="M285 28v400M35 145h85v166H35m500-166h-85v166h85" stroke="#b0c7ca" strokeOpacity=".4" strokeWidth="1.5" fill="none" />
        <circle cx="285" cy="228" r="52" stroke="#b0c7ca" strokeOpacity=".4" fill="none" />
        {!small && replay.telemetry.standardField && BOOST_PADS.map((pad) => {
          const [cx, cy] = coordinates(pad);
          const recent = pickups.some((pickup) => pickup.padId === pad.id && sample &&
            sample.time >= pickup.time && sample.time - pickup.time < 1);
          return <circle key={pad.id} cx={cx} cy={cy} r={pad.large ? 5 : 2.5}
            fill={recent ? "#fff3ac" : pad.large ? "#be964f" : "#8a845c"} opacity={recent ? 1 : .65}>
            <title>{pad.id} · {pad.large ? "100" : "12"} de capacidad · ubicación de referencia, no disponibilidad</title>
          </circle>;
        })}
        {pairs.map(({ first, second, team, units }) => {
          const [x1, y1] = coordinates(first), [x2, y2] = coordinates(second);
          return <g key={`${first.id}-${second.id}`} className="distance-pair">
            <title>{replay.players.find((player) => player.id === first.id)?.name} ↔ {replay.players.find((player) => player.id === second.id)?.name}</title>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={TEAM_COLORS[team ?? 0]} strokeDasharray="5 6" opacity=".65" />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} fill="#e1ecf5" stroke="#11202d" strokeWidth="3" paintOrder="stroke" fontSize="12" textAnchor="middle">
              {(units / 100).toFixed(1)} m
            </text>
          </g>;
        })}
        {sample?.ball && !heat && (() => {
          const [cx, cy] = coordinates(sample.ball);
          return <circle cx={cx} cy={cy} r="7" fill="#fff" stroke="#364253" strokeWidth="2"><title>Balón · altura {(sample.ball.z / 100).toFixed(1)} m</title></circle>;
        })()}
        {!heat && sample?.players.map((point) => {
          const index = replay.players.findIndex((player) => player.id === point.id);
          const player = replay.players[index];
          const [cx, cy] = coordinates(point);
          return <g key={point.id} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
            aria-label={`${player.name}, turbo ${point.boost ?? "no disponible"} %, altura ${(point.z / 100).toFixed(1)} metros`}
            onClick={() => onSelect?.(point.id)} onKeyDown={(event) => {
              if (onSelect && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(point.id); }
            }} style={{ cursor: onSelect ? "pointer" : undefined }}>
            <circle cx={cx} cy={cy} r={point.id === selectedId ? 13 : 10}
              fill={TEAM_COLORS[player.team]} stroke={point.id === selectedId ? "#fff" : "#0e1520"} strokeWidth="3" />
            <text x={cx} y={cy + 4} textAnchor="middle" fill="#09121d" fontSize="11" fontWeight="700">{index + 1}</text>
            <title>{player.name} · {point.boost ?? "N/D"} % turbo · z {(point.z / 100).toFixed(1)} m</title>
          </g>;
        })}
      </g>
      <path d="M35 187H19v82h16" stroke="#6bb8ff" strokeWidth="4" fill="none" />
      <path d="M535 187h16v82h-16" stroke="#ffae6c" strokeWidth="4" fill="none" />
      {!small && <><text x="35" y="448" fill="#95caff" fontSize="11">PORTERÍA AZUL</text><text x="535" y="448" textAnchor="end" fill="#ffc48f" fontSize="11">PORTERÍA NARANJA</text></>}
    </svg>
  );
});
