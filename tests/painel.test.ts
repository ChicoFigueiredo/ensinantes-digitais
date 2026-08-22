import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { conectar } from "../src/db.ts";
import { ACERVO, LIMIAR_PALAVRAS, LIMIAR_SIMILARIDADE } from "../src/config.ts";
import { ehDivergente, montarResposta, type Comparacao } from "../src/painel.ts";

let db: Database;

// Pasta real dentro do acervo, no mesmo padrão de tests/arquivos.test.ts:
// `dentroDoAcervo` resolve contra o ACERVO de verdade, então um `rel_path`
// de teste só passa pela checagem se o arquivo existir ali.
const PASTA_MD = join(ACERVO, "__teste-painel-materiais");
const MD_REL = "__teste-painel-materiais/nota.md";

beforeAll(() => {
  mkdirSync(PASTA_MD, { recursive: true });
  writeFileSync(join(PASTA_MD, "nota.md"), "# Nota\n\numa linha com `<nome>` em código.");

  db = conectar(":memory:");
  db.run(`INSERT INTO cursos (slug,pasta,posicao,titulo,estado) VALUES ('c1','1-Curso',0,'Curso Um','completo')`);
  db.run(`INSERT INTO modulos (curso_id,codigo,pasta,titulo,posicao) VALUES (1,'01','01-Mod','Módulo Um',0)`);
  db.run(`INSERT INTO itens (modulo_id,tipo,codigo,titulo,rel_path,posicao,bytes,duracao,srt_path,transcricao_estado)
          VALUES (1,'video','01.01','Aula Um','1-Curso/01-Mod/01.01-Aula Um.mp4',0,1000,600,'1-Curso/01-Mod/01.01-Aula Um.srt','pronto')`);
  db.run(`INSERT INTO itens (modulo_id,tipo,codigo,titulo,rel_path,posicao,bytes)
          VALUES (1,'markdown','01.02','Nota Um','${MD_REL}',1,50)`);
});

afterAll(() => rmSync(PASTA_MD, { recursive: true, force: true }));

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

// --- /api/markdown (Tarefa 19) -------------------------------------------
// Materiais é conteúdo de curso: os DOIS usuários veem — ao contrário de
// /api/tudo, aqui não há campo para esconder do procópio, porque a resposta
// só tem `titulo` e `html`.

test("/api/markdown devolve título e html renderizado", async () => {
  const j = await (await pedir("/api/markdown?id=2")).json();
  expect(j.titulo).toBe("Nota Um");
  expect(j.html).toContain("<h1>Nota</h1>");
  // O caso real do acervo (README.md, linha 80): texto entre < e > aparece
  // escapado, nunca como tag interpretada.
  expect(j.html).toContain("&lt;nome&gt;");
  expect(j.html).not.toContain("<nome>");
});

// O `id` da URL escolhe QUAL linha, não decide o que ela é. Sem conferir o
// tipo, `?id=` de um vídeo fazia a rota ler o .mp4 inteiro como texto e
// devolvê-lo como JSON — medido no acervo real: um vídeo de 2,5 MB virou 6,6
// MB de resposta, e há um de 541 MB. De graça, e para o convidado também.
test("/api/markdown recusa item que não é markdown, em vez de ler o vídeo como texto", async () => {
  const r = await pedir("/api/markdown?id=1");   // id 1 é o vídeo da fixture
  expect(r.status).toBe(400);
  const corpo = await r.text();
  expect(corpo).not.toContain("html");
});

test("/api/markdown recusa vídeo também para o convidado", async () => {
  expect((await pedir("/api/markdown?id=1", "procopio")).status).toBe(400);
});

test("/api/markdown funciona igual para o procópio — materiais é dos dois", async () => {
  const j = await (await pedir("/api/markdown?id=2", "procopio")).json();
  expect(j.titulo).toBe("Nota Um");
  expect(j.html).toContain("<h1>Nota</h1>");
});

test("/api/markdown não vaza caminho de disco na resposta a ninguém", async () => {
  for (const usuario of [undefined, "procopio"] as const) {
    const bruto = await (await pedir("/api/markdown?id=2", usuario)).text();
    expect([usuario, bruto.includes("__teste-painel-materiais")]).toEqual([usuario, false]);
    expect([usuario, bruto.includes("bytes")]).toEqual([usuario, false]);
  }
});

