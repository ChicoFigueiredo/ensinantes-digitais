import { beforeAll, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import { conectar } from "../src/db.ts";
import { montarResposta } from "../src/painel.ts";

let db: Database;

beforeAll(() => {
  db = conectar(":memory:");
  db.run(`INSERT INTO cursos (slug,pasta,posicao,titulo,estado) VALUES ('c1','1-Curso',0,'Curso Um','completo')`);
  db.run(`INSERT INTO modulos (curso_id,codigo,pasta,titulo,posicao) VALUES (1,'01','01-Mod','Módulo Um',0)`);
  db.run(`INSERT INTO itens (modulo_id,tipo,codigo,titulo,rel_path,posicao,bytes,duracao,srt_path,transcricao_estado)
          VALUES (1,'video','01.01','Aula Um','1-Curso/01-Mod/01.01-Aula Um.mp4',0,1000,600,'1-Curso/01-Mod/01.01-Aula Um.srt','pronto')`);
});

const pedir = (rota: string, usuario?: string, init: RequestInit = {}) =>
  montarResposta(db, new Request(`http://x${rota}`, {
    ...init, headers: { ...(init.headers ?? {}), ...(usuario ? { "X-Painel-Usuario": usuario } : {}) },
  }));

test("a home responde HTML", async () => {
  const r = await pedir("/");
  expect(r.status).toBe(200);
  expect(r.headers.get("Content-Type")).toContain("text/html");
});

test("/api/eu devolve chico sem header", async () => {
  const j = await (await pedir("/api/eu")).json();
  expect(j.usuario).toBe("chico");
  expect(j.permissoes.admin).toBe(true);
  expect(j.indicadores).toEqual({ eu: "c", outro: null });
});

test("/api/eu com o procópio devolve permissões vazias", async () => {
  const j = await (await pedir("/api/eu", "procopio")).json();
  expect(j.usuario).toBe("procopio");
  expect(j.permissoes.admin).toBe(false);
  expect(j.indicadores.eu).toBe("p");
});

test("TODA rota administrativa devolve 403 para o procópio", async () => {
  for (const rota of ["/api/run", "/api/requeue", "/api/revelar", "/api/abrir", "/api/limpeza"]) {
    const r = await pedir(rota, "procopio", { method: "POST", body: "{}" });
    expect([rota, r.status]).toEqual([rota, 403]);
  }
});

test("/api/sync NUNCA é bloqueada — nem para o procópio", async () => {
  const r = await pedir("/api/sync", "procopio", {
    method: "POST", body: JSON.stringify({ ops: [] }),
    headers: { "Content-Type": "application/json" },
  });
  expect(r.status).toBe(200);
});

test("/api/tudo esconde bytes e caminho do procópio", async () => {
  const chico = await (await pedir("/api/tudo?curso=c1", "chico")).json();
  const proc  = await (await pedir("/api/tudo?curso=c1", "procopio")).json();

  const itemChico = chico.arvore[0].modulos[0].itens[0];
  const itemProc  = proc.arvore[0].modulos[0].itens[0];

  expect(itemChico.bytes).toBe(1000);
  expect(itemChico.relPath).toContain("01.01-Aula Um.mp4");
  expect(itemProc.bytes).toBeUndefined();
  expect(itemProc.relPath).toBeUndefined();

  // Mas o conteúdo em si continua lá para os dois.
  expect(itemProc.titulo).toBe("Aula Um");
  expect(itemProc.duracao).toBe(600);
  expect(itemProc.temLegenda).toBe(true);
});

test("/api/tudo esconde fila e eventos do procópio", async () => {
  const proc = await (await pedir("/api/tudo?curso=c1", "procopio")).json();
  expect(proc.eventos).toBeUndefined();
  expect(proc.fila).toBeUndefined();
  expect(proc.disco).toBeUndefined();
});

test("o progresso que vem em /api/tudo é o do usuário que pediu", async () => {
  await pedir("/api/sync", "procopio", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops: [{ tipo: "progresso", chave: "i:1", segundos: 5, feito: true }] }),
  });
  const proc  = await (await pedir("/api/tudo?curso=c1", "procopio")).json();
  const chico = await (await pedir("/api/tudo?curso=c1", "chico")).json();
  expect(proc.progresso["i:1"]).toEqual({ segundos: 5, feito: true });
  expect(chico.progresso["i:1"]).toBeUndefined();
});

test("rota desconhecida devolve 404", async () => {
  expect((await pedir("/api/inexistente")).status).toBe(404);
});

// Os dois testes abaixo cobrem o ponto crítico desta tarefa: `ehRotaAdmin`
// compara por igualdade exata, então o risco não está nela — está em rotear
// com uma string e checar permissão com outra. Se `montarResposta` alguma
// hora passar a normalizar o caminho para decidir o handler (colapsar barra
// dupla, tirar barra final, mudar caixa) sem usar a MESMA string normalizada
// para checar `ehRotaAdmin`, um destes pega o bypass.

test("variação de caminho não vira bypass: ou é admin e barra, ou não é rota", async () => {
  for (const rota of ["/api/run/", "/api//run", "/API/run", "/api/run%20", "/api/run?x=1"]) {
    const r = await pedir(rota, "procopio", { method: "POST", body: "{}" });
    // Só há dois desfechos aceitáveis: 403 (reconhecida como admin e barrada)
    // ou 404 (não é rota nenhuma). Um 200 aqui significa que o handler rodou
    // sem passar pelo portão.
    expect([rota, [403, 404].includes(r.status)]).toEqual([rota, true]);
  }
});

test("query string não tira uma rota do conjunto administrativo", async () => {
  const r = await pedir("/api/run?nome=scan", "procopio", { method: "POST", body: "{}" });
  expect(r.status).toBe(403);
});

// Os testes acima conferem uma LISTA de chaves conhecidas (`bytes`, `relPath`,
// `fila`, `eventos`, `disco`). Isso pega o que a gente lembrou de listar, mas
// não pega um campo novo — acrescentado por uma tarefa futura — que carregue
// caminho ou tamanho dentro de um objeto aninhado qualquer: ele passaria pela
// lista porque ninguém o acrescentou a ela. Conferir o TEXTO bruto da resposta
// pega esse caso, porque não depende de alguém lembrar de nomear o campo.

test("o texto bruto da resposta ao procópio não vaza caminho nem tamanho", async () => {
  const bruto = await (await pedir("/api/tudo?curso=c1", "procopio")).text();

  for (const proibido of ["/mnt/", ".mp4", ".srt", "rel_path", "relPath", "bytes"]) {
    expect([proibido, bruto.includes(proibido)]).toEqual([proibido, false]);
  }
});

test("a mesma rota entrega caminho e tamanho para o chico", async () => {
  const bruto = await (await pedir("/api/tudo?curso=c1", "chico")).text();
  // O contraponto: sem ele, o teste acima passaria com uma resposta vazia.
  expect(bruto).toContain("bytes");
  expect(bruto).toContain("relPath");
});

test("nenhum campo administrativo vaza para o procópio", async () => {
  const proc = await (await pedir("/api/tudo?curso=c1", "procopio")).json();
  for (const campo of ["disco", "fila", "eventos", "tarefas", "divergencias", "recortes"]) {
    expect([campo, proc[campo]]).toEqual([campo, undefined]);
  }
});

test("o texto da resposta ao procópio não contém caminho de disco", async () => {
  const bruto = await (await pedir("/api/tudo?curso=c1", "procopio")).text();
  expect(bruto).not.toContain("/mnt/");
  expect(bruto).not.toContain(".mp4");
});
