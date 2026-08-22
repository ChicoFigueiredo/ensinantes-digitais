import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { conectar } from "../src/db.ts";
import { escanearCurso, ehPessoal, ehLixoDeOrganizacao } from "../src/scan.ts";

const RAIZ = join(import.meta.dir, "__fixture-catalogo");

function montar(): void {
  rmSync(RAIZ, { recursive: true, force: true });

  // Curso completo, com um módulo e arquivos soltos na raiz.
  const c1 = join(RAIZ, "1-Curso");
  mkdirSync(join(c1, "01-Modulo Um"), { recursive: true });
  writeFileSync(join(c1, "01-Modulo Um", "01.01-Aula.mp4"), "v");
  writeFileSync(join(c1, "Mapa.do.Curso.xlsx"), "x");                 // avulso legítimo
  writeFileSync(join(c1, "Boleto_Francisco_Lima_Figueiredo.pdf"), "p"); // pessoal
  writeFileSync(join(c1, "Certificado-Ensinantes-abc.pdf"), "p");       // pessoal
  writeFileSync(join(c1, "gera_pastas.sh"), "s");                       // lixo
  writeFileSync(join(c1, "Lista.txt"), "l");                            // lixo
  writeFileSync(join(c1, "_l.txt"), "l");                               // lixo

  // Curso esqueleto: só lista.txt em CRLF.
  const c2 = join(RAIZ, "2-Vazio");
  mkdirSync(c2, { recursive: true });
  writeFileSync(join(c2, "lista.txt"),
    "Módulo 01 - O SAK(IA)\r\nMódulo 02 - Deep-Dive IA\r\n\r\n");
  writeFileSync(join(c2, "gera_pastas.bash"), "#!/bin/bash");

  // Pasta de materiais escritos.
  const rp = join(RAIZ, "Repo");
  mkdirSync(join(rp, "versoes_anteriores"), { recursive: true });
  writeFileSync(join(rp, "Mapa.Completo.md"), "# mapa");
  writeFileSync(join(rp, "CHANGELOG.md"), "# log");
  writeFileSync(join(rp, "Mapa.do.Curso.On-line.(Completo).xlsx"), "x");
  writeFileSync(join(rp, "~$Mapa.do.Curso.On-line.(Completo).xlsx"), "lock");
  writeFileSync(join(rp, "excel2md_complete.py"), "py");
  writeFileSync(join(rp, "conversion.log"), "log");
  writeFileSync(join(rp, "versoes_anteriores", "velho.md"), "# velho");
}

montar();
afterAll(() => rmSync(RAIZ, { recursive: true, force: true }));

const modulosDe = (db: any, slug: string) =>
  db.query(`SELECT m.codigo, m.titulo FROM modulos m
            JOIN cursos c ON c.id = m.curso_id WHERE c.slug = ? ORDER BY m.posicao`).all(slug);

const itensDe = (db: any, slug: string) =>
  db.query(`SELECT i.tipo, i.titulo, i.rel_path FROM itens i
            JOIN modulos m ON m.id = i.modulo_id
            JOIN cursos c ON c.id = m.curso_id WHERE c.slug = ? ORDER BY i.posicao`).all(slug);

test("classificadores de arquivo de raiz", () => {
  expect(ehPessoal("Boleto_Francisco_Lima_Figueiredo.pdf")).toBe(true);
  expect(ehPessoal("Certificado-Ensinantes-Digitais-abc.pdf")).toBe(true);
  expect(ehPessoal("Mapa.do.Curso.xlsx")).toBe(false);
  expect(ehLixoDeOrganizacao("gera_pastas.sh")).toBe(true);
  expect(ehLixoDeOrganizacao("Lista.txt")).toBe(true);
  expect(ehLixoDeOrganizacao("_l.txt")).toBe(true);
  expect(ehLixoDeOrganizacao("~$Mapa.xlsx")).toBe(true);
  expect(ehLixoDeOrganizacao("Mapa.Completo.md")).toBe(false);
});

test("curso completo: módulo e aula entram", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  expect(modulosDe(db, "1-curso").map((m: any) => m.codigo)).toContain("01");
  expect(itensDe(db, "1-curso").some((i: any) => i.titulo === "Aula")).toBe(true);
});

test("arquivo solto na raiz vai para o módulo Avulsos", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const avulsos = modulosDe(db, "1-curso").find((m: any) => m.titulo === "Avulsos");
  expect(avulsos).toBeDefined();
  const titulos = itensDe(db, "1-curso").map((i: any) => i.titulo);
  expect(titulos).toContain("Mapa do Curso");
});

test("documento pessoal NÃO entra no catálogo", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const caminhos = itensDe(db, "1-curso").map((i: any) => i.rel_path).join("|");
  expect(caminhos).not.toContain("Boleto");
  expect(caminhos).not.toContain("Certificado");
});

test("script e lista de organização também ficam de fora", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const caminhos = itensDe(db, "1-curso").map((i: any) => i.rel_path).join("|");
  expect(caminhos).not.toContain("gera_pastas");
  expect(caminhos).not.toContain("_l.txt");
});

test("curso sem pasta nenhuma vira esqueleto a partir do lista.txt", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "2-Vazio"), 2);
  const curso = db.query("SELECT estado FROM cursos WHERE slug = '2-vazio'").get() as any;
  expect(curso.estado).toBe("esqueleto");
  const mods = modulosDe(db, "2-vazio");
  expect(mods).toHaveLength(2);
  expect(mods[0]).toEqual({ codigo: "01", titulo: "O SAK(IA)" });
  expect(itensDe(db, "2-vazio")).toHaveLength(0);
});

test("Repo vira curso de materiais com os markdowns e a planilha", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "Repo"), 9);
  const curso = db.query("SELECT estado, titulo FROM cursos WHERE slug = 'repo'").get() as any;
  expect(curso.estado).toBe("materiais");
  expect(curso.titulo).toBe("Materiais");
  const tipos = itensDe(db, "repo").map((i: any) => i.tipo);
  expect(tipos.filter((t: string) => t === "markdown")).toHaveLength(2);
  expect(tipos).toContain("planilha");
});

test("Repo: lock do Excel, .py, .log e versoes_anteriores ficam de fora", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "Repo"), 9);
  const caminhos = itensDe(db, "repo").map((i: any) => i.rel_path).join("|");
  expect(caminhos).not.toContain("~$");
  expect(caminhos).not.toContain("excel2md");
  expect(caminhos).not.toContain("conversion.log");
  expect(caminhos).not.toContain("versoes_anteriores");
});

test("rodar duas vezes não duplica nada", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const antes = itensDe(db, "1-curso").length;
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  expect(itensDe(db, "1-curso")).toHaveLength(antes);
});

test("aula removida do disco some do catálogo no scan seguinte", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  rmSync(join(RAIZ, "1-Curso", "01-Modulo Um", "01.01-Aula.mp4"));
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  expect(itensDe(db, "1-curso").some((i: any) => i.titulo === "Aula")).toBe(false);
  writeFileSync(join(RAIZ, "1-Curso", "01-Modulo Um", "01.01-Aula.mp4"), "v"); // repõe
});
