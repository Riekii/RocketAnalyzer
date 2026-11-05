import { radarValues } from "@/lib/analysis";
import { teamTotal, type Player, type Replay, type StatKey } from "@/lib/replay";

const labels = ["Puntos", "Goles", "Asistencias", "Paradas", "Tiros"];

function point(index: number, radius: number): [number, number] {
  const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
  return [160 + Math.cos(angle) * radius, 137 + Math.sin(angle) * radius];
}

function polygon(values: number[], radius: number): string {
  return values.map((value, index) => point(index, Math.max(value, 0) * radius).join(",")).join(" ");
}

export function Radar({ first, second, replay }: { first: Player; second: Player; replay: Replay }) {
  return (
    <svg className="radar" viewBox="0 0 320 280" role="img"
      aria-label={`Comparación de ${first.name} y ${second.name}. Cada eje se normaliza al mejor valor de la partida; consulta los datos numéricos en la tabla de jugadores.`}>
      {[0.25, 0.5, 0.75, 1].map((step) => (
        <polygon key={step} points={polygon([step, step, step, step, step], 88)}
          fill={step === 1 ? "rgba(255,255,255,.015)" : "none"} stroke="#2b3442" />
      ))}
      {labels.map((label, index) => {
        const [x, y] = point(index, 88);
        const [tx, ty] = point(index, 119);
        return (
          <g key={label}>
            <line x1="160" y1="137" x2={x} y2={y} stroke="#2b3442" />
            <text x={tx} y={ty + 4} textAnchor="middle" fill="#9ca9bb" fontSize="11">{label}</text>
          </g>
        );
      })}
      <polygon points={polygon(radarValues(second, replay), 88)}
        fill="rgba(255,166,77,.12)" stroke="#ffa64d" strokeWidth="2" />
      <polygon points={polygon(radarValues(first, replay), 88)}
        fill="rgba(83,172,255,.2)" stroke="#53acff" strokeWidth="2" />
      {radarValues(first, replay).map((value, index) => {
        const [cx, cy] = point(index, value * 88);
        return <circle key={index} cx={cx} cy={cy} r="3" fill="#78beff" />;
      })}
    </svg>
  );
}

export function TeamComparison({ replay }: { replay: Replay }) {
  const metrics: { key: StatKey; label: string }[] = [
    { key: "shots", label: "Tiros" },
    { key: "saves", label: "Paradas" },
    { key: "assists", label: "Asistencias" },
    { key: "score", label: "Puntos" },
  ];
  return (
    <div className="team-comparison">
      {metrics.map(({ key, label }) => {
        const blue = teamTotal(replay.players, 0, key);
        const orange = teamTotal(replay.players, 1, key);
        const maximum = Math.max(blue ?? 0, orange ?? 0, 1);
        return (
          <div className="comparison-row" key={key}>
            <div className="comparison-values">
              <strong className="text-blue">{blue ?? "N/D"}</strong>
              <span>{label}</span>
              <strong className="text-orange">{orange ?? "N/D"}</strong>
            </div>
            <div className="split-bar" aria-hidden="true">
              <div className="bar-left"><i style={{ width: `${(blue ?? 0) / maximum * 100}%` }} /></div>
              <div className="bar-right"><i style={{ width: `${(orange ?? 0) / maximum * 100}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Arena() {
  return (
    <svg className="arena" viewBox="0 0 620 280" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="field" x1="80" y1="240" x2="540" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#102d48" /><stop offset=".5" stopColor="#112434" /><stop offset="1" stopColor="#42301e" />
        </linearGradient>
        <linearGradient id="field-stroke"><stop stopColor="#56acff" /><stop offset="1" stopColor="#ffae61" /></linearGradient>
        <radialGradient id="ball-glow"><stop stopColor="#b0d7ff" stopOpacity=".4" /><stop offset="1" stopColor="#8ac4ff" stopOpacity="0" /></radialGradient>
        <pattern id="grass" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="25" height="50" fill="#fff" fillOpacity=".015" /></pattern>
      </defs>
      <g transform="translate(78 18) rotate(-13 230 130) skewX(15) scale(1 .8)">
        <rect x="4" y="12" width="460" height="260" rx="48" stroke="#030a13" strokeWidth="14" />
        <rect width="460" height="260" rx="48" fill="url(#field)" stroke="url(#field-stroke)" strokeOpacity=".6" strokeWidth="2" />
        <rect width="460" height="260" rx="48" fill="url(#grass)" />
        <rect x="16" y="16" width="428" height="228" rx="35" stroke="#d4e5f4" strokeOpacity=".17" />
        <path d="M230 16v228" stroke="#d4e5f4" strokeOpacity=".25" />
        <circle cx="230" cy="130" r="48" stroke="#d4e5f4" strokeOpacity=".25" />
        <circle cx="230" cy="130" r="3" fill="#d4e5f4" fillOpacity=".5" />
        <path d="M16 67h68v126H16m428-126h-68v126h68" stroke="#d4e5f4" strokeOpacity=".22" />
        <path d="M0 94h-18v72H0" stroke="#53acff" strokeWidth="4" />
        <path d="M460 94h18v72h-18" stroke="#ffa64d" strokeWidth="4" />
        {[65, 230, 395].map((x) => [42, 218].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#ffc16a" fillOpacity=".65" />))}
        <circle cx="285" cy="116" r="45" fill="url(#ball-glow)" />
        <circle cx="285" cy="116" r="9" fill="#d9e8ef" stroke="#fff" strokeWidth="2" />
        <path d="m281 111 6 1 2 6-5 3-5-5z" fill="#536575" />
        <g transform="translate(154 163) rotate(-35)">
          <path d="M-21 0h-26" stroke="#5bafff" strokeWidth="6" strokeLinecap="round" opacity=".22" />
          <rect x="-18" y="-10" width="36" height="20" rx="5" fill="#4aabff" stroke="#94d0ff" strokeWidth="2" />
          <rect x="-3" y="-7" width="12" height="14" rx="3" fill="#183855" />
        </g>
        <g transform="translate(365 70) rotate(135)">
          <rect x="-18" y="-10" width="36" height="20" rx="5" fill="#f3a252" stroke="#ffd19e" strokeWidth="2" />
          <rect x="-3" y="-7" width="12" height="14" rx="3" fill="#674122" />
        </g>
      </g>
    </svg>
  );
}
