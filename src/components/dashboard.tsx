"use client";

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { getInsights, teamShooting, type Insight } from "@/lib/analysis";
import { demoReplay } from "@/lib/demo";
import { formatTime, MAX_REPLAY_BYTES, MAX_REPLAY_LABEL, teamTotal, type Player, type Replay, type StatKey } from "@/lib/replay";
import { Arena, Radar, TeamComparison } from "./charts";
import { Icon, type IconName } from "./icon";

type Tab = "overview" | "players" | "insights";
const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "overview", label: "Vista general", icon: "grid" },
  { id: "players", label: "Jugadores", icon: "users" },
  { id: "insights", label: "Mejorar mi juego", icon: "chart" },
];
const columns: { key: StatKey; label: string }[] = [
  { key: "score", label: "Puntos" }, { key: "goals", label: "Goles" },
  { key: "assists", label: "Asist." }, { key: "saves", label: "Paradas" },
  { key: "shots", label: "Tiros" },
];

function PlayerAvatar({ player, small = false }: { player: Player; small?: boolean }) {
  return <span className={`avatar ${player.team === 0 ? "blue" : "orange"} ${small ? "small" : ""}`}>{player.name.slice(0, 2).toUpperCase()}</span>;
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className={`insight-card ${insight.kind}`}>
      <span className="insight-icon"><Icon name={insight.kind === "positive" ? "check" : insight.kind === "focus" ? "target" : "info"} size={18} /></span>
      <div>
        <h3>{insight.title}</h3>
        <p className="insight-evidence">{insight.evidence}</p>
        <p>{insight.advice}</p>
      </div>
    </article>
  );
}

