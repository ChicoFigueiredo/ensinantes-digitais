import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { conectar } from "../src/db.ts";
import { COPIA_PATH, sincronizarCopia } from "../src/backup.ts";

// `backup.ts` chegou do focus-scrap e ficou órfão: nenhum chamador, nenhum
// teste. O acervo tem redundância, mas progresso e anotação só existem no
// `ensinantes.db` — se ele se perder, não há de onde refazer. Estes testes
// existem para a cópia não voltar a ser código morto sem ninguém notar.

test("a cópia sai legível e com os dados que estavam no banco", () => {
  const db = conectar(":memory:");
  db.run("INSERT INTO cursos (slug, pasta, titulo, estado, posicao) VALUES ('x','x','Curso X','completo',1)");

  const r = sincronizarCopia(db);
  expect(r.ok).toBe(true);
  expect(r.bytes).toBeGreaterThan(0);
  expect(r.caminho).toBe(COPIA_PATH);

  // O que importa não é o arquivo existir: é dar para abrir e ler de volta.
  const copia = conectar(COPIA_PATH);
  expect(copia.query("SELECT titulo FROM cursos").get()).toEqual({ titulo: "Curso X" });
  copia.close();
});

test("não deixa o .tmp para trás quando dá certo", () => {
  const db = conectar(":memory:");
  sincronizarCopia(db);
  // O `.tmp` vira o nome final por rename; sobrar arquivo temporário quer
  // dizer que a troca não aconteceu.
  expect(existsSync(`${COPIA_PATH}.tmp`)).toBe(false);
});

test("falha devolve ok=false em vez de estourar, e diz o motivo", () => {
  const db = conectar(":memory:");
  db.close();  // banco fechado: VACUUM INTO tem de falhar

  // E `registrar` falha junto, pelo mesmo motivo. A função tem de sobreviver
  // aos dois — ela roda num setInterval, onde ninguém pega exceção.
  const r = sincronizarCopia(db);
  expect(r.ok).toBe(false);
  expect(r.erro).toBeTruthy();
});
