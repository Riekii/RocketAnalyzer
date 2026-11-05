import assert from "node:assert/strict";
import test from "node:test";
import { hasSameOrigin } from "../src/lib/request-origin.ts";

function request(origin: string, host?: string, url = "http://localhost:3000/api/analyze") {
  const headers = new Headers({ origin });
  if (host) headers.set("host", host);
  return new Request(url, { method: "POST", headers });
}

test("acepta el Host público aunque Next.js utilice localhost en su URL interna", () => {
  assert.equal(hasSameOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000")), true);
});

test("acepta localhost aunque la URL interna utilice 127.0.0.1", () => {
  assert.equal(hasSameOrigin(request(
    "http://localhost:3000", "localhost:3000", "http://127.0.0.1:3000/api/analyze",
  )), true);
});

test("acepta el host de destino con un puerto alternativo y con IPv6", () => {
  assert.equal(hasSameOrigin(request("http://localhost:3001", "localhost:3001")), true);
  assert.equal(hasSameOrigin(request("http://[::1]:3000", "[::1]:3000")), true);
});

test("rechaza páginas de otro host aunque la URL interna coincida con su origen", () => {
  assert.equal(hasSameOrigin(request("http://localhost:3000", "127.0.0.1:3000")), false);
  assert.equal(hasSameOrigin(request("https://example.com", "127.0.0.1:3000")), false);
});

test("rechaza diferencias de puerto y de protocolo", () => {
  assert.equal(hasSameOrigin(request("http://127.0.0.1:3001", "127.0.0.1:3000")), false);
  assert.equal(hasSameOrigin(request("https://127.0.0.1:3000", "127.0.0.1:3000")), false);
});

test("sin Host compara con la URL de la petición", () => {
  assert.equal(hasSameOrigin(request("http://localhost:3000")), true);
  assert.equal(hasSameOrigin(request("http://127.0.0.1:3000")), false);
});

test("mantiene la compatibilidad con clientes sin cabecera Origin", () => {
  assert.equal(hasSameOrigin(new Request("http://localhost:3000/api/analyze")), true);
});

test("rechaza orígenes nulos, vacíos y malformados", () => {
  for (const origin of ["null", "", "invalid", "http://localhost:3000/path"]) {
    assert.equal(hasSameOrigin(request(origin, "localhost:3000")), false);
  }
});

test("no confía en cabeceras forwarded para autorizar otros orígenes", () => {
  const input = request("https://example.com", "127.0.0.1:3000");
  input.headers.set("x-forwarded-host", "example.com");
  input.headers.set("x-forwarded-proto", "https");
  assert.equal(hasSameOrigin(input, undefined), false);
});

test("acepta el origen público configurado detrás de un proxy HTTPS", () => {
  const input = request("https://replays.example.com", "replays.example.com");
  assert.equal(hasSameOrigin(input, undefined), false);
  assert.equal(hasSameOrigin(input, "https://replays.example.com"), true);
  assert.equal(hasSameOrigin(input, "https://replays.example.com/"), true);
});

test("el origen público configurado no autoriza otros orígenes", () => {
  assert.equal(hasSameOrigin(request("https://example.com", "replays.example.com"), "https://replays.example.com"), false);
  assert.equal(hasSameOrigin(request("https://replays.example.com:8443", "replays.example.com"), "https://replays.example.com"), false);
  assert.equal(hasSameOrigin(request("null", "replays.example.com"), "invalid"), false);
});