function PlayerTable({ replay, selectedId, onSelect }: {
  replay: Replay; selectedId: string; onSelect: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="player-table">
        <caption className="sr-only">Estadísticas de los jugadores. Selecciona un jugador para ver su análisis.</caption>
        <thead><tr><th>Jugador</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Acierto</th></tr></thead>
        <tbody>
          {([0, 1] as const).map((side) =>
            [...replay.players].filter((player) => player.team === side).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((player, index) => (
              <tr key={player.id} className={`${player.team === 0 ? "blue-row" : "orange-row"} ${selectedId === player.id ? "selected-row" : ""} ${index === 0 ? "team-start" : ""}`}>
                <td>
                  <button className="player-button" onClick={() => onSelect(player.id)} aria-pressed={selectedId === player.id}>
                    <PlayerAvatar player={player} small />
                    <span>{player.name}<small>Equipo {player.team === 0 ? "azul" : "naranja"}</small></span>
                    {selectedId === player.id && <span className="selected-player-dot" aria-label="Seleccionado" />}
                  </button>
                </td>
                {columns.map(({ key }) => <td key={key} className={key === "score" ? "score-cell" : ""}>{player[key] ?? "N/D"}</td>)}
                <td>{player.shooting === null ? "N/D" : `${player.shooting} %`}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function GoalTimeline({ replay }: { replay: Replay }) {
  return (
    <section className="panel timeline-panel">
      <div className="panel-heading"><div><h2>Así se decidió la partida</h2><p>Cronología de goles</p></div><Icon name="clock" /></div>
      {replay.goals.length > 0 ? (
        <ol className="goal-timeline">
          {replay.goals.map((goal, index) => (
            <li key={`${goal.frame}-${index}`} className={goal.team === 0 ? "blue" : "orange"}>
              <span className="goal-node"><Icon name="ball" size={17} /></span>
              <span className="goal-time">{formatTime(goal.seconds)}</span>
              <strong>{goal.player}</strong>
              <span className="goal-team">Equipo {goal.team === 0 ? "azul" : "naranja"}</span>
            </li>
          ))}
        </ol>
      ) : <p className="empty-message">No hay eventos de gol disponibles en esta repetición.</p>}
      <p className="footnote"><Icon name="info" size={13} /> Los tiempos son de la grabación, no del reloj del partido. Se calculan con los FPS guardados.</p>
    </section>
  );
}

export function Dashboard() {
  const [replay, setReplay] = useState<Replay>(demoReplay);
  const [history, setHistory] = useState<Replay[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState(demoReplay.players[0].id);
  const [compareId, setCompareId] = useState(demoReplay.players[2].id);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const comparisonId = useId();
  const playerId = useId();
  const selected = replay.players.find((player) => player.id === selectedId) ?? replay.players[0];
  const compare = replay.players.find((player) => player.id === compareId) ?? replay.players[0];
  const insights = getInsights(selected, replay);
  const shooting = teamShooting(replay, selected.team);
  const shots = teamTotal(replay.players, selected.team, "shots");
  const totalSaves = teamTotal(replay.players, selected.team, "saves");

  function showReplay(next: Replay) {
    if (uploadLock.current) return;
    setReplay(next);
    setSelectedId(next.players[0].id);
    setCompareId((next.players.find((player) => player.team !== next.players[0].team) ?? next.players[0]).id);
    setTab("overview");
    setError("");
    setAnnouncement(next.demo ? "Vista de ejemplo cargada." : `Análisis de ${next.filename} cargado.`);
  }

  async function upload(file: File) {
    if (uploadLock.current) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".replay")) {
      setError("Selecciona un archivo .replay de Rocket League, no un vídeo ni un archivo JSON.");
      return;
    }
    if (!file.size || file.size > MAX_REPLAY_BYTES) {
      setError(file.size ? "El archivo supera el límite de 32 MB." : "El archivo está vacío.");
      return;
    }
    uploadLock.current = true;
    setLoading(true);
    setAnnouncement(`Analizando ${file.name}.`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const form = new FormData();
      form.append("replay", file);
      const response = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal });
      if (!response.ok) {
        const failure: { error?: string } = await response.json();
        throw new Error(failure.error ?? `El servidor devolvió un error (${response.status}).`);
      }
      const result: Replay = await response.json();
      setReplay(result);
      setSelectedId(result.players[0].id);
      setCompareId((result.players.find((player) => player.team !== result.players[0].team) ?? result.players[0]).id);
      setHistory((previous) => [result, ...previous].slice(0, 8));
      setTab("overview");
      setAnnouncement(`Análisis completado: ${result.players.length} jugadores y ${result.goals.length} eventos de gol.`);
    } catch (cause) {
      const message = cause instanceof Error && cause.name === "AbortError"
        ? "El análisis ha tardado demasiado. Inténtalo otra vez con un archivo más pequeño."
        : cause instanceof Error ? cause.message : "No se ha podido contactar con el servidor.";
      setError(message);
      setAnnouncement("No se ha podido completar el análisis.");
    } finally {
      clearTimeout(timeout);
      uploadLock.current = false;
      setLoading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void upload(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (loading) return;
    if (event.dataTransfer.files.length !== 1) {
      setError("Sube una sola repetición cada vez.");
      return;
    }
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${replay.filename.replace(/\.replay$/i, "")}-analisis.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement("Se ha solicitado la descarga del informe JSON.");
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Saltar al análisis</a>
      <input ref={inputRef} type="file" accept=".replay" onChange={onFileChange} className="sr-only" tabIndex={-1} aria-label="Subir repetición de Rocket League" disabled={loading} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <aside className="sidebar">
        <a href="#main" className="brand" aria-label="Rocket Analyzer, inicio"><span className="brand-mark"><Icon name="rocket" size={24} /></span><span>rocket<span className="brand-light">analyzer</span><small>PLAY. ANALYZE. EVOLVE.</small></span></a>
        <p className="nav-caption">TU ESPACIO DE ANÁLISIS</p>
        <nav className="side-nav" aria-label="Navegación principal">
          {tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} aria-current={tab === item.id ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "insights" && <span className="nav-new">TIPS</span>}</button>)}
        </nav>
        <div className="sidebar-history">
          <p className="nav-caption">REPETICIONES DE ESTA SESIÓN <span>{history.length}</span></p>
          {history.length ? history.map((item) => <button className={`history-item ${replay.id === item.id ? "current" : ""}`} onClick={() => showReplay(item)} key={item.id} disabled={loading}><Icon name="file" size={16} /><span>{item.filename}<small>{item.scores[0] ?? "?"} : {item.scores[1] ?? "?"} · {item.teamSize}v{item.teamSize}</small></span></button>) : <div className="history-empty"><Icon name="file" size={23} /><p>Tu próxima partida empieza aquí.</p><span>Las repeticiones que analices aparecerán en esta sesión.</span></div>}
        </div>
        <div className="sidebar-bottom">
          <div className="local-badge"><span /><div>Análisis local<small>Tus archivos no salen a terceros</small></div><Icon name="shield" size={18} /></div>
          <button className="help-button" onClick={() => setHelp((value) => !value)} aria-expanded={help} aria-controls="help-panel"><Icon name="help" size={18} />Cómo funciona<Icon name="chevron" size={14} /></button>
          <p className="sidebar-version">ROCKET ANALYZER <span>v1.0</span></p>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><span>Mi espacio</span><Icon name="chevron" size={13} /><strong>Análisis de repetición</strong></div><div className="topbar-right"><span className="private-label"><Icon name="shield" size={14} /> Privado por diseño</span><span className="user-avatar">RL</span></div></header>
        <main id="main">
          <section className="page-heading">
            <div><p className="eyebrow"><span /> MENOS SUPOSICIONES. MÁS PROGRESO.</p><h1>Cada partida cuenta<span>.</span></h1><p>Entiende tu juego. Encuentra tu siguiente mejora.</p></div>
            <button className="button primary" onClick={() => inputRef.current?.click()} disabled={loading}><Icon name="upload" size={17} />{loading ? "Analizando…" : "Subir repetición"}</button>
          </section>

          {help && <section id="help-panel" className="help-panel panel"><div className="panel-heading"><h2>De la partida al siguiente nivel</h2><button className="icon-button" aria-label="Cerrar ayuda" onClick={() => setHelp(false)}><Icon name="close" /></button></div><ol><li>Guarda la repetición desde Rocket League al terminar una partida.</li><li>Busca tus archivos en <code>Documentos\My Games\Rocket League\TAGame\Demos</code> (también puede estar dentro de OneDrive).</li><li>Arrastra un archivo <code>.replay</code> aquí. No necesitas una cuenta ni un token de ballchasing.</li></ol><p>Compatible con Windows x64. Leemos el marcador guardado: no reconstruimos posiciones, turbo, velocidad ni un vídeo. El historial conserva hasta 8 informes en memoria y se vacía al recargar.</p></section>}

          <div className={`upload-zone ${dragging ? "dragging" : ""} ${loading ? "loading" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!loading) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={onDrop} aria-busy={loading}>
            <span className="upload-zone-icon"><Icon name={loading ? "clock" : "upload"} size={24} /></span>
            <div><strong>{loading ? "Descifrando tu partida…" : "Tu próxima mejora está en tu última repetición"}</strong><p>{loading ? "Leyendo las estadísticas reales del archivo. Puede tardar unos segundos." : <>Arrastra tu archivo <b>.replay</b> aquí o <button className="inline-button" onClick={() => inputRef.current?.click()}>explora tus archivos</button></>}</p></div>
            <span className="upload-limit">.REPLAY <span>HASTA {MAX_REPLAY_LABEL}</span></span>
          </div>
          {error && <div className="error-banner" role="alert"><Icon name="info" size={20} /><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Descartar error"><Icon name="close" size={17} /></button></div>}

          <div className={`data-notice ${replay.demo ? "demo-notice" : ""}`}><span><Icon name={replay.demo ? "info" : "check"} size={15} />{replay.demo ? <><strong>Vista de ejemplo</strong><span className="notice-description">Datos ficticios para explorar el panel. Sube tu repetición para ver tu análisis real.</span></> : <><strong>Archivo analizado</strong><span className="notice-description">{replay.filename}</span></>}</span>{!replay.demo && <button className="inline-button" onClick={() => showReplay(demoReplay)} disabled={loading}>Ver ejemplo</button>}</div>

          <section className="match-card" aria-label="Resumen de la partida">
            <div className="match-copy"><div className="match-tags"><span className="mode-tag">{replay.teamSize}v{replay.teamSize}</span><span>REPETICIÓN {replay.demo ? "DE EJEMPLO" : "LOCAL"}</span></div><h2>{replay.title}</h2><div className="match-meta"><span><Icon name="pin" size={14} />{replay.map}</span><span><Icon name="clock" size={14} />{formatTime(replay.duration)} grabados</span></div><div className="match-scoreboard"><div className="team-score blue"><span className="team-label"><i />EQUIPO AZUL</span><strong>{replay.scores[0] ?? "?"}</strong></div><span className="score-separator">:</span><div className="team-score orange"><span className="team-label"><i />EQUIPO NARANJA</span><strong>{replay.scores[1] ?? "?"}</strong></div><span className="score-caption">MARCADOR<br />GUARDADO</span></div>{replay.date && <p className="recorded-date">Fecha del archivo: {replay.date}</p>}</div>
            <div className="arena-wrap"><Arena /><span className="arena-caption"><span /> ILUSTRACIÓN · NO ES UNA RECONSTRUCCIÓN DE LA PARTIDA</span></div>
          </section>

          {replay.warnings.length > 0 && <div className="warnings"><Icon name="info" size={17} /><div>{replay.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

          <div className="analysis-toolbar"><div className="tabs" role="tablist" aria-label="Secciones del análisis">{tabs.map((item) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls="analysis-content" tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const index = tabs.findIndex((entry) => entry.id === tab); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setTab(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus(); } }} className={tab === item.id ? "active" : ""}><Icon name={item.icon} size={16} />{item.label}</button>)}</div><button className="button export-button" onClick={download}><Icon name="download" size={15} /><span>Exportar JSON</span></button></div>

          <div id="analysis-content" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
            <div className="player-context"><span className="context-label">ANALIZANDO A</span><label className="player-select" htmlFor={playerId}><PlayerAvatar player={selected} small /><select id={playerId} value={selected.id} aria-label="Jugador que quieres analizar" onChange={(event) => setSelectedId(event.target.value)}>{replay.players.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.team === 0 ? "Azul" : "Naranja"}</option>)}</select></label><span className="context-team">Equipo <span className={selected.team === 0 ? "text-blue" : "text-orange"}>{selected.team === 0 ? "azul" : "naranja"}</span></span></div>

            {tab === "overview" && <>
              <section className="stat-grid" aria-label="Estadísticas del jugador seleccionado">
                {([
                  { label: "Puntuación", value: selected.score, icon: "bolt", detail: "Puntos del marcador", color: "purple" },
                  { label: "Goles", value: selected.goals, icon: "ball", detail: `${selected.shots ?? "N/D"} tiros registrados`, color: "blue" },
                  { label: "Precisión de tiro", value: selected.shooting === null ? null : `${selected.shooting}%`, icon: "target", detail: "Goles / tiros × 100", color: "green" },
                  { label: "Paradas", value: selected.saves, icon: "shield", detail: `${selected.assists ?? "N/D"} asistencias registradas`, color: "orange" },
                ] satisfies { label: string; value: number | string | null; icon: IconName; detail: string; color: string }[]).map((stat) => <article className="stat-card" key={stat.label}><div className="stat-top"><span>{stat.label}</span><span className={`stat-icon ${stat.color}`}><Icon name={stat.icon} size={18} /></span></div><strong className="stat-value">{stat.value ?? "N/D"}</strong><span className="stat-detail">{stat.detail}</span></article>)}
              </section>

              <div className="overview-grid">
                <section className="panel teams-panel"><div className="panel-heading"><div><h2>El partido, en números</h2><p>Comparativa entre equipos</p></div><span className="mini-tag">CORE STATS</span></div><div className="team-legend"><span><i className="dot blue" />Equipo azul</span><span><i className="dot orange" />Equipo naranja</span></div><TeamComparison replay={replay} /><div className="team-summary"><Icon name="target" size={17} /><p>Tu equipo: <strong>{shots ?? "N/D"} tiros</strong>, <strong>{totalSaves ?? "N/D"} paradas</strong> y <strong>{shooting === null ? "N/D" : `${shooting} %`}</strong> de conversión.</p></div></section>
                <section className="panel radar-panel"><div className="panel-heading"><div><h2>Dos jugadores. Dos estilos.</h2><p>Rendimiento relativo en esta partida</p></div><Icon name="users" /></div><div className="radar-legend"><span><i className="dot blue" />{selected.name}</span><label htmlFor={comparisonId}><i className="dot orange" /><select id={comparisonId} value={compare.id} aria-label="Jugador de comparación" onChange={(event) => setCompareId(event.target.value)}>{replay.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label></div><Radar first={selected} second={compare} replay={replay} /><p className="radar-note">Cada eje se escala al mejor valor de la partida. N/D se dibuja en el centro.</p></section>
              </div>
              <section className="panel scoreboard-panel"><div className="panel-heading"><div><h2>Cada jugador, su aportación</h2><p>Selecciona un nombre para explorar sus estadísticas</p></div><span className="mini-tag">{replay.players.length} JUGADORES</span></div><PlayerTable replay={replay} selectedId={selected.id} onSelect={setSelectedId} /></section>
              <section className="insights-preview"><div className="section-title"><div><span className="eyebrow"><Icon name="spark" size={15} /> TU SIGUIENTE PASO</span><h2>Pequeños ajustes. Mejor juego.</h2></div><button className="text-button" onClick={() => setTab("insights")}>Ver mi análisis<Icon name="arrow" size={16} /></button></div><div className="insight-grid">{insights.slice(0, 2).map((insight) => <InsightCard key={insight.title} insight={insight} />)}</div></section>
              <GoalTimeline replay={replay} />
            </>}

            {tab === "players" && <>
              <section className="panel scoreboard-panel"><div className="panel-heading"><div><h2>El marcador completo</h2><p>Datos de la cabecera de la repetición, sin estimaciones</p></div><span className="mini-tag">{replay.teamSize}v{replay.teamSize}</span></div><PlayerTable replay={replay} selectedId={selected.id} onSelect={setSelectedId} /></section>
              <section className="panel detail-panel"><div className="panel-heading"><div><h2>{selected.name} frente a {compare.name}</h2><p>Selecciona a quién comparar</p></div><select className="standalone-select" value={compare.id} aria-label="Comparar con" onChange={(event) => setCompareId(event.target.value)}>{replay.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></div><div className="player-detail-grid"><Radar first={selected} second={compare} replay={replay} /><div className="detail-values"><div className="detail-header"><span>Métrica</span><strong className="text-blue">{selected.name}</strong><strong className="text-orange">{compare.name}</strong></div>{columns.map(({ key, label }) => <div key={key}><span>{label}</span><strong className="text-blue">{selected[key] ?? "N/D"}</strong><strong className="text-orange">{compare[key] ?? "N/D"}</strong></div>)}<p className="footnote">Los colores identifican las series comparadas, no sus equipos. Un valor mayor no siempre significa jugar mejor.</p></div></div></section>
              <GoalTimeline replay={replay} />
            </>}

            {tab === "insights" && <section className="improvement-section"><div className="improvement-intro"><span className="improvement-symbol"><Icon name="spark" size={29} /></span><div><p className="eyebrow">UNA PARTIDA. NUEVAS PERSPECTIVAS.</p><h2>Tu próxima mejora, {selected.name}.</h2><p>Observaciones del marcador y ejercicios concretos para tu siguiente sesión.</p></div></div><div className="insight-grid full">{insights.map((insight) => <InsightCard key={insight.title} insight={insight} />)}</div><div className="limits-panel"><Icon name="info" size={22} /><div><h3>Los números abren preguntas. No cuentan toda la historia.</h3><p>Estos consejos son reglas orientativas sobre una sola partida, no un entrenador de IA ni una evaluación de tu rango. El umbral del 30 % de conversión es una referencia de esta herramienta, no un promedio competitivo.</p><p>No se analizan rotaciones, decisiones, velocidad, turbo ni posicionamiento. Para eso hay que reconstruir los fotogramas de la partida. Contrasta los consejos viendo la repetición en Rocket League.</p></div></div></section>}
          </div>
          <footer className="page-footer"><span><Icon name="rocket" size={15} />Hecho para entender el juego, no solo el resultado.</span><span>Proyecto independiente · No afiliado a Psyonix ni a Epic Games.</span></footer>
        </main>
      </div>
    </div>
  );
}
