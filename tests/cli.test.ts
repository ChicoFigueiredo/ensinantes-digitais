import { expect, test } from "bun:test";
import { ehErroDeModuloAusente } from "../src/cli.ts";

/**
 * O CLI é testado via `Bun.spawn`, e não por import direto, porque o
 * comportamento que importa aqui é o processo inteiro: código de saída e
 * ausência de stack trace na stdout/stderr — exatamente o que as seis
 * tarefas seguintes (5, 6, 10, 11, 12, 16) vão exigir ao rodar
 * `bun run scan`, `bun run painel` e `bun run recortes` antes de esses
 * módulos existirem.
 */
async function rodarCli(...args: string[]) {
  const processo = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, codigoSaida] = await Promise.all([
    new Response(processo.stdout).text(),
    new Response(processo.stderr).text(),
    processo.exited,
  ]);
  return { stdout, stderr, codigoSaida };
}

test("sem argumento imprime a ajuda e sai com 0", async () => {
  const { stdout, codigoSaida } = await rodarCli();
  expect(stdout).toContain("Uso: bun run src/cli.ts");
  expect(codigoSaida).toBe(0);
});

test("argumento desconhecido imprime a ajuda e sai com 1", async () => {
  const { stdout, codigoSaida } = await rodarCli("blergh");
  expect(stdout).toContain("Uso: bun run src/cli.ts");
  expect(codigoSaida).toBe(1);
});

test("módulo ausente avisa e sai com 1, sem stack trace", async () => {
  // Alvo deliberadamente inexistente: qualquer subcomando real teria seu
  // módulo criado por uma tarefa posterior, e aí o teste passaria a disparar
  // o trabalho de verdade em vez de exercitar o caminho de erro.
  const { stdout, stderr, codigoSaida } = await rodarCli("__modulo-inexistente");
  expect(codigoSaida).toBe(1);
  expect(stdout + stderr).not.toContain("at ");
});

test("erro de módulo ausente é reconhecido pelo texto, não por instanceof", () => {
  // No Bun a falha de resolução chega como ResolveMessage, não como Error.
  expect(ehErroDeModuloAusente(new Error("Cannot find module './x.ts'"))).toBe(true);
  expect(ehErroDeModuloAusente({ message: "Failed to resolve './y.ts'" })).toBe(true);
  expect(ehErroDeModuloAusente(new Error("qualquer outra coisa"))).toBe(false);
});
