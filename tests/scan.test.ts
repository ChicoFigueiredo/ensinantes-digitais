import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tipoDe, varrerPasta } from "../src/scan.ts";

const RAIZ = join(import.meta.dir, "__fixture-scan");

/** Reproduz em miniatura a bagunça real do acervo. */
function montarFixture(): void {
  rmSync(RAIZ, { recursive: true, force: true });
  const mod = join(RAIZ, "01-Modulo Um");
  mkdirSync(mod, { recursive: true });

  // Uma aula completa: vídeo + os três sidecars + a pasta de recortes.
  writeFileSync(join(mod, "01.01-Aula Um.mp4"), "video");
  writeFileSync(join(mod, "01.01-Aula Um.srt"), "1\n00:00:00,000 --> 00:00:01,000\noi\n");
  writeFileSync(join(mod, "01.01-Aula Um-Fala.Cronometrada.txt"), "[00:00:00.000] oi");
  writeFileSync(join(mod, "01.01-Aula Um.txt"), "oi");
  const recorte = join(mod, "01.01-Aula Um");
  mkdirSync(recorte);
  for (let i = 0; i < 5; i++) writeFileSync(join(recorte, `f${i}.png`), "png");

  // Aula sem legenda nenhuma.
  writeFileSync(join(mod, "01.02-Aula Dois.mp4"), "video");

  // Materiais de tipos variados.
  writeFileSync(join(mod, "01.03-Apostila.pdf"), "pdf");
  writeFileSync(join(mod, "01.04-Planilha+de+Custos.xlsx"), "xlsx");
  writeFileSync(join(mod, "01.05-Atalho.url"), "[InternetShortcut]\r\nURL=https://exemplo.com/x\r\n");

  // PNG solto no meio do módulo: NÃO é recorte (a pasta tem mp4) e NÃO é item.
  writeFileSync(join(mod, "icons8-ms-excel-48.png"), "png");

  // Pasta de recorte com sufixo de resolução — não casa com nome de vídeo.
  const solta = join(mod, "Aula 3 - Atraindo Alunos 720 x 1280");
  mkdirSync(solta);
  for (let i = 0; i < 3; i++) writeFileSync(join(solta, `g${i}.png`), "png");

  // Pastas que o scanner ignora.
  mkdirSync(join(mod, "_antigo"));
  writeFileSync(join(mod, "_antigo", "01.01-Aula Um.srt"), "velha");
  mkdirSync(join(mod, "_transcricoes.antigas"));
  writeFileSync(join(mod, "_transcricoes.antigas", "01.02-Aula Dois.srt"), "velha");
}

montarFixture();
afterAll(() => rmSync(RAIZ, { recursive: true, force: true }));

test("tipoDe reconhece os tipos do acervo e recusa imagem", () => {
  expect(tipoDe("a.mp4")).toBe("video");
  expect(tipoDe("a.pdf")).toBe("pdf");
  expect(tipoDe("a.xlsx")).toBe("planilha");
  expect(tipoDe("a.docx")).toBe("doc");
  expect(tipoDe("a.onepkg")).toBe("doc");
  expect(tipoDe("a.url")).toBe("link");
  expect(tipoDe("a.md")).toBe("markdown");
  expect(tipoDe("a.png")).toBeNull();
  expect(tipoDe("a.srt")).toBeNull();
  expect(tipoDe("a.txt")).toBeNull();
});

test("a pasta de recortes é contada e NÃO é descida", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  const nomes = r.recortes.map((x) => x.relPath).sort();
  expect(nomes).toEqual([
    "01-Modulo Um/01.01-Aula Um",
    "01-Modulo Um/Aula 3 - Atraindo Alunos 720 x 1280",
  ]);
  expect(r.recortes.find((x) => x.relPath.endsWith("01.01-Aula Um"))!.arquivos).toBe(5);
  // Nenhum PNG virou item — nem os de dentro do recorte, nem o solto.
  expect(r.itens.some((i) => i.relPath.endsWith(".png"))).toBe(false);
});

test("o vídeo é amarrado ao seu .srt irmão", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  const um = r.itens.find((i) => i.codigo === "01.01")!;
  expect(um.tipo).toBe("video");
  expect(um.srtPath).toBe("01-Modulo Um/01.01-Aula Um.srt");
});

test("vídeo sem legenda fica com srtPath null", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  expect(r.itens.find((i) => i.codigo === "01.02")!.srtPath).toBeNull();
});

test("o .url vira link com a URL extraída do INI", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  const atalho = r.itens.find((i) => i.tipo === "link")!;
  expect(atalho.alvo).toBe("https://exemplo.com/x");
});

test("o título da planilha passa pela regra do mais", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  expect(r.itens.find((i) => i.tipo === "planilha")!.titulo).toBe("Planilha de Custos");
});

test("_antigo e _transcricoes.antigas ficam fora do catálogo e viram ignorados", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  expect(r.itens.some((i) => i.relPath.includes("_antigo"))).toBe(false);
  expect(r.itens.some((i) => i.relPath.includes("_transcricoes.antigas"))).toBe(false);
  expect(r.ignorados).toContain("01-Modulo Um/_antigo");
});

test("os sidecars não viram itens por conta própria", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  // 01.01 e 01.02 (vídeos) + apostila + planilha + atalho. Os sidecars .srt,
  // .txt e -Fala.Cronometrada.txt não contam: aparecem amarrados ao vídeo.
  expect(r.itens).toHaveLength(5);
});
