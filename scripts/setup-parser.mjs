import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = "0.11.8";
const hash = "bc652d48b382f25b7ff1da65942b6800366501ed1c2eb1d440058bb1821a7869";
const distribution = `rrrocket-${version}-x86_64-pc-windows-msvc`;

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("El lector incluido requiere Windows x64 y Node.js x64.");
}

const temporary = await mkdtemp(path.join(tmpdir(), "rocket-parser-"));
try {
  const response = await fetch(
    `https://github.com/nickbabcock/rrrocket/releases/download/v${version}/${distribution}.zip`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!response.ok) throw new Error(`No se pudo descargar el lector: HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== hash) {
    throw new Error("El hash del lector descargado no coincide con la version oficial.");
  }
  const archive = path.join(temporary, "parser.zip");
  await writeFile(archive, bytes);
  execFileSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Expand-Archive -LiteralPath $env:REPLAY_PARSER_ARCHIVE -DestinationPath $env:REPLAY_PARSER_DESTINATION -Force",
  ], {
    env: { ...process.env, REPLAY_PARSER_ARCHIVE: archive, REPLAY_PARSER_DESTINATION: temporary },
    stdio: "inherit", timeout: 30_000, windowsHide: true,
  });
  const executable = path.join(temporary, distribution, "rrrocket.exe");
  execFileSync(executable, ["--help"], { stdio: "pipe", timeout: 5_000, windowsHide: true });
  const destination = fileURLToPath(new URL("../.local/rrrocket/", import.meta.url));
  await mkdir(destination, { recursive: true });
  await copyFile(executable, path.join(destination, "rrrocket.exe"));
  console.log(`Lector rrrocket ${version} instalado en ${destination}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
