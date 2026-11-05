import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import test from "node:test";

test("una subida incompleta no bloquea otra repeticion y termina con un error explicito", {
  skip: process.env.REPLAY_UPLOAD_TEST !== "1" || !process.env.REPLAY_TEST_FILE,
  timeout: 45_000,
}, async (context) => {
  const file = await readFile(process.env.REPLAY_TEST_FILE!);
  const stalled = request("http://127.0.0.1:3000/api/analyze", {
    method: "POST",
    signal: context.signal,
    headers: {
      "Content-Type": "multipart/form-data; boundary=unfinished",
      "Content-Length": "100000",
    },
  });
  const timeoutResponse = new Promise<{ status: number | undefined; body: string } | Error>((resolve) => {
    stalled.on("error", resolve);
    stalled.on("response", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    stalled.setTimeout(38_000, () => stalled.destroy(new Error("El servidor no ha cerrado la subida incompleta.")));
  });
  const start = Date.now();
  try {
    stalled.write("--unfinished\r\n");
    const form = new FormData();
    form.append("replay", new Blob([file]), "integration.replay");
    const response = await fetch("http://127.0.0.1:3000/api/analyze", {
      method: "POST", body: form, signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.ok(report.telemetry.samples.some((sample: { players: unknown[] }) => sample.players.length > 0));
    const timeout = await timeoutResponse;
    if (timeout instanceof Error) throw timeout;
    assert.equal(timeout.status, 408);
    assert.match(JSON.parse(timeout.body).error, /subida.*demasiado/i);
    assert.ok(Date.now() - start >= 29_000, "La subida incompleta debe agotar el plazo de 30 segundos.");
  } finally {
    stalled.destroy();
  }
});
