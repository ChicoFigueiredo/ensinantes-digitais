import { expect, test } from "bun:test";
import { escolherItemInicial } from "../src/ui/curso.ts";

// Correção 1, rodada 1: a home entra num curso sem retomar nada (sem `#i` na
// URL) escolhendo o primeiro vídeo. A seção "Materiais" (Repo/ do acervo,
// dez arquivos .md, nenhum vídeo) caía em `null` e o palco anunciava "Módulo
// sem material" — falso, já que os dez materiais estão listados do lado.

test("curso com vídeo abre no primeiro vídeo, mesmo com PDF antes dele na ordem", () => {
  const pdf = { tipo: "pdf", titulo: "Ementa" };
  const aula1 = { tipo: "video", titulo: "Aula 1" };
  const aula2 = { tipo: "video", titulo: "Aula 2" };
  expect(escolherItemInicial([pdf, aula1, aula2])).toBe(aula1);
});

test("curso sem vídeo nenhum abre no primeiro item, seja qual for o tipo", () => {
  const sumario = { tipo: "markdown", titulo: "SUMARIO" };
  const index = { tipo: "markdown", titulo: "INDEX" };
  expect(escolherItemInicial([sumario, index])).toBe(sumario);
});

test("curso sem item nenhum não quebra: devolve null", () => {
  expect(escolherItemInicial([])).toBeNull();
});
