import { expect, test } from "bun:test";

import { conectar } from "../src/db.ts";
import { fetchSeguro, montarResposta } from "../src/painel.ts";
import { disparar, estadoTarefas, TAREFAS } from "../src/tarefas.ts";

const db = conectar(":memory:");
const pedir = (rota: string, usuario: string, body: unknown = {}) =>
  montarResposta(db, new Request(`http://x${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Painel-Usuario": usuario },
    body: JSON.stringify(body),
  }));

test("tarefa desconhecida não dispara processo nenhum", () => {
  expect(disparar("rm-rf-tudo")).toEqual({ ok: false, msg: "tarefa desconhecida: rm-rf-tudo" });
});

test("as tarefas expostas são exatamente as quatro previstas", () => {
  expect(Object.keys(TAREFAS).sort()).toEqual(["recortes", "requeue", "scan", "transcrever"]);
});

test("o procópio não dispara tarefa", async () => {
  const r = await pedir("/api/run", "procopio", { nome: "scan" });
  expect(r.status).toBe(403);
});

test("o procópio não revela caminho", async () => {
  const r = await pedir("/api/revelar", "procopio", { id: 1 });
  expect(r.status).toBe(403);
});

test("o chico recebe erro de negócio, não 403", async () => {
  const r = await pedir("/api/run", "chico", { nome: "inexistente" });
  expect(r.status).toBe(400);
  expect((await r.json()).msg).toContain("desconhecida");
});

test("revelar recusa id que não existe no banco — o caminho vem de lá, não da URL", async () => {
  const r = await pedir("/api/revelar", "chico", { id: 999999 });
  expect(r.status).toBe(404);
});

// --- Achado 1 (revisão, round 1) ----------------------------------------
// `TAREFAS[nome]` num objeto literal comum enxerga a cadeia de protótipo:
// "constructor", "toString", "__proto__" etc. passariam por um `if (!t)` e
// chegariam ao `Bun.spawn` com `cmd` indefinido.

test("nome vindo da cadeia de protótipo não é tarefa", () => {
  for (const n of ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"]) {
    expect([n, disparar(n)]).toEqual([n, { ok: false, msg: `tarefa desconhecida: ${n}` }]);
  }
});

test("tarefa que não conseguiu iniciar não fica presa em 'em curso'", () => {
  // Não dá para forçar o `Bun.spawn` a falhar sem mexer em `TAREFAS`, então o
  // teste é sobre o efeito observável: depois de um nome inválido, o estado
  // continua limpo e nenhuma tarefa aparece "rodando" por engano.
  disparar("constructor");
  expect(estadoTarefas().some((t) => t.rodando)).toBe(false);
});

// --- Achado 2 (revisão, round 1) ----------------------------------------
// Qualquer exceção não tratada em qualquer rota — não só `/api/run` — fazia
// o Bun devolver a página de erro de desenvolvimento, com linha de
// código-fonte e caminho absoluto do projeto embutidos no HTML. O painel
// fica exposto por túnel: o que vaza aqui vaza para fora de casa.
//
// O Achado 1 fechou o único caminho conhecido para uma exceção (nome vindo
// da cadeia de protótipo). Para provar que a BORDA continua segura mesmo
// assim — e não só aquela rota específica — este teste força um erro
// genuíno e independente de rota: o primeiro `db.run` que QUALQUER
// requisição faz, dentro de `tocarSessao`, antes mesmo de rotear.

test("exceção não tratada em qualquer rota vira 500 limpo, sem vazar fonte nem caminho", async () => {
  const runOriginal = db.run.bind(db);
  db.run = (() => {
    throw new Error("simulado: banco travado");
  }) as typeof db.run;

  try {
    const r = await fetchSeguro(db, new Request("http://x/api/eu"));
    expect(r.status).toBe(500);
    const texto = await r.text();
    expect(texto).not.toContain("/mnt/");
    expect(texto).not.toContain("src/");
    expect(texto).not.toContain("TypeError");
    expect(texto).not.toContain("tocarSessao");
    expect(texto).toBe("erro interno");
  } finally {
    db.run = runOriginal;
  }
});
