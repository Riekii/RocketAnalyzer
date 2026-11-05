"use client";

import { useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { getImprovementSummary } from "@/lib/analysis";
import { demoReplay } from "@/lib/demo";
import { formatTime, MAX_REPLAY_BYTES, MAX_REPLAY_LABEL, type Replay } from "@/lib/replay";
import { analyzeTelemetry } from "@/lib/telemetry";
import { SpatialWorkspace } from "./spatial-workspace";
import { Icon } from "./icon";

export function Dashboard() {
  const [replay, setReplay] = useState<Replay>(demoReplay);
  const [history, setHistory] = useState<Replay[]>([]);
  const [selectedId, setSelectedId] = useState(demoReplay.players[0].id);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const historyId = useId();
  const selected = replay.players.find((player) => player.id === selectedId) ?? replay.players[0];
  const analysis = useMemo(() => analyzeTelemetry(replay), [replay]);
  const improvements = getImprovementSummary(selected, replay, analysis.players[selected.id]);

  function showReplay(next: Replay) {
    if (uploadLock.current) return;
    setReplay(next);
    setSelectedId(next.players[0].id);
    setError("");
    setAnnouncement(next.demo ? "Ejemplo cargado." : `Análisis de ${next.filename} cargado.`);
  }

  async function upload(file: File) {
    if (uploadLock.current) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".replay")) {
      setError("Selecciona un archivo .replay de Rocket League.");
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
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const form = new FormData();
      form.append("replay", file);
      const response = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(`El servidor no ha devuelto un informe válido (${response.status}). Comprueba que la aplicación esté funcionando.`);
      }
      if (!response.ok) {
        const failure: { error?: string } = await response.json();
        throw new Error(failure.error ?? `El servidor devolvió un error (${response.status}).`);
      }
      const result: Replay = await response.json();
      setReplay(result);
      setSelectedId(result.players[0].id);
      setHistory((previous) => [result, ...previous].slice(0, 8));
      if (!result.telemetry.samples.some((sample) => sample.players.length > 0)) {
        setError("Se ha leído el marcador, pero no las posiciones de la repetición. " +
          (result.telemetry.warnings[0] ?? "El lector no ha podido reconstruir los jugadores."));
        setAnnouncement("Análisis parcial: marcador disponible, posiciones no disponibles.");
      } else {
        setAnnouncement(`Análisis completado: ${result.players.length} jugadores.`);
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError"
        ? "El análisis ha tardado demasiado. Vuelve a intentarlo."
        : cause instanceof Error ? cause.message : "No se ha podido contactar con el servidor.");
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
    <main className="analyzer">
      <header className="page-header">
        <h1>Rocket Analyzer</h1>
        <details className="help">
          <summary>¿Dónde está mi replay?</summary>
          <p>Guarda la repetición desde el juego y busca el archivo en <code>Documentos\My Games\Rocket League\TAGame\Demos</code>. También puede estar en OneDrive.</p>
        </details>
      </header>

      <input ref={inputRef} type="file" accept=".replay" onChange={onFileChange} className="sr-only" tabIndex={-1} aria-label="Subir repetición" disabled={loading} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div
        className={`upload ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!loading) setDragging(true); }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={onDrop}
        aria-busy={loading}
      >
        <div>
          <strong>{loading ? "Analizando repetición…" : "Arrastra aquí tu archivo .replay"}</strong>
          <p>Hasta {MAX_REPLAY_LABEL}. Procesado en tu servidor, sin enviarlo a terceros.</p>
        </div>
        <button className="button primary" onClick={() => inputRef.current?.click()} disabled={loading}>
          <Icon name="upload" size={17} />{loading ? "Analizando…" : "Subir replay"}
        </button>
      </div>

      {error && <div className="error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Cerrar error"><Icon name="close" size={18} /></button></div>}

      {history.length > 0 && <div className="session">
        <label htmlFor={historyId}>Repetición</label>
        <select id={historyId} value={replay.id} disabled={loading} onChange={(event) => {
          const next = history.find((item) => item.id === event.target.value);
          if (next) showReplay(next);
        }}>
          {replay.demo && <option value="demo">Ejemplo ficticio</option>}
          {history.map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}
        </select>
      </div>}

      {replay.demo && <p className="demo-notice">Ejemplo con datos ficticios. Sube tu replay para ver tu partida.</p>}

      <section className="panel match" aria-label="Resultado de la partida">
        <div className="match-info">
          <h2>{replay.title}</h2>
          <p>{replay.teamSize}v{replay.teamSize} · {replay.map} · {formatTime(replay.duration)} grabados</p>
          {replay.date && <p>{replay.date}</p>}
        </div>
        <div className="scoreboard">
          <div className="text-blue"><span>Azul</span><strong>{replay.scores[0] ?? "N/D"}</strong></div>
          <span className="score-divider">:</span>
          <div className="text-orange"><span>Naranja</span><strong>{replay.scores[1] ?? "N/D"}</strong></div>
        </div>
      </section>

      {replay.warnings.length > 0 && <div className="warnings">{replay.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}

      <div className="analysis-actions">
        <p className="note">Turbo y distancia: instante elegido. Pads: total observado · G grande / P pequeño / ? sin tipo.</p>
        <button className="button" onClick={download}><Icon name="download" size={15} />Exportar JSON</button>
      </div>
      {replay.telemetry.warnings.length > 0 && <details className="telemetry-warnings">
        <summary>Limitaciones de datos ({replay.telemetry.warnings.length})</summary>
        {replay.telemetry.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </details>}
      <SpatialWorkspace key={replay.id} replay={replay} analysis={analysis} selectedId={selected.id} onSelect={setSelectedId} />

      <section id="improvements" className="panel improvements" aria-labelledby="improvements-title">
        <h2 id="improvements-title">En qué mejorar · {selected.name}</h2>
        <ul aria-live="polite" aria-atomic="true">
          {improvements.map((item) => <li key={item.evidence}><strong>{item.evidence}</strong><p>{item.action}</p></li>)}
        </ul>
        <p className="note">{replay.demo ? "Resumen de ejemplo. " : ""}Señales orientativas, no una nota de rotación. Consulta los criterios junto al campo.</p>
      </section>
    </main>
  );
}
