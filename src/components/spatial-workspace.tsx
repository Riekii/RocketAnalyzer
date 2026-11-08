"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Replay } from "@/lib/replay";
import { formatTime } from "@/lib/replay";
import {
  distance, heatmapFor, playerDistances, TACTICAL_LABELS, type SpatialAnalysis,
} from "@/lib/telemetry";
import { FieldMap, TEAM_COLORS } from "./field-map";
import { initialPlaybackTime, interpolatedSample, playbackTime, sampleIndexAt, timelinePosition } from "@/lib/playback";
import { detailedStats } from "@/lib/detailed-stats";
import { Replay3D } from "./replay-3d";

const percentage = (seconds: number, total: number) => total > 0 ? `${Math.round(seconds / total * 100)} %` : "N/D";
const meters = (units: number | null) => units === null ? "N/D" : `${(units / 100).toFixed(1)} m`;

export function SpatialWorkspace({ replay, analysis, selectedId, onSelect, loading = false, onReady }: {
  replay: Replay; analysis: SpatialAnalysis; selectedId: string; onSelect: (id: string) => void; loading?: boolean; onReady?: () => void;
}) {
  const [time, setTime] = useState(() => initialPlaybackTime(replay.telemetry.samples, replay.players.length));
  const clock = useRef(time);
  const animation = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [heatScope, setHeatScope] = useState<"match" | "recent">("match");
  const [eventTab, setEventTab] = useState<"errors" | "boost" | "demos">("errors");
  const tabsId = useId();
  const samples = replay.telemetry.samples;
  const startTime = samples[0]?.time ?? 0;
  const endTime = samples.at(-1)?.time ?? 0;
  const goalPosition = (seconds: number | null) => timelinePosition(seconds, startTime, endTime);
  const index = sampleIndexAt(samples, time);
  const observedSample = samples[index];
  const sample = interpolatedSample(samples, time, replay.telemetry.sampleInterval);
  const details = useMemo(() => detailedStats(replay), [replay]);
  const selected = replay.players.find((player) => player.id === selectedId) ?? replay.players[0];
  const stats = analysis.players[selectedId];
  const pickups = useMemo(() => replay.telemetry.pickups.filter((pickup) => pickup.playerId === selectedId), [replay, selectedId]);
  const errors = useMemo(() => [
    ...analysis.events.filter((event) => event.playerIds.includes(selectedId)).map((event) => ({
      time: event.start, label: TACTICAL_LABELS[event.kind], duration: `${(event.end - event.start).toFixed(1)} s`,
    })),
    ...details[selectedId].possibleMisses.map((time) => ({ time, label: "Posible fallo al balón", duration: "" })),
  ].sort((a, b) => a.time - b.time), [analysis, details, selectedId]);
  const demolitions = replay.telemetry.demolitions ?? [];
  const distances = playerDistances(sample, replay.players);
  const positions = new Map(sample?.players.map((point) => [point.id, point]));
  const currentHeat = useMemo(() => {
    if (heatScope === "match" || !observedSample) return analysis.heatmaps[selectedId];
    return heatmapFor(samples, replay.telemetry.sampleInterval, selectedId, Math.max(0, observedSample.time - 10), observedSample.time);
  }, [heatScope, observedSample, samples, selectedId, analysis, replay.telemetry.sampleInterval]);

  useEffect(() => {
    if (!playing || loading || samples.length < 2) return;
    const start = performance.now();
    const from = clock.current;
    const end = samples[samples.length - 1].time;
    function tick(now: number) {
      const next = playbackTime(from, now - start, speed, end);
      clock.current = next;
      setTime(next);
      if (next >= end) setPlaying(false);
      else animation.current = requestAnimationFrame(tick);
    }
    animation.current = requestAnimationFrame(tick);
    return () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null;
    };
  }, [playing, speed, samples, loading]);

  function pause() {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    setPlaying(false);
  }

  function setPosition(next: number) {
    clock.current = next;
    setTime(next);
  }

  function seek(time: number) {
    pause();
    setPosition(Math.max(samples[0]?.time ?? 0, Math.min(time, samples.at(-1)?.time ?? 0)));
  }

  function togglePlayback() {
    if (playing) pause();
    else {
      if (time >= (samples.at(-1)?.time ?? 0)) setPosition(samples[0]?.time ?? 0);
      setPlaying(true);
    }
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
                  <span className="player-number" style={{ background: TEAM_COLORS[player.team] }}>{number + 1}</span>
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
            <span><i style={{ background: TEAM_COLORS[player.team] }}>{number + 1}</i>{player.name}</span>
            {analysis.players[player.id].trackedSeconds > 0 ? <FieldMap replay={replay} heat={analysis.heatmaps[player.id]} selectedId={player.id} small /> : <span className="no-mini">Sin posiciones</span>}
          </button>)}
        </div>
        <div className="spatial-statistics">
          <h3>{selected.name} · datos observados</h3>
          <dl>
            <div><dt>Distancia media al compañero</dt><dd>{meters(stats.meanDistance)}</dd></div>
            <div><dt>Tiempo con turbo &lt; 20 %</dt><dd>{percentage(stats.lowBoostSeconds, stats.boostSeconds)}</dd></div>
          </dl>
          <p className="note">{Math.round(stats.trackedSeconds)} s con posiciones. Turbo y distancia de la tabla: instante elegido. Pads: total observado · G grande / P pequeño / ? sin tipo.</p>
        </div>
        <div className="distance-matrix table-scroll" tabIndex={0} role="region" aria-label="Distancias entre todos los jugadores">
          <table>
            <caption>Distancias entre todos · metros en planta · instante elegido</caption>
            <thead><tr><th scope="col">Jugador</th>{replay.players.map((player, number) => <th key={player.id} scope="col" title={player.name} style={{ color: TEAM_COLORS[player.team] }}>{number + 1}</th>)}</tr></thead>
            <tbody>{replay.players.map((player, number) => <tr key={player.id}>
              <th scope="row"><span style={{ color: TEAM_COLORS[player.team] }}>{number + 1}</span> {player.name}</th>
              {replay.players.map((other) => {
                const pair = distances.find(({ first, second }) => (first.id === player.id && second.id === other.id) ||
                  (first.id === other.id && second.id === player.id));
                return <td key={other.id}>{player.id === other.id ? "—"
                  : replay.telemetry.standardField && pair ? (pair.units / 100).toFixed(1) : "N/D"}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel field-panel" aria-labelledby="field-title">
        <div className="section-heading"><h2 id="field-title">Campo y mapa de calor</h2><span className="note">{selected.name}</span></div>
        <div className="fields-grid">
          <div className="field-box">
            <h3>Posiciones · {samples.length ? `${formatTime(time)}.${Math.floor(time % 1 * 10)}` : "N/D"}</h3>
            {sample?.players.length ? <FieldMap replay={replay} sample={sample} selectedId={selectedId} pickups={replay.telemetry.pickups} onSelect={onSelect} />
              : <div className="no-field">Sin posiciones en este instante.<br />No se inventan posiciones.</div>}
          </div>
          <div className="field-box">
            <div className="heat-heading"><h3>Calor · {selected.name}</h3><select value={heatScope} aria-label="Intervalo del mapa de calor" onChange={(event) => setHeatScope(event.target.value === "recent" ? "recent" : "match")}><option value="match">Toda la partida</option><option value="recent">Últimos 10 s</option></select></div>
            {stats.trackedSeconds > 0 ? <FieldMap replay={replay} heat={currentHeat} selectedId={selectedId} /> : <div className="no-field">No hay mapa de calor disponible.</div>}
          </div>
        </div>
        {!replay.telemetry.standardField && <p className="note reference-field-note">Campo de referencia: geometría de {replay.map} no verificada. Posiciones reales; el perímetro y el calor pueden no coincidir con el estadio. Pads y valoración táctica desactivados.</p>}
        <div className="playback">
          <button className="button" disabled={!samples.length} aria-label={playing ? "Pausar" : "Reproducir posiciones"} onClick={togglePlayback}>{playing ? "Pausa" : "Reproducir"}</button>
          <div className="playback-timeline">
          <input type="range" min={startTime} max={endTime} step="any" value={time} disabled={!samples.length}
            aria-label="Instante de la repetición" aria-valuetext={samples.length ? `${time.toFixed(2)} segundos` : "Sin datos"}
            onPointerDown={pause}
            onKeyDown={(event) => {
              const changes: Record<string, number> = {
                ArrowRight: event.shiftKey ? 1 : .1, ArrowUp: event.shiftKey ? 1 : .1,
                ArrowLeft: event.shiftKey ? -1 : -.1, ArrowDown: event.shiftKey ? -1 : -.1,
                PageUp: 10, PageDown: -10,
              };
              if (event.key === "Home" || event.key === "End" || event.key in changes) {
                event.preventDefault();
                seek(event.key === "Home" ? samples[0]?.time ?? 0
                  : event.key === "End" ? samples.at(-1)?.time ?? 0 : time + changes[event.key]);
              }
            }}
            onChange={(event) => seek(Number(event.target.value))} />
          <div className="goal-markers" aria-hidden="true">
            {replay.goals.map((goal, number) => {
              const position = goalPosition(goal.seconds);
              return position === null ? null : <i key={`${goal.frame}-${number}`}
                style={{ left: `${position}%`, background: TEAM_COLORS[goal.team] }} />;
            })}
          </div>
          </div>
          <select aria-label="Velocidad de reproducción" value={speed} onChange={(event) => {
            const next = Number(event.target.value);
            if ([1, 1.5, 2, 3].includes(next)) setSpeed(next);
          }}>
            <option value={1}>×1</option><option value={1.5}>×1,5</option><option value={2}>×2</option><option value={3}>×3</option>
          </select>
          <span>{formatTime(samples.length ? time : null)} / {formatTime(samples.at(-1)?.time ?? null)}</span>
        </div>
        <div className="goal-timestamps" role="group" aria-label="Goles: tiempos desde el inicio de la grabación">
          <span className="note">Goles · tiempo de grabación</span>
          {replay.goals.map((goal, number) => <button key={`${goal.frame}-${number}`}
            disabled={goalPosition(goal.seconds) === null}
            onClick={() => { if (goal.seconds !== null) seek(goal.seconds); }}
            title={`Gol de ${goal.player} · ${formatTime(goal.seconds)} desde el inicio de la grabación`}
            style={{ borderColor: TEAM_COLORS[goal.team] }}>
            <time>{formatTime(goal.seconds)}</time>
            <span className={goal.team === 0 ? "text-blue" : "text-orange"}>{goal.player}</span>
          </button>)}
          {!replay.goals.length && <span className="note">Sin goles registrados.</span>}
        </div>
        <div className="replay-events">
          <div className="event-tabs" role="tablist" aria-label="Eventos de la repetición">
            {(["errors", "boost", "demos"] as const).map((tab, index, tabs) => <button
              key={tab} type="button" role="tab" id={`${tabsId}-${tab}`}
              aria-selected={eventTab === tab} aria-controls={`${tabsId}-${tab}-panel`}
              tabIndex={eventTab === tab ? 0 : -1}
              onClick={() => setEventTab(tab)} onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
                if (next >= 0) {
                  event.preventDefault();
                  setEventTab(tabs[next]);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                }
              }}>
              {tab === "errors" ? `Errores (${errors.length})` : tab === "boost"
                ? `Boost (${replay.telemetry.pickupsObserved ? pickups.length : "N/D"})`
                : `Demos (${replay.telemetry.demolitionsObserved ? demolitions.length : "N/D"})`}
            </button>)}
          </div>
          <section role="tabpanel" id={`${tabsId}-errors-panel`} aria-labelledby={`${tabsId}-errors`} hidden={eventTab !== "errors"} tabIndex={0}>
            <h3>Errores posibles · {selected.name}</h3>
            <div className="event-list">{errors.map((event, number) => <button key={`${event.time}-${number}`} onClick={() => seek(event.time)}>
              <time>{formatTime(event.time)}</time><span>{event.label}</span><small>{event.duration}</small>
            </button>)}</div>
            {!errors.length && <p className="note">{stats.evaluatedSeconds > 0 || details[selectedId].contactSeconds > 0
              ? "Sin eventos detectados con los datos disponibles." : "No hay datos suficientes para detectar errores."}</p>}
            <p className="note">Señales orientativas, no errores confirmados. Pulsa un evento para verlo en el campo.</p>
          </section>
          <section role="tabpanel" id={`${tabsId}-boost-panel`} aria-labelledby={`${tabsId}-boost`} hidden={eventTab !== "boost"} tabIndex={0}>
            <h3>Boost recogido · {selected.name}</h3><div className="event-list">
            {pickups.length ? pickups.map((pickup, number) => <button key={`${pickup.time}-${number}`} onClick={() => seek(pickup.time)}>
              <time>{formatTime(pickup.time)}</time><span>{pickup.size === "large" ? "Grande ≈100" : pickup.size === "small" ? "Pequeño ≈12" : "Tipo desconocido"} · {pickup.padId}</span>
            </button>) : <p className="note">{replay.telemetry.pickupsObserved ? "Sin recogidas atribuidas a este jugador." : "Recogidas no disponibles."}</p>}
          </div></section>
          <section role="tabpanel" id={`${tabsId}-demos-panel`} aria-labelledby={`${tabsId}-demos`} hidden={eventTab !== "demos"} tabIndex={0}>
            <h3>Demoliciones · todos los jugadores</h3>
            <div className="demo-totals">{replay.players.map((player) => <span key={player.id} style={{ color: TEAM_COLORS[player.team] }}>
              {player.name}: {replay.telemetry.demolitionsObserved
                ? `${demolitions.filter((event) => event.attackerId === player.id && event.cause === "player").length} hechas / ${demolitions.filter((event) => event.victimId === player.id).length} recibidas`
                : "N/D"}
            </span>)}</div>
            <div className="event-list">{demolitions.map((event, number) => <button key={`${event.time}-${number}`} onClick={() => seek(event.time)}>
              <time>{formatTime(event.time)}</time><span>
                {event.cause === "self" ? "Autodemolición" : event.cause === "goal" ? "Explosión de gol"
                  : replay.players.find((player) => player.id === event.attackerId)?.name ?? "Atacante sin identificar"}
                {" → "}{replay.players.find((player) => player.id === event.victimId)?.name ?? "Víctima sin identificar"}
              </span>
            </button>)}</div>
            {!demolitions.length && <p className="note">{replay.telemetry.demolitionsObserved
              ? "No se observaron demoliciones." : "Datos de demoliciones no disponibles. Vuelve a subir la repetición para leer los eventos."}</p>}
            <p className="note">Eventos replicados observados, no inferidos por desaparición de coches. Los totales pueden ser incompletos.</p>
          </section>
        </div>
        <details className="spatial-method"><summary>Criterios y límites</summary>
          <p>Datos muestreados aproximadamente a 5 Hz. La reproducción interpola posiciones entre muestras continuas; no interpola huecos, cambios de fase ni saltos de posición. Las estadísticas usan solo muestras originales. El calor pondera tiempo observado; cada miniatura tiene su propia escala.</p>
          <p>Los eventos confirman recogidas. El pad y su tipo se estiman por proximidad en campos estándar; 12/100 es capacidad, no turbo neto ganado. Los puntos del campo no indican disponibilidad. Las distancias son horizontales y no consideran altura.</p>
          <p>Errores posibles: señales tácticas sostenidas al menos 2 s (compañeros en el suelo a menos de 7 m, aislamiento a más de 40 m, doble presión a menos de 10 m del balón bajo o sin cobertura 5 m por detrás del balón en campo propio). Se excluyen pausas identificadas, saques, equipos incompletos y mapas no verificados. Los posibles fallos al balón se explican en las estadísticas ampliadas. No se generan consejos.</p>
          <p>El campo conecta todas las parejas de cada equipo, también entre compañeros no seleccionados. La matriz incluye además distancias entre rivales; no hay datos para jugadores sin posición en el instante elegido.</p>
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
          <p className="note">{details[selectedId].seconds.toFixed(1)} s de juego con posiciones · {details[selectedId].boostSeconds.toFixed(1)} s con turbo · {details[selectedId].contactSeconds.toFixed(1)} s con balón y contador de toques disponibles.</p>
        </div>
      </section>
      <Replay3D replay={replay} sample={sample} selectedId={selectedId} time={time} playing={playing} speed={speed}
        onReady={onReady} onSeek={seek} onToggle={togglePlayback} onSpeed={(next) => { if ([1, 1.5, 2, 3].includes(next)) setSpeed(next); }} />
    </div>
  );
}
