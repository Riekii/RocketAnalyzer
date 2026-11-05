"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Replay } from "@/lib/replay";
import { formatTime } from "@/lib/replay";
import {
  distance, heatmapFor, sampleSignals, TACTICAL_LABELS, type SpatialAnalysis,
} from "@/lib/telemetry";
import { FieldMap, PLAYER_COLORS } from "./field-map";
import { Icon } from "./icon";
import { interpolatedSample, playbackTime, sampleIndexAt } from "@/lib/playback";
import { detailedStats } from "@/lib/detailed-stats";

const percentage = (seconds: number, total: number) => total > 0 ? `${Math.round(seconds / total * 100)} %` : "N/D";
const meters = (units: number | null) => units === null ? "N/D" : `${(units / 100).toFixed(1)} m`;

export function SpatialWorkspace({ replay, analysis, selectedId, onSelect }: {
  replay: Replay; analysis: SpatialAnalysis; selectedId: string; onSelect: (id: string) => void;
}) {
  const [time, setTime] = useState(0);
  const clock = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [heatScope, setHeatScope] = useState<"match" | "recent">("match");
  const samples = replay.telemetry.samples;
  const index = sampleIndexAt(samples, time);
  const observedSample = samples[index];
  const sample = interpolatedSample(samples, time, replay.telemetry.sampleInterval);
  const details = useMemo(() => detailedStats(replay), [replay]);
  const selected = replay.players.find((player) => player.id === selectedId) ?? replay.players[0];
  const stats = analysis.players[selectedId];
  const signals = sample ? sampleSignals(sample, replay.players, replay.telemetry.standardField) : [];
  const events = analysis.events.filter((event) => event.playerIds.includes(selectedId));
  const pickups = replay.telemetry.pickups.filter((pickup) => pickup.playerId === selectedId);
  const positions = new Map(sample?.players.map((point) => [point.id, point]));
  const currentHeat = useMemo(() => {
    if (heatScope === "match" || !observedSample) return analysis.heatmaps[selectedId];
    return heatmapFor(samples, replay.telemetry.sampleInterval, selectedId, Math.max(0, observedSample.time - 10), observedSample.time);
  }, [heatScope, observedSample, samples, selectedId, analysis, replay.telemetry.sampleInterval]);

  useEffect(() => {
    if (!playing || samples.length < 2) return;
    const start = performance.now();
    const from = clock.current;
    const end = samples[samples.length - 1].time;
    let frame: number;
    function tick(now: number) {
      const next = playbackTime(from, now - start, speed, end);
      clock.current = next;
      setTime(next);
      if (next >= end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, samples]);

  function setPosition(next: number) {
    clock.current = next;
    setTime(next);
  }

  function seek(time: number) {
    const next = samples.findIndex((point) => point.time >= time);
    setPosition(samples[next < 0 ? Math.max(0, samples.length - 1) : next]?.time ?? 0);
    setPlaying(false);
  }

  return (
    <div className="spatial-workspace">
      <section className="panel roster-panel" aria-labelledby="players-title">
        <div className="section-heading"><h2 id="players-title">Todos los jugadores</h2><span className="note">Selecciona una fila o un mapa</span></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Estadísticas y turbo de todos los jugadores">
          <table className="telemetry-table">
            <caption className="sr-only">Turbo y distancia corresponden al instante seleccionado. Los pads son el total observado en la grabación. Tipos de pad estimados por proximidad.</caption>
            <thead><tr>
              <th scope="col">Jugador</th><th scope="col">Pts</th><th scope="col">G</th><th scope="col">A</th><th scope="col">Par.</th><th scope="col">Tiros</th><th scope="col">% tiro</th>
              <th scope="col">Turbo ahora</th><th scope="col" title="Recogidas observadas, tipo estimado por proximidad: grandes / pequeñas / sin tipo">Pads G / P / ?</th>
              <th scope="col" title="Distancia horizontal al compañero más cercano en el instante seleccionado">Dist. comp.</th>
            </tr></thead>
            <tbody>{replay.players.map((player, number) => {
              const point = positions.get(player.id);
              const teammates = sample?.players.filter((other) => other.id !== player.id &&
                replay.players.some((member) => member.id === other.id && member.team === player.team)) ?? [];
              const nearest = point && teammates.length ? Math.min(...teammates.map((other) => distance(point, other))) : null;
              const row = analysis.players[player.id];
              return <tr key={player.id} className={selectedId === player.id ? "selected-row" : ""}>
                <th scope="row"><button className="player-name" onClick={() => onSelect(player.id)} aria-pressed={selectedId === player.id}>
                  <span className="player-number" style={{ background: PLAYER_COLORS[number % PLAYER_COLORS.length] }}>{number + 1}</span>
                  <span className="roster-name">{player.name}<small className={player.team === 0 ? "text-blue" : "text-orange"}>{player.team === 0 ? "Azul" : "Naranja"}</small></span>
                </button></th>
                <td>{player.score ?? "N/D"}</td><td>{player.goals ?? "N/D"}</td><td>{player.assists ?? "N/D"}</td><td>{player.saves ?? "N/D"}</td><td>{player.shots ?? "N/D"}</td>
                <td>{player.shooting === null ? "N/D" : `${player.shooting} %`}</td>
                <td><span className="boost-value">{point?.boost === null || point?.boost === undefined ? "N/D" : `${point.boost} %`}</span><meter min={0} max={100} value={point?.boost ?? 0} aria-label={`Turbo de ${player.name}`} aria-valuetext={point?.boost === null || point?.boost === undefined ? "No disponible" : `${point.boost} %`} /></td>
                <td>{replay.telemetry.pickupsObserved && row.trackedSeconds > 0 ? `${row.largePickups} / ${row.smallPickups} / ${row.unknownPickups}` : "N/D"}</td>
                <td>{replay.telemetry.standardField ? meters(nearest) : "N/D"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="player-heatmaps" aria-label="Mapas de calor de todos los jugadores">
          {replay.players.map((player, number) => <button key={player.id} className={`mini-heat ${selectedId === player.id ? "selected" : ""}`} onClick={() => onSelect(player.id)} aria-pressed={selectedId === player.id}>
            <span><i style={{ background: PLAYER_COLORS[number % PLAYER_COLORS.length] }}>{number + 1}</i>{player.name}</span>
            {analysis.players[player.id].trackedSeconds > 0 && replay.telemetry.standardField ? <FieldMap replay={replay} heat={analysis.heatmaps[player.id]} selectedId={player.id} small /> : <span className="no-mini">{replay.telemetry.standardField ? "Sin posiciones" : "Mapa no disponible"}</span>}
          </button>)}
        </div>
        <div className="spatial-statistics">
          <h3>{selected.name} · durante el juego evaluable</h3>
          <dl>
            <div><dt>Distancia media al compañero</dt><dd>{meters(stats.meanDistance)}</dd></div>
            <div><dt>Muy juntos (&lt; 7 m)</dt><dd>{percentage(stats.closeSeconds, stats.evaluatedSeconds)}</dd></div>
            <div><dt>Aislado (&gt; 40 m)</dt><dd>{percentage(stats.farSeconds, stats.evaluatedSeconds)}</dd></div>
            <div><dt>Posible doble presión</dt><dd>{percentage(stats.pressureSeconds, stats.evaluatedSeconds)}</dd></div>
            <div><dt>Falta de cobertura</dt><dd>{percentage(stats.coverageSeconds, stats.evaluatedSeconds)}</dd></div>
            <div><dt>Tiempo con turbo &lt; 20 %</dt><dd>{percentage(stats.lowBoostSeconds, stats.boostSeconds)}</dd></div>
          </dl>
          <p className="note">{Math.round(stats.trackedSeconds)} s con posiciones · {Math.round(stats.evaluatedSeconds)} s evaluables. Distancias en planta, 100 uu ≈ 1 m.</p>
        </div>
      </section>

      <section className="panel field-panel" aria-labelledby="field-title">
        <div className="section-heading"><h2 id="field-title">Campo y mapa de calor</h2><span className="note">{selected.name}</span></div>
        <div className="fields-grid">
          <div className="field-box">
            <h3>Posiciones · {sample ? `${formatTime(sample.time)}.${Math.floor(sample.time % 1 * 10)}` : "N/D"}</h3>
            {sample?.players.length && replay.telemetry.standardField ? <FieldMap replay={replay} sample={sample} selectedId={selectedId} pickups={replay.telemetry.pickups} onSelect={onSelect} />
              : <div className="no-field">{!replay.telemetry.standardField && samples.length ? "Geometría de campo no verificada." : "Sin posiciones en este instante."}<br />No se inventan posiciones.</div>}
          </div>
          <div className="field-box">
            <div className="heat-heading"><h3>Calor · {selected.name}</h3><select value={heatScope} aria-label="Intervalo del mapa de calor" onChange={(event) => setHeatScope(event.target.value === "recent" ? "recent" : "match")}><option value="match">Toda la partida</option><option value="recent">Últimos 10 s</option></select></div>
            {stats.trackedSeconds > 0 && replay.telemetry.standardField ? <FieldMap replay={replay} heat={currentHeat} selectedId={selectedId} /> : <div className="no-field">No hay mapa de calor disponible.</div>}
          </div>
        </div>
        <div className="playback">
          <button className="button" disabled={!samples.length} aria-label={playing ? "Pausar" : "Reproducir posiciones"} onClick={() => {
            if (!playing && index >= samples.length - 1) setPosition(samples[0]?.time ?? 0);
            setPlaying((previous) => !previous);
          }}>{playing ? "Pausa" : "Reproducir"}</button>
          <input type="range" min={0} max={Math.max(0, samples.length - 1)} step={1} value={index} disabled={!samples.length}
            aria-label="Instante de la repetición" aria-valuetext={sample ? `${sample.time.toFixed(1)} segundos` : "Sin datos"}
            onChange={(event) => { setPosition(samples[Number(event.target.value)]?.time ?? 0); setPlaying(false); }} />
          <select aria-label="Velocidad de reproducción" value={speed} onChange={(event) => {
            const next = Number(event.target.value);
            if ([1, 1.5, 2, 3].includes(next)) setSpeed(next);
          }}>
            <option value={1}>×1</option><option value={1.5}>×1,5</option><option value={2}>×2</option><option value={3}>×3</option>
          </select>
          <span>{formatTime(sample?.time ?? null)} / {formatTime(samples.at(-1)?.time ?? null)}</span>
        </div>
        <div className="live-signals" aria-live="polite">
          {!sample ? "Sube una repetición para ver posiciones reales."
            : !replay.telemetry.standardField ? "Geometría no verificada: sin valoración táctica."
            : sample.active !== true ? "Pausa, saque o fase de juego no identificada: sin valoración táctica."
            : signals.filter((signal) => signal.playerIds.includes(selectedId)).map((signal) => TACTICAL_LABELS[signal.kind]).join(" · ") || "Sin señales en este instante (no implica una rotación correcta)."}
        </div>
        <div className="spatial-event-grid">
          <section><h3>Situaciones a revisar · {events.length}</h3><div className="event-list">
            {events.length ? events.map((event, number) => <button key={`${event.start}-${event.kind}-${number}`} onClick={() => seek(event.start)}>
              <time>{formatTime(event.start)}</time><span>{TACTICAL_LABELS[event.kind]}</span><small>{(event.end - event.start).toFixed(1)} s</small>
            </button>) : <p className="note">{stats.evaluatedSeconds > 0 ? "Sin señales sostenidas de al menos 2 s." : "No hay suficiente juego activo con el equipo completo."}</p>}
          </div></section>
          <section><h3>Turbo recogido · {pickups.length}{!replay.telemetry.pickupsObserved && " (N/D)"}</h3><div className="event-list">
            {pickups.length ? pickups.map((pickup, number) => <button key={`${pickup.time}-${number}`} onClick={() => seek(pickup.time)}>
              <time>{formatTime(pickup.time)}</time><span>{pickup.size === "large" ? "Grande ≈100" : pickup.size === "small" ? "Pequeño ≈12" : "Tipo desconocido"} · {pickup.padId}</span>
            </button>) : <p className="note">{replay.telemetry.pickupsObserved ? "Sin recogidas atribuidas a este jugador." : "Recogidas no disponibles."}</p>}
          </div></section>
        </div>
        <details className="spatial-method"><summary>Criterios y límites</summary>
          <p>Datos muestreados aproximadamente a 5 Hz. La reproducción interpola posiciones entre muestras continuas; no interpola huecos, cambios de fase ni saltos de posición. Las estadísticas usan solo muestras originales. El calor pondera tiempo observado; cada miniatura tiene su propia escala.</p>
          <p>Se señalan situaciones de al menos 2 s: compañeros en el suelo a menos de 7 m; aislamiento a más de 40 m del compañero más cercano; dos compañeros en el suelo a menos de 10 m del balón bajo; balón en campo propio sin nadie al menos 5 m por detrás.</p>
          <p>Se excluyen pausas identificadas, el inicio tras el saque, balón cerca del centro, equipos incompletos y mapas no verificados. Son señales heurísticas, no una calificación de rotación: una presión conjunta puede ser intencional.</p>
          <p>Los eventos confirman recogidas. El pad y su tipo se estiman por proximidad en campos estándar; 12/100 es capacidad, no turbo neto ganado. Los puntos del campo no indican disponibilidad. Las distancias son horizontales y no consideran altura.</p>
        </details>
      </section>

      <section className="panel detailed-statistics" aria-labelledby="detailed-title">
        <div className="section-heading"><h2 id="detailed-title">Más estadísticas · toda la partida</h2><span className="note">Solo tiempo de juego activo observado</span></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Estadísticas ampliadas de todos los jugadores">
          <table className="telemetry-table">
            <thead><tr><th scope="col">Jugador</th><th scope="col">Turbo medio</th><th scope="col">Sin turbo ≤1 %</th><th scope="col">Turbo lleno ≥99 %</th><th scope="col">Pads G / P / ?</th><th scope="col">En el aire*</th><th scope="col">% aéreo*</th><th scope="col">Aproximaciones*</th><th scope="col">Posibles fallos*</th></tr></thead>
            <tbody>{replay.players.map((player) => {
              const row = details[player.id], spatial = analysis.players[player.id];
              return <tr key={player.id} className={player.id === selectedId ? "selected-row" : ""}>
                <th scope="row"><button className="player-name" onClick={() => onSelect(player.id)} aria-pressed={player.id === selectedId}>{player.name}</button></th>
                <td>{row.meanBoost === null ? "N/D" : `${Math.round(row.meanBoost)} %`}</td>
                <td>{row.boostSeconds > 0 ? `${row.emptyBoostSeconds.toFixed(1)} s (${percentage(row.emptyBoostSeconds, row.boostSeconds)})` : "N/D"}</td>
                <td>{row.boostSeconds > 0 ? `${row.fullBoostSeconds.toFixed(1)} s (${percentage(row.fullBoostSeconds, row.boostSeconds)})` : "N/D"}</td>
                <td>{replay.telemetry.pickupsObserved && spatial.trackedSeconds > 0 ? `${spatial.largePickups} / ${spatial.smallPickups} / ${spatial.unknownPickups}` : "N/D"}</td>
                <td>{row.seconds > 0 && replay.telemetry.standardField ? `${row.airSeconds.toFixed(1)} s` : "N/D"}</td>
                <td>{replay.telemetry.standardField ? percentage(row.airSeconds, row.seconds) : "N/D"}</td>
                <td>{row.contactSeconds > 0 ? row.approaches : "N/D"}</td><td>{row.contactSeconds > 0 ? row.possibleMisses.length : "N/D"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="detail-notes">
          <details>
            <summary className="note">Cómo se calculan estas estadísticas</summary>
            <p className="note">* Aire estimado: altura &gt; 3 m, fuera de los 2,5 m próximos al perímetro; excluye parte del vuelo junto a paredes. No equivale al tiempo sin ruedas en el suelo. Pads: total de recogidas observadas, incluidos intervalos no activos.</p>
            <p className="note">* Aproximación: cruzar de más de 6 m a 6 m o menos del balón, cerrando al menos 1 m entre muestras y moviendo el coche hacia él a ≥3 m/s (distancia 3D). Posible fallo: separarse a más de 9 m antes de 3 s sin aumento del contador de toques. Puede ser una finta o una decisión intencional; no es un error confirmado. Se omiten huecos, pausas, teletransportes y períodos sin contador de toques.</p>
          </details>
          <h3>Posibles fallos · {selected.name}</h3>
          <div className="miss-events">{details[selectedId].possibleMisses.map((at) => <button className="button" key={at} onClick={() => seek(at)} aria-label={`Ver posible fallo en ${formatTime(at)}`}>{formatTime(at)}</button>)}</div>
          {!details[selectedId].possibleMisses.length && <p className="note">{details[selectedId].contactSeconds > 0 ? "Sin posibles fallos detectados con estos criterios." : "No hay datos suficientes del contador de toques."}</p>}
          <p className="note">{details[selectedId].seconds.toFixed(1)} s de juego con posiciones · {details[selectedId].boostSeconds.toFixed(1)} s con turbo · {details[selectedId].contactSeconds.toFixed(1)} s con balón y contador de toques disponibles.</p>
        </div>
      </section>
    </div>
  );
}
