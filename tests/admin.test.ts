import { expect, test } from "bun:test";

import { conectar } from "../src/db.ts";
import { montarResposta } from "../src/painel.ts";
import { disparar, TAREFAS } from "../src/tarefas.ts";

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
