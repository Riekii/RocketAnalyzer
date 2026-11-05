import { Decoder } from "cbor-x";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeReplay } from "../src/lib/replay.ts";
import { extractTelemetry } from "../src/lib/network.ts";

// The legacy native fallback only ships Windows x64 binaries, so it must not be loaded on Linux.
async function legacyParser() {
  if (process.platform !== "win32") return undefined;
  try {
    return await import("@kant/node-boxcars");
  } catch (error) {
    console.error("[replay:legacy-parser]", error);
    return undefined;
  }
}

// Keep native parsing outside the web server so malformed replays and timeouts are isolated.
try {
  const filename = process.argv[2];
  if (!filename) throw new Error("Falta la ruta de la repetición.");
  const decoder = new Decoder({ mapsAsObjects: true });
  const legacy = await legacyParser();
  let raw;
  let networkError;
  try {
    const executable = process.platform === "win32" ? "rrrocket.exe" : "rrrocket";
    const updatedParser = fileURLToPath(new URL(`../.local/rrrocket/${executable}`, import.meta.url));
    if (existsSync(updatedParser)) {
      raw = JSON.parse(execFileSync(updatedParser, ["--network-parse", filename], {
        encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: 45_000, windowsHide: true,
      }));
    } else if (legacy) {
      raw = decoder.decode(legacy.readFile(filename));
    } else {
      throw new Error("No se encuentra el lector rrrocket. Ejecuta npm run parser:setup.");
    }
  } catch (error) {
    console.error("[replay:network]", error);
    if (!legacy) throw error;
    networkError = "No se pudieron leer los fotogramas de red. Solo se muestra el marcador. Comprueba el lector actualizado con npm.cmd run parser:setup; los mapas, turbo y rotaciones no están disponibles.";
    raw = decoder.decode(legacy.readFileHeader(filename));
  }
  const replay = normalizeReplay(raw, process.argv[3] ?? "match.replay", process.argv[4] ?? "parsed");
  if (networkError) replay.telemetry.warnings = [networkError];
  else replay.telemetry = extractTelemetry(raw, replay.players, replay.map);
  process.stdout.write(
    JSON.stringify(replay, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Error del lector de repeticiones.");
  process.exitCode = 1;
}
