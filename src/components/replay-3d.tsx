"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Replay } from "@/lib/replay";
import { formatTime } from "@/lib/replay";
import { BOOST_PADS, FIELD, type Position, type PositionSample } from "@/lib/telemetry";
import { carPoint, DEFAULT_REPLAY_CAMERA, orbitCamera, projectPosition, zoomCamera, type ReplayCamera } from "@/lib/replay-3d";
import { TEAM_COLORS } from "./field-map";
import { timelinePosition } from "@/lib/playback";

function drawScene(context: CanvasRenderingContext2D, width: number, height: number,
  camera: ReplayCamera, replay: Replay, sample: PositionSample | undefined, selectedId: string) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#0b1220";
  context.fillRect(0, 0, width, height);
  if (!replay.telemetry.standardField) return;
  const project = (point: Position) => projectPosition(point, camera, width, height);
  const polygon = (points: Position[], fill: string, stroke = "#738fa0") => {
    const projected = points.map(project);
    if (projected.some((point) => point === null)) return;
    context.beginPath();
    projected.forEach((point, index) => {
      if (!point) return;
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.lineWidth = 1;
    context.stroke();
  };
  const line = (points: Position[], color: string, lineWidth = 1) => {
    context.beginPath();
    let started = false;
    for (const point of points) {
      const projected = project(point);
      if (!projected) { started = false; continue; }
      if (started) context.lineTo(projected.x, projected.y);
      else { context.moveTo(projected.x, projected.y); started = true; }
    }
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
  };
  const x = FIELD.halfWidth, y = FIELD.halfLength;
  for (const side of [0, 1] as const) {
    const from = side === 0 ? -y : 0, to = side === 0 ? 0 : y;
    polygon([{ x: -x, y: from, z: 0 }, { x, y: from, z: 0 },
      { x, y: to, z: 0 }, { x: -x, y: to, z: 0 }], side === 0 ? "#173851" : "#493328");
  }
  line([{ x: -x, y: 0, z: 2 }, { x, y: 0, z: 2 }], "#bdd0db");
  line(Array.from({ length: 65 }, (_, index) => ({
    x: Math.cos(index / 64 * Math.PI * 2) * 1000,
    y: Math.sin(index / 64 * Math.PI * 2) * 1000, z: 2,
  })), "#bdd0db");
  for (const wallX of [-x, x]) {
    line([{ x: wallX, y: -y, z: 0 }, { x: wallX, y: -y, z: 600 },
      { x: wallX, y, z: 600 }, { x: wallX, y, z: 0 }], "#688497");
  }
  for (const side of [0, 1] as const) {
    const goalY = side === 0 ? -y : y, backY = goalY + (side === 0 ? -800 : 800);
    line([{ x: -x, y: goalY, z: 0 }, { x: -x, y: goalY, z: 600 },
      { x, y: goalY, z: 600 }, { x, y: goalY, z: 0 }], "#688497");
    line([{ x: -893, y: goalY, z: 0 }, { x: -893, y: goalY, z: 642 },
      { x: 893, y: goalY, z: 642 }, { x: 893, y: goalY, z: 0 }], TEAM_COLORS[side], 3);
    line([{ x: -893, y: goalY, z: 642 }, { x: -893, y: backY, z: 642 },
      { x: 893, y: backY, z: 642 }, { x: 893, y: goalY, z: 642 }], TEAM_COLORS[side]);
  }
  for (const pad of BOOST_PADS) {
    const point = project(pad);
    if (!point) continue;
    context.beginPath();
    context.ellipse(point.x, point.y, Math.max(2, point.scale * (pad.large ? 110 : 45)),
      Math.max(1, point.scale * (pad.large ? 50 : 22)), 0, 0, Math.PI * 2);
    context.fillStyle = pad.large ? "#eac15b" : "#8a845c";
    context.fill();
  }
  const entities = [
    ...(sample?.players ?? []).flatMap((point) => {
      const player = replay.players.find((player) => player.id === point.id);
      return player ? [{ point, player, ball: false }] : [];
    }),
    ...(sample?.ball ? [{ point: sample.ball, player: undefined, ball: true }] : []),
  ].sort((a, b) => (project(b.point)?.depth ?? 0) - (project(a.point)?.depth ?? 0));
  for (const { point, player, ball } of entities) {
    const shadow = project({ ...point, z: 0 });
    if (shadow) {
      context.beginPath();
      context.ellipse(shadow.x, shadow.y, Math.max(3, shadow.scale * 105),
        Math.max(2, shadow.scale * 50), 0, 0, Math.PI * 2);
      context.fillStyle = "#0007";
      context.fill();
      if (point.z > 250) line([{ ...point, z: 0 }, point], "#ffffff25");
    }
    const center = project(point);
    if (!center) continue;
    if (ball) {
      context.beginPath();
      context.arc(center.x, center.y, Math.max(5, 93 * center.scale), 0, Math.PI * 2);
      context.fillStyle = "#fffef0";
      context.shadowColor = "#fff16a";
      context.shadowBlur = 16;
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = "#fff16a";
      context.lineWidth = 2;
      context.stroke();
      continue;
    }
    if (!player) continue;
    const rotation = sample?.players.find((car) => car.id === player.id)?.rotation;
    const transform = (local: Position) => carPoint(local, point, rotation);
    const parts = [
      { min: [-100, -48, -5], max: [100, 48, 32], color: TEAM_COLORS[player.team] },
      { min: [-50, -39, 32], max: [35, 39, 65], color: "#a4def0" },
      { min: [-103, -55, 35], max: [-78, 55, 43], color: TEAM_COLORS[player.team] },
      ...[-65, 65].flatMap((x) => [-53, 53].map((y) => ({
        min: [x - 22, y - 10, -17], max: [x + 22, y + 10, 22], color: "#17202a",
      }))),
      ...[-32, 32].map((y) => ({ min: [99, y - 9, 10], max: [103, y + 9, 23], color: "#fffbc2" })),
      ...[-32, 32].map((y) => ({ min: [-103, y - 9, 10], max: [-99, y + 9, 23], color: "#ff6570" })),
    ];
    const faces = parts.flatMap(({ min, max, color }) => {
      const vertices = [min[2], max[2]].flatMap((z) => [
        transform({ x: min[0], y: min[1], z }), transform({ x: max[0], y: min[1], z }),
        transform({ x: max[0], y: max[1], z }), transform({ x: min[0], y: max[1], z }),
      ]);
      return [[0, 1, 2, 3], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]]
        .map((indices) => ({ points: indices.map((index) => vertices[index]), color }));
    }).sort((a, b) => b.points.reduce((total, point) => total + (project(point)?.depth ?? 0), 0)
      - a.points.reduce((total, point) => total + (project(point)?.depth ?? 0), 0));
    for (const face of faces) polygon(face.points, face.color, player.id === selectedId ? "#dcefff" : "#132134");
    if (rotation) line([transform({ x: 115, y: 0, z: 15 }), transform({ x: 220, y: 0, z: 15 })],
      TEAM_COLORS[player.team], 2);
    const label = project({ ...point, z: point.z + 230 });
    if (label) {
      context.font = "600 12px Segoe UI, sans-serif";
      context.textAlign = "center";
      context.lineWidth = 4;
      context.strokeStyle = "#0b1220";
      context.strokeText(player.name, label.x, label.y);
      context.fillStyle = TEAM_COLORS[player.team];
      context.fillText(player.name, label.x, label.y);
      const boost = sample?.players.find((car) => car.id === player.id)?.boost;
      const boostLabel = boost === null || boost === undefined ? "Boost N/D" : `Boost ${boost} %`;
      context.font = "600 11px Segoe UI, sans-serif";
      context.strokeText(boostLabel, label.x, label.y - 15);
      context.fillStyle = "#fff3ac";
      context.fillText(boostLabel, label.x, label.y - 15);
    }
  }
}

