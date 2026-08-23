import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  ACERVO, BASE_DIR, DB_PATH, PAINEL_PORTA, USUARIOS, USUARIO_PADRAO,
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

// Achado 10 da revisão final: `src/revelar.ts` lia `process.env.WSL_DISTRO_NAME`
// direto. Era a única ocorrência fora daqui, e a regra só vale enquanto não tem
// exceção — por isso o teste varre o `src/` inteiro, e não aquele arquivo.

test("só o config.ts lê process.env em todo o src/", async () => {
  const arquivos = [...new Bun.Glob("**/*.ts").scanSync(join(BASE_DIR, "src"))].sort();
  expect(arquivos.length).toBeGreaterThan(10);

  const culpados: string[] = [];
  for (const arquivo of arquivos) {
    if (arquivo === "config.ts") continue;
    const fonte = await Bun.file(join(BASE_DIR, "src", arquivo)).text();
    if (/process\.env/.test(fonte)) culpados.push(arquivo);
  }
  expect(culpados).toEqual([]);
});

// A saída que impede a próxima limpeza de teste de apagar dado de verdade.
// Já aconteceu: um agente subiu o painel real, clicou para conferir a tela e
// depois apagou as linhas que criou — levando junto uma preferência que era do
// dono. Só voltou porque a cópia de `backup.ts` existia.
test("ED_BANCO desvia o painel para outro banco, e o padrão continua o de produção", async () => {
  const raiz = dirname(import.meta.dir);

  const padrao = Bun.spawnSync(["bun", "-e",
    'const c = await import("./src/config.ts"); console.log(c.DB_PATH, c.BANCO_DE_TESTE);'],
    { cwd: raiz, env: { ...process.env, ED_BANCO: "" } });
  const saidaPadrao = padrao.stdout.toString().trim();
  expect(saidaPadrao).toContain("ensinantes.db");
  expect(saidaPadrao).toEndWith("false");

  const desviado = Bun.spawnSync(["bun", "-e",
    'const c = await import("./src/config.ts"); console.log(c.DB_PATH, c.BANCO_DE_TESTE);'],
    { cwd: raiz, env: { ...process.env, ED_BANCO: "/tmp/painel-de-teste.db" } });
  const saidaDesviada = desviado.stdout.toString().trim();
  expect(saidaDesviada).toBe("/tmp/painel-de-teste.db true");
  expect(saidaDesviada).not.toContain("ensinantes.db");
});
