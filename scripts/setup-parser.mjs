import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = "0.11.8";
const targets = {
  "win32-x64": {
    distribution: `rrrocket-${version}-x86_64-pc-windows-msvc`,
    extension: "zip",
    executable: "rrrocket.exe",
    hash: "bc652d48b382f25b7ff1da65942b6800366501ed1c2eb1d440058bb1821a7869",
  },
  "linux-x64": {
    distribution: `rrrocket-${version}-x86_64-unknown-linux-musl`,
    extension: "tar.gz",
    executable: "rrrocket",
    hash: "c78b674728de915fa1a76ea7fec16d57df7f9371fbbc1062f4f50b44999f530f",
  },
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target) {
  throw new Error("El lector incluido requiere Windows x64 o Linux x64.");
}
const { distribution, extension, executable: executableName, hash } = target;

const temporary = await mkdtemp(path.join(tmpdir(), "rocket-parser-"));
try {
  const response = await fetch(
    `https://github.com/nickbabcock/rrrocket/releases/download/v${version}/${distribution}.${extension}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!response.ok) throw new Error(`No se pudo descargar el lector: HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== hash) {
    throw new Error("El hash del lector descargado no coincide con la version oficial.");
  }
  const archive = path.join(temporary, `parser.${extension}`);
  await writeFile(archive, bytes);
  if (extension === "zip") {
    execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      "Expand-Archive -LiteralPath $env:REPLAY_PARSER_ARCHIVE -DestinationPath $env:REPLAY_PARSER_DESTINATION -Force",
    ], {
      env: { ...process.env, REPLAY_PARSER_ARCHIVE: archive, REPLAY_PARSER_DESTINATION: temporary },
      stdio: "inherit", timeout: 30_000, windowsHide: true,
    });
  } else {
    execFileSync("tar", ["-xzf", archive, "-C", temporary], { stdio: "inherit", timeout: 30_000 });
  }
  const executable = path.join(temporary, distribution, executableName);
  execFileSync(executable, ["--help"], { stdio: "pipe", timeout: 5_000, windowsHide: true });
  const destination = fileURLToPath(new URL("../.local/rrrocket/", import.meta.url));
  await mkdir(destination, { recursive: true });
  await copyFile(executable, path.join(destination, executableName));
  await chmod(path.join(destination, executableName), 0o755);
  console.log(`Lector rrrocket ${version} instalado en ${destination}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