export function Replay3D({ replay, sample, selectedId, time, playing, speed, onSeek, onToggle, onSpeed, onReady }: {
  replay: Replay; sample?: PositionSample; selectedId: string; time: number; playing: boolean; speed: number;
  onSeek: (time: number) => void; onToggle: () => void; onSpeed: (speed: number) => void;
  onReady?: () => void;
}) {
  const titleId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [camera, setCamera] = useState(DEFAULT_REPLAY_CAMERA);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const ready = useRef(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const overflow = document.body.style.overflow;
    const analyzer = section.current?.closest("main");
    const siblings = analyzer ? Array.from(analyzer.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && !element.contains(section.current)) : [];
    const previous = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      siblings.forEach((element, index) => { element.inert = previous[index]; });
      expandButton.current?.focus();
    };
  }, [expanded]);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    setSize({ width: bounds.width, height: bounds.height });
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setCamera((camera) => zoomCamera(camera, Math.max(-200, Math.min(200, event.deltaY))));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel); };
  }, []);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element || !size.width || !size.height) return;
    const context = element.getContext("2d");
    if (!context) {
      console.error("[replay:3d]", "El navegador no permite dibujar en canvas.");
      setError("Este navegador no permite dibujar la vista 3D.");
      onReady?.();
      return;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(size.width * ratio), height = Math.round(size.height * ratio);
    if (element.width !== width) element.width = width;
    if (element.height !== height) element.height = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawScene(context, size.width, size.height, camera, replay, sample, selectedId);
    if (!ready.current) {
      const frame = requestAnimationFrame(() => {
        ready.current = true;
        onReady?.();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [size, camera, replay, sample, selectedId, onReady]);
  const available = replay.telemetry.standardField && replay.telemetry.samples.length > 0;
  const selected = sample?.players.find((point) => point.id === selectedId);
  const startTime = replay.telemetry.samples[0]?.time ?? 0;
  const endTime = replay.telemetry.samples.at(-1)?.time ?? 0;
  return <section ref={section} className={`panel replay-3d${expanded ? " replay-3d-expanded" : ""}`} aria-labelledby={titleId}
    role={expanded ? "dialog" : undefined} aria-modal={expanded ? true : undefined}
    onKeyDown={(event) => {
      if (expanded && event.key === "Escape") { event.stopPropagation(); setExpanded(false); }
      if (expanded && event.key === "Tab") {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), canvas'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="section-heading"><h2 id={titleId}>Reproducción 3D · {formatTime(time)}</h2>
      <div className="replay-3d-actions">
        <button className="button" onClick={() => setCamera(DEFAULT_REPLAY_CAMERA)}>Restablecer cámara</button>
        {expanded ? <button ref={closeButton} className="button" onClick={() => setExpanded(false)}>Cerrar vista ampliada</button>
          : <button ref={expandButton} className="button" onClick={() => setExpanded(true)}>Ampliar vista</button>}
      </div></div>
    <div className="replay-3d-viewport">
      <canvas ref={canvas} aria-label="Vista tridimensional del campo, jugadores y balón. Arrastra para girar la cámara."
        tabIndex={0} onKeyDown={(event) => {
          const moves: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
          if (event.key in moves) { event.preventDefault(); setCamera((camera) => orbitCamera(camera, ...moves[event.key])); }
          if (event.key === "+" || event.key === "-") {
            event.preventDefault(); setCamera((camera) => zoomCamera(camera, event.key === "+" ? -100 : 100));
          }
        }} onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          setCamera((camera) => orbitCamera(camera, event.clientX - previous.x, event.clientY - previous.y));
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}>
        Tu navegador no admite la vista 3D.
      </canvas>
      {(error || !available || !sample?.players.length) && <p className="replay-3d-message" role="status">
        {error || (!available ? "Vista 3D no disponible: faltan posiciones o la geometría del mapa no está verificada."
          : "Sin posiciones en este instante.")}
      </p>}
    </div>
    <div className="playback">
      <button className="button" disabled={!available} onClick={onToggle}>{playing ? "Pausa" : "Reproducir"}</button>
      <div className="playback-timeline">
      <input type="range" min={startTime} max={endTime}
        step="any" value={time} disabled={!available} aria-label="Instante de la reproducción 3D"
        onPointerDown={() => onSeek(time)} onChange={(event) => onSeek(Number(event.target.value))} />
      <div className="goal-markers goal-markers-interactive">
        {replay.goals.map((goal, index) => {
          const position = timelinePosition(goal.seconds, startTime, endTime);
          return position === null ? null : <button type="button" key={`${goal.frame}-${index}`}
            aria-label={`Gol de ${goal.player} en ${formatTime(goal.seconds)}`}
            title={`${formatTime(goal.seconds)} · Gol de ${goal.player}`}
            style={{ left: `${position}%`, background: TEAM_COLORS[goal.team] }}
            onClick={() => { if (goal.seconds !== null) onSeek(goal.seconds); }} />;
        })}
      </div>
      </div>
      <select aria-label="Velocidad de la reproducción 3D" value={speed} onChange={(event) => onSpeed(Number(event.target.value))}>
        {[1, 1.5, 2, 3].map((value) => <option key={value} value={value}>×{String(value).replace(".", ",")}</option>)}
      </select>
      <button className="button" aria-label="Acercar cámara" onClick={() => setCamera((camera) => zoomCamera(camera, -150))}>+</button>
      <button className="button" aria-label="Alejar cámara" onClick={() => setCamera((camera) => zoomCamera(camera, 150))}>−</button>
    </div>
    {selected && <p className="note replay-3d-note">
      {replay.players.find((player) => player.id === selectedId)?.name} · posición:
      {" "}X {(selected.x / 100).toFixed(1)} m · Y {(selected.y / 100).toFixed(1)} m · altura {(selected.z / 100).toFixed(1)} m
      {" · "}{selected.rotation ? "Orientación real; la línea frontal indica hacia dónde apunta el coche." : "Orientación no disponible."}
    </p>}
    <p className="note replay-3d-note">Arrastra para girar; rueda o botones +/− para acercar. Teclado: flechas y +/−.
      Sincronizado con el campo 2D. Posiciones y alturas reales; coches y estadio simplificados.
      Orientación real cuando está disponible; no se inventan posiciones ausentes.</p>
  </section>;
}