test("/api/markdown com id inexistente devolve 404", async () => {
  expect((await pedir("/api/markdown?id=999999")).status).toBe(404);
});

test("/api/markdown sem id devolve 404", async () => {
  expect((await pedir("/api/markdown")).status).toBe(404);
});

test("/api/markdown de um item fora do acervo devolve 400, não estoura", async () => {
  db.run(`INSERT INTO itens (modulo_id,tipo,codigo,titulo,rel_path,posicao,bytes)
          VALUES (1,'markdown','01.03','Fora','../../etc/passwd',2,10)`);
  const id = db.query<{ id: number }, []>(
    "SELECT id FROM itens WHERE rel_path = '../../etc/passwd'").get()!.id;
  const r = await pedir(`/api/markdown?id=${id}`);
  expect(r.status).toBe(400);
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

// --- ehDivergente (correção 1, rodada 1) ---------------------------------
// O critério de divergência existe duplicado de propósito em duas
// linguagens (aqui e em py/ensinantes/comparar.py, `divergente`), porque são
// dois processos separados. Sem teste automatizado deste lado, um refactor
// em `src/painel.ts` poderia quebrar o filtro em silêncio.

test("ehDivergente segue o mesmo critério do lado Python", () => {
  const limiarPalavras = 100 * LIMIAR_PALAVRAS; // 85, com LIMIAR_PALAVRAS = 0.85
  const umAtomoAbaixo = limiarPalavras - Number.EPSILON * limiarPalavras;

  const casos: [string, Comparacao, boolean][] = [
    ["encolheu bem abaixo do limiar de palavras, similaridade alta", {
      palavras_nova: 50, palavras_antiga: 100, palavras_unicas_antiga: 0, similaridade: 0.99,
    }, true],

    // Crescer sozinho nunca é divergência — uma passada nova pegando mais
    // fala que a antiga é o resultado desejado, não um defeito.
    ["cresceu (nova > antiga) com similaridade alta NÃO é divergência", {
      palavras_nova: 150, palavras_antiga: 100, palavras_unicas_antiga: 0, similaridade: 0.99,
    }, false],

    // Caso real do acervo: "Criando o Seu Método de Ensino On-line" — cresceu
    // (8661 contra 8356) E é divergente, mas pela similaridade (0,59), não
    // pelo tamanho.
    ["similaridade abaixo de 0,75 com tamanho quase igual — caso real do acervo", {
      palavras_nova: 8661, palavras_antiga: 8356, palavras_unicas_antiga: 0, similaridade: 0.59,
    }, true],

    // 159 vídeos do acervo nunca tiveram legenda — `palavras_antiga = 0`.
    ["sem legenda antiga (palavras_antiga = 0) nunca diverge por tamanho, qualquer que seja a nova", {
      palavras_nova: 999, palavras_antiga: 0, palavras_unicas_antiga: 0, similaridade: 0.99,
    }, false],
    ["sem legenda antiga (palavras_antiga = 0) e zero palavras novas também não diverge", {
      palavras_nova: 0, palavras_antiga: 0, palavras_unicas_antiga: 0, similaridade: 0.99,
    }, false],

    ["exatamente no limiar de palavras (antiga × 0,85) NÃO diverge", {
      palavras_nova: limiarPalavras, palavras_antiga: 100, palavras_unicas_antiga: 0, similaridade: 0.99,
    }, false],
    ["um átomo abaixo do limiar de palavras já diverge", {
      palavras_nova: umAtomoAbaixo, palavras_antiga: 100, palavras_unicas_antiga: 0, similaridade: 0.99,
    }, true],

    ["exatamente no limiar de similaridade (0,75) NÃO diverge", {
      palavras_nova: 100, palavras_antiga: 100, palavras_unicas_antiga: 0, similaridade: LIMIAR_SIMILARIDADE,
    }, false],
  ];

  for (const [nome, comparacao, esperado] of casos) {
    expect([nome, ehDivergente(comparacao)]).toEqual([nome, esperado]);
  }
});
