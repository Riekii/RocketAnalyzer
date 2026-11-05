import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { MAX_REPLAY_BYTES, type Replay } from "@/lib/replay";
import { hasSameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const maxDuration = 90;
const execute = promisify(execFile);
let parsing = false;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return error("No se permiten subidas desde otro origen.", 403);
  }
  if (parsing) return error("Hay otra repetición en proceso. Inténtalo de nuevo en unos segundos.", 429);
  const length = request.headers.get("content-length");
  if (length && Number(length) > MAX_REPLAY_BYTES + 1024 * 1024) {
    return error("El archivo supera el límite de 32 MB.", 413);
  }
  if (process.platform !== "win32" || process.arch !== "x64") {
    return error("El lector incluido requiere Windows x64 y Node.js x64. Consulta las instrucciones del proyecto.", 503);
  }

  parsing = true;
  let directory: string | undefined;
  try {
    // Bound the entire multipart body, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return error("No se ha recibido ningún archivo.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_REPLAY_BYTES + 1024 * 1024) {
          await reader.cancel();
          return error("La subida supera el límite de 32 MB.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks);
    let form: FormData;
    try {
      form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
        body: new Uint8Array(body),
      }).formData();
    } catch (cause) {
      console.warn("[replay:invalid-form]", cause);
      return error("La subida no tiene un formato válido. Vuelve a seleccionar el archivo.", 400);
    }
    const file = form.get("replay");
    if (!(file instanceof File)) return error("Selecciona un archivo .replay.", 400);
    if (!file.name.toLowerCase().endsWith(".replay")) return error("Solo se admiten archivos .replay.", 415);
    if (file.size === 0) return error("El archivo está vacío.", 400);
    if (file.size > MAX_REPLAY_BYTES) return error("El archivo supera el límite de 32 MB.", 413);

    directory = await mkdtemp(path.join(tmpdir(), "rocket-analyzer-"));
    const replayPath = path.join(directory, "match.replay");
    await writeFile(replayPath, Buffer.from(await file.arrayBuffer()));
    let stdout: string;
    try {
      const result = await execute(process.execPath, [
        "--max-old-space-size=1536",
        path.join(process.cwd(), "scripts", "parse-replay.mjs"),
        replayPath,
        path.basename(file.name),
        randomUUID(),
      ], {
        timeout: 60_000,
        maxBuffer: 48 * 1024 * 1024,
        windowsHide: true,
        encoding: "utf8",
      });
      stdout = result.stdout;
      if (result.stderr) console.warn("[replay:parser-warning]", result.stderr);
    } catch (cause) {
      console.error("[replay:parser]", cause);
      return error(
        "No se ha podido leer la repetición. Puede estar dañada o usar una versión no compatible. Si ocurre con todos los archivos, comprueba la instalación del lector nativo.",
        422,
      );
    }
    // The isolated process validates and normalizes the replay before emitting this internal JSON.
    const replay: Replay = JSON.parse(stdout);
    if (!replay.players?.length || !Array.isArray(replay.telemetry?.samples)) {
      throw new Error("El lector no ha devuelto un informe completo.");
    }
    return NextResponse.json(replay, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("[replay:analyze]", cause);
    return error("Ha ocurrido un error al procesar el archivo. Revisa la consola del servidor y vuelve a intentarlo.", 500);
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } catch (cause) {
      console.error("[replay:cleanup]", cause);
    } finally {
      parsing = false;
    }
  }
}
