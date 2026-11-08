"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { formatTime, MAX_REPLAY_BYTES, MAX_REPLAY_LABEL, replayLabel, teamName, type Replay } from "@/lib/replay";
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
  const [progress, setProgress] = useState({ current: 0, total: 0, filename: "" });
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
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
    setError(partialError(next));
    setAnnouncement(`Datos de ${replayLabel(next)} cargados.`);
  }

  function partialError(result: Replay) {
    return result.telemetry.samples.some((sample) => sample.players.length > 0) ? ""
      : "Se ha leído el marcador, pero no las posiciones de la repetición. " +
        (result.telemetry.warnings[0] ?? "El lector no ha podido reconstruir los jugadores.");
  }

  async function upload(files: File[]) {
    if (uploadLock.current) return;
    if (!files.length) return;
    setError("");
    uploadLock.current = true;
    setLoading(true);
    const failures: string[] = [];
    let completed = 0;
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length, filename: file.name });
        setAnnouncement(`Analizando ${index + 1} de ${files.length}: ${file.name}.`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);
        try {
          if (!file.name.toLowerCase().endsWith(".replay")) {
            throw new Error("Solo se admiten archivos .replay de Rocket League.");
          }
          if (!file.size || file.size > MAX_REPLAY_BYTES) {
            throw new Error(file.size ? "El archivo supera el límite de 32 MB." : "El archivo está vacío.");
          }
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
          if (completed === 0) {
            setReplay(result);
            setSelectedId(result.players[0].id);
          }
          completed++;
          setHistory((previous) => [...previous, result]);
          const partial = partialError(result);
          if (partial) failures.push(`${file.name}: ${partial}`);
        } catch (cause) {
          console.error("[replay:upload]", file.name, cause);
          const message = cause instanceof Error && cause.name === "AbortError"
            ? "El análisis ha tardado demasiado. Vuelve a intentarlo."
            : cause instanceof Error ? cause.message : "No se ha podido contactar con el servidor.";
          failures.push(`${file.name}: ${message}`);
        } finally {
          clearTimeout(timeout);
        }
      }
    } finally {
      setError(failures.join("\n"));
      setAnnouncement(`${completed} de ${files.length} repeticiones cargadas.${failures.length ? " Revisa los errores de carga." : ""}`);
      uploadLock.current = false;
      setLoading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void upload(files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (loading) return;
    void upload(Array.from(event.dataTransfer.files));
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
          <h2>Cargando {progress.current} de {progress.total} repeticiones…</h2>
          <p>{progress.filename}</p>
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
              <span className="text-blue">{teamName(replay, 0)} <strong>{replay.scores[0] ?? "N/D"}</strong></span>
              <span aria-hidden="true">:</span>
              <span className="text-orange"><strong>{replay.scores[1] ?? "N/D"}</strong> {teamName(replay, 1)}</span>
            </div>
            <span className="match-date">{replay.date ?? "Fecha no disponible"}</span>
            <span className="match-description">{replay.title} · {replay.teamSize}v{replay.teamSize} · {replay.map} · {formatTime(replay.duration)}</span>
          </div> : <p className="note">Sube una repetición para ver los datos de tu partida.</p>}
        </div>
        <div className="replay-actions">
          {replay && <button className="button" onClick={download} disabled={loading} aria-label="Exportar JSON" title="Exportar JSON"><Icon name="download" size={17} /></button>}
          <button className="button primary" onClick={() => inputRef.current?.click()} disabled={loading}>
            <Icon name="upload" size={17} />Subir replays
          </button>
        </div>
      </header>
      <input ref={inputRef} type="file" accept=".replay" multiple onChange={onFileChange} className="sr-only" tabIndex={-1} aria-label="Subir repeticiones" disabled={loading} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {error && <div className="error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Cerrar error"><Icon name="close" size={18} /></button></div>}

      {history.length > 0 && <section className="replay-library panel" aria-labelledby="replays-title">
        <h2 id="replays-title">Partidos ({history.length})</h2>
        <ol>{history.map((item, index) => <li key={item.id}>
          <button type="button" aria-pressed={item.id === replay?.id} disabled={loading}
            onClick={() => showReplay(item)} title={item.filename}>
            <strong>{index + 1}. {replayLabel(item)}</strong>
            <span>{item.scores[0] ?? "N/D"} : {item.scores[1] ?? "N/D"} · {item.date ?? "Fecha no disponible"}</span>
          </button>
        </li>)}</ol>
        <p className="note">Guardados solo en esta sesión; al recargar la página se vacía el listado.</p>
      </section>}

      {!replay && <section className="empty-replay">
        <Icon name="upload" size={32} />
        <h2>Arrastra aquí uno o varios archivos .replay</h2>
        <p>Hasta {MAX_REPLAY_LABEL} por archivo. Procesados uno a uno, sin enviar las repeticiones a terceros.</p>
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
