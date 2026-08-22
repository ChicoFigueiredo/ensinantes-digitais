import { expect, test } from "bun:test";
import { existsSync } from "node:fs";

import {
  ACERVO, DB_PATH, PAINEL_PORTA, USUARIOS, USUARIO_PADRAO,
  LIMIAR_PALAVRAS, LIMIAR_SIMILARIDADE,
} from "../src/config.ts";

test("o acervo aponta para uma pasta que existe", () => {
  expect(existsSync(ACERVO)).toBe(true);
});

test("a porta é a 17789 — a mesma do infra/remote/config.sh", () => {
  expect(PAINEL_PORTA).toBe(17789);
});

test("são exatamente dois usuários, e o padrão é o chico", () => {
  expect([...USUARIOS]).toEqual(["chico", "procopio"]);
  expect(USUARIO_PADRAO).toBe("chico");
});

test("o banco fica na raiz do projeto, não no acervo", () => {
  expect(DB_PATH.endsWith("ensinantes.db")).toBe(true);
  expect(DB_PATH.startsWith(ACERVO)).toBe(false);
});

test("os limiares de divergência têm os valores da spec", () => {
  expect(LIMIAR_PALAVRAS).toBe(0.85);
  expect(LIMIAR_SIMILARIDADE).toBe(0.75);
});
