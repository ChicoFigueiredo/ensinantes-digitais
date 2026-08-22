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

test("importarModulo avisa e sai com 1 quando o módulo não existe, sem stack trace", async () => {
  // Chamado direto, e não por subcomando: todo subcomando real ganha seu módulo
  // em alguma tarefa deste plano, e aí o teste passaria a disparar o trabalho de
  // verdade. Este alvo não é um subcomando e nunca vai existir.
  const p = Bun.spawn(
    ["bun", "-e", 'const m = await import("./src/cli.ts"); await m.importarModulo("./__nunca-vai-existir.ts");'],
    { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
  );
  const [saida, erro] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  const codigo = await p.exited;

  expect(codigo).toBe(1);
  expect(saida + erro).toContain("módulo ainda não implementado");
  expect(saida + erro).toContain("__nunca-vai-existir.ts");
  // O ponto do caminho de erro é justamente NÃO despejar stack trace no usuário.
  expect(saida + erro).not.toContain("    at ");
});

test("erro de módulo ausente é reconhecido pelo texto, não por instanceof", () => {
  // No Bun a falha de resolução chega como ResolveMessage, não como Error.
  expect(ehErroDeModuloAusente(new Error("Cannot find module './x.ts'"))).toBe(true);
  expect(ehErroDeModuloAusente({ message: "Failed to resolve './y.ts'" })).toBe(true);
  expect(ehErroDeModuloAusente(new Error("qualquer outra coisa"))).toBe(false);
});

test("a ajuda lista TODOS os subcomandos que o switch atende", async () => {
  // A ajuda é escrita à mão e o switch cresce em outra parte do arquivo: nada
  // além deste teste impede um subcomando novo de existir sem aparecer no
  // `--help`. Lê o próprio fonte, e não a saída, para pegar o descasamento
  // mesmo em subcomando que precisa de banco para rodar.
  const fonte = await Bun.file(import.meta.dir + "/../src/cli.ts").text();
  const casos = [...fonte.matchAll(/case "([a-z]+)":/g)].map((m) => m[1]!);
  const { stdout } = await rodarCli();

  expect(casos.length).toBeGreaterThan(0);
  for (const caso of casos) expect(stdout).toContain(`  ${caso} `);
});

test("a ajuda não anuncia subcomando que o switch não atende", async () => {
  const fonte = await Bun.file(import.meta.dir + "/../src/cli.ts").text();
  const casos = new Set([...fonte.matchAll(/case "([a-z]+)":/g)].map((m) => m[1]!));
  const { stdout } = await rodarCli();

  const anunciados = stdout
    .split("\n")
    .map((l) => l.match(/^ {2}([a-z]+) {2,}\S/)?.[1])
    .filter((n): n is string => Boolean(n));

  expect(anunciados.length).toBe(casos.size);
  for (const nome of anunciados) expect(casos.has(nome)).toBe(true);
});
