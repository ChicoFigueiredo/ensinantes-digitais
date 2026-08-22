import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ACERVO } from "../src/config.ts";
import { dentroDoAcervo, mime, servirArquivo } from "../src/arquivos.ts";

const PASTA = join(ACERVO, "__teste-arquivos");
mkdirSync(PASTA, { recursive: true });
writeFileSync(join(PASTA, "amostra.mp4"), "0123456789");
afterAll(() => rmSync(PASTA, { recursive: true, force: true }));

const REL = "__teste-arquivos/amostra.mp4";

test("mime cobre os tipos do acervo", () => {
  expect(mime("a.mp4")).toBe("video/mp4");
  expect(mime("a.pdf")).toBe("application/pdf");
  expect(mime("a.vtt")).toBe("text/vtt; charset=utf-8");
  expect(mime("a.xlsx")).toContain("spreadsheet");
  expect(mime("a.zzz")).toBe("application/octet-stream");
});

test("caminho com .. não escapa do acervo", () => {
  expect(dentroDoAcervo("../../etc/passwd")).toBeNull();
  expect(dentroDoAcervo("1-Ensinantes/../../etc/passwd")).toBeNull();
  expect(dentroDoAcervo(REL)).not.toBeNull();
});

test("sem Range devolve 200 com Accept-Ranges", async () => {
  const r = servirArquivo(REL, new Request("http://x/"));
  expect(r.status).toBe(200);
  expect(r.headers.get("Accept-Ranges")).toBe("bytes");
  expect(await r.text()).toBe("0123456789");
});

test("com Range devolve 206 e só o pedaço pedido", async () => {
  const r = servirArquivo(REL, new Request("http://x/", { headers: { range: "bytes=2-5" } }));
  expect(r.status).toBe(206);
  expect(r.headers.get("Content-Range")).toBe("bytes 2-5/10");
  expect(r.headers.get("Content-Length")).toBe("4");
  expect(await r.text()).toBe("2345");
});

test("Range aberto no fim vai até o último byte", async () => {
  const r = servirArquivo(REL, new Request("http://x/", { headers: { range: "bytes=7-" } }));
  expect(r.status).toBe(206);
  expect(await r.text()).toBe("789");
});

test("Range além do arquivo devolve 416", () => {
  const r = servirArquivo(REL, new Request("http://x/", { headers: { range: "bytes=50-60" } }));
  expect(r.status).toBe(416);
  expect(r.headers.get("Content-Range")).toBe("bytes */10");
});

test("arquivo inexistente devolve 404", () => {
  expect(servirArquivo("__teste-arquivos/nao-existe.mp4", new Request("http://x/")).status).toBe(404);
});
