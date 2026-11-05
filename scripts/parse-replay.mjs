import { readFile, readFileHeader } from "@kant/node-boxcars";
import { Decoder } from "cbor-x";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeReplay } from "../src/lib/replay.ts";
import { extractTelemetry } from "../src/lib/network.ts";

// Keep native parsing outside the web server so malformed replays and timeouts are isolated.
try {
  const filename = process.argv[2];
  if (!filename) throw new Error("Falta la ruta de la repetición.");
  const decoder = new Decoder({ mapsAsObjects: true });
  let raw;
  let networkError;
  try {
    const updatedParser = fileURLToPath(new URL("../.local/rrrocket/rrrocket.exe", import.meta.url));
    raw = existsSync(updatedParser)
      ? JSON.parse(execFileSync(updatedParser, ["--network-parse", filename], {
        encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: 45_000, windowsHide: true,
      }))
      : decoder.decode(readFile(filename));
  } catch (error) {
    console.error("[replay:network]", error);
    networkError = "No se pudieron leer los fotogramas de red. Solo se muestra el marcador. Comprueba el lector actualizado con npm.cmd run parser:setup; los mapas, turbo y rotaciones no están disponibles.";
    raw = decoder.decode(readFileHeader(filename));
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
