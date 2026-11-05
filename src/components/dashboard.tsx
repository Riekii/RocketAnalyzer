"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { formatTime, MAX_REPLAY_BYTES, MAX_REPLAY_LABEL, type Replay } from "@/lib/replay";
import { analyzeTelemetry } from "@/lib/telemetry";
import { SpatialWorkspace } from "./spatial-workspace";
import { Icon } from "./icon";

export function Dashboard() {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [history, setHistory] = useState<Replay[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const historyId = useId();
  const selected = replay?.players.find((player) => player.id === selectedId) ?? replay?.players[0];
  const analysis = useMemo(() => replay ? analyzeTelemetry(replay) : null, [replay]);

  useEffect(() => {
    if (!loading) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [loading]);

  function showReplay(next: Replay) {
    if (uploadLock.current) return;
    setReplay(next);
    setSelectedId(next.players[0].id);
    setError("");
    setAnnouncement(`Datos de ${next.filename} cargados.`);
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
      if (!result.players?.length || !Array.isArray(result.telemetry?.samples)) {
        throw new Error("El servidor no ha devuelto los datos de la repetición.");
      }
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
    if (!replay) return;
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
    <>
      {loading && <div className="loading-screen" role="status" aria-live="polite" aria-atomic="true">
        <div className="loading-card">
          <span className="loading-spinner" aria-hidden="true" />
          <h2>Cargando repetición…</h2>
          <p>Preparando jugadores, posiciones y estadísticas.</p>
        </div>
      </div>}
      <main
        className={`analyzer ${dragging ? "dragging" : ""}`}
        inert={loading}
        aria-busy={loading}
        onDragOver={(event) => { event.preventDefault(); if (!loading) setDragging(true); }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={onDrop}
      >
      <header className="replay-header">
        <div className="replay-heading">
          <h1>Rocket Analyzer</h1>
          {replay ? <div className="match-summary" aria-label="Resultado y fecha de la partida">
            <div className="match-result">
              <span className="text-blue">Azul <strong>{replay.scores[0] ?? "N/D"}</strong></span>
              <span aria-hidden="true">:</span>
              <span className="text-orange"><strong>{replay.scores[1] ?? "N/D"}</strong> Naranja</span>
            </div>
            <span className="match-date">{replay.date ?? "Fecha no disponible"}</span>
            <span className="match-description">{replay.title} · {replay.teamSize}v{replay.teamSize} · {replay.map} · {formatTime(replay.duration)}</span>
          </div> : <p className="note">Sube una repetición para ver los datos de tu partida.</p>}
        </div>
        <div className="replay-actions">
          {history.length > 1 && <div className="replay-history">
            <label htmlFor={historyId} className="sr-only">Repetición</label>
            <select id={historyId} value={replay?.id ?? ""} disabled={loading} onChange={(event) => {
              const next = history.find((item) => item.id === event.target.value);
              if (next) showReplay(next);
            }}>
              {history.map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}
            </select>
          </div>}
          {replay && <button className="button" onClick={download} disabled={loading} aria-label="Exportar JSON" title="Exportar JSON"><Icon name="download" size={17} /></button>}
          <button className="button primary" onClick={() => inputRef.current?.click()} disabled={loading}>
            <Icon name="upload" size={17} />Subir replay
          </button>
        </div>
      </header>
      <input ref={inputRef} type="file" accept=".replay" onChange={onFileChange} className="sr-only" tabIndex={-1} aria-label="Subir repetición" disabled={loading} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {error && <div className="error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Cerrar error"><Icon name="close" size={18} /></button></div>}

      {!replay && <section className="empty-replay">
        <Icon name="upload" size={32} />
        <h2>Arrastra aquí tu archivo .replay</h2>
        <p>Hasta {MAX_REPLAY_LABEL}. Procesado localmente, sin enviar la repetición a terceros.</p>
        <details className="help">
          <summary>¿Dónde está mi replay?</summary>
          <p>Guarda la repetición desde el juego y busca el archivo en <code>Documentos\My Games\Rocket League\TAGame\Demos</code>. También puede estar en OneDrive.</p>
        </details>
      </section>}

      {replay && analysis && selected && <>
      {replay.warnings.length > 0 && <div className="warnings">{replay.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}

      {replay.telemetry.warnings.length > 0 && <details className="telemetry-warnings">
        <summary>Limitaciones de datos ({replay.telemetry.warnings.length})</summary>
        {replay.telemetry.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </details>}
      <SpatialWorkspace key={replay.id} replay={replay} analysis={analysis} selectedId={selected.id} onSelect={setSelectedId} loading={loading} />
      </>}
    </main>
    </>
  );
}
