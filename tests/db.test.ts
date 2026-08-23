import { expect, test } from "bun:test";
import {
  aplicarSync, conectar, lerNotas, lerPrefs, lerProgresso, motivoDeRecusa, outroOnline,
  tocarSessao, ultimoAberto,
} from "../src/db.ts";

const novo = () => conectar(":memory:");

test("o esquema sobe do zero sem erro", () => {
  const db = novo();
  const tabelas = db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  for (const t of ["cursos", "modulos", "itens", "recortes", "eventos",
                   "progresso", "notas", "prefs", "ui_estado", "sessoes"]) {
    expect(tabelas).toContain(t);
  }
});

test("progresso do procópio não aparece na leitura do chico", () => {
  const db = novo();
  aplicarSync(db, "procopio", [{ tipo: "progresso", chave: "i:1", segundos: 42, feito: true }]);
  expect(lerProgresso(db, "procopio")["i:1"]).toEqual({ segundos: 42, feito: true });
  expect(lerProgresso(db, "chico")["i:1"]).toBeUndefined();
});

test("os dois podem marcar a mesma aula sem se atropelar", () => {
  const db = novo();
  aplicarSync(db, "chico",    [{ tipo: "progresso", chave: "i:7", segundos: 10, feito: false }]);
  aplicarSync(db, "procopio", [{ tipo: "progresso", chave: "i:7", segundos: 99, feito: true }]);
  expect(lerProgresso(db, "chico")["i:7"]).toEqual({ segundos: 10, feito: false });
  expect(lerProgresso(db, "procopio")["i:7"]).toEqual({ segundos: 99, feito: true });
});

test("reenviar o mesmo lote é inofensivo", () => {
  const db = novo();
  const ops = [{ tipo: "progresso", chave: "i:3", segundos: 5, feito: false }] as const;
  aplicarSync(db, "chico", [...ops]);
  aplicarSync(db, "chico", [...ops]);
  expect(lerProgresso(db, "chico")["i:3"]).toEqual({ segundos: 5, feito: false });
  expect(db.query("SELECT COUNT(*) c FROM progresso").get()).toEqual({ c: 1 });
});

test("nota vazia apaga a linha em vez de guardar string vazia", () => {
  const db = novo();
  aplicarSync(db, "chico", [{ tipo: "nota", chave: "i:9", texto: "lembrar disso" }]);
  expect(lerNotas(db, "chico")["i:9"]).toBe("lembrar disso");
  aplicarSync(db, "chico", [{ tipo: "nota", chave: "i:9", texto: "   " }]);
  expect(lerNotas(db, "chico")["i:9"]).toBeUndefined();
});

test("preferência é por usuário", () => {
  const db = novo();
  aplicarSync(db, "chico", [{ tipo: "pref", nome: "velocidade", valor: "1.5" }]);
  expect(lerPrefs(db, "chico").velocidade).toBe("1.5");
  expect(lerPrefs(db, "procopio").velocidade).toBeUndefined();
});

test("presença: o chico vê o procópio recém-visto", () => {
  const db = novo();
  tocarSessao(db, "procopio");
  expect(outroOnline(db, "chico")).toBe(true);
});

test("presença: ninguém está online quando ninguém abriu", () => {
  const db = novo();
  tocarSessao(db, "chico");
  expect(outroOnline(db, "chico")).toBe(false);
});

test("presença expira depois da janela", () => {
  const db = novo();
  db.run("INSERT INTO sessoes (usuario, ultimo_acesso) VALUES ('procopio', datetime('now','-30 minutes'))");
  expect(outroOnline(db, "chico", 5)).toBe(false);
});

// Achado 11 da revisão final: este teste redigitava as consultas de
// src/cli.ts como literais aqui dentro e afirmava `not.toThrow()` sobre a
// CÓPIA. Quebrar a consulta lá continuava passando aqui. `tests/cli.test.ts`
// já resolvia o problema análogo do jeito certo — lendo o fonte —, e é o que
// este faz agora: as consultas que rodam contra o esquema são as que estão em
// cli.ts, extraídas de lá.

test("as consultas do cli.ts rodam contra o esquema de verdade", async () => {
  const db = novo();
  const fonte = await Bun.file(new URL("../src/cli.ts", import.meta.url)).text();
  // Literal (aspas ou crase) que começa em SELECT/UPDATE, com o mesmo
  // delimitador fechando. As consultas do cli.ts não interpolam nada.
  const consultas = [...fonte.matchAll(/(["`])(\s*(?:SELECT|UPDATE|INSERT|DELETE)[\s\S]*?)\1/g)]
    .map((m) => m[2]!.trim());

  // Sem isto, um regex que deixasse de casar faria o teste passar vazio — que
  // é a mesma falsa segurança de antes, por outro caminho.
  expect(consultas.length).toBeGreaterThanOrEqual(4);
  expect(consultas.filter((c) => c.startsWith("SELECT")).length).toBeGreaterThanOrEqual(2);
  expect(consultas.filter((c) => c.startsWith("UPDATE")).length).toBeGreaterThanOrEqual(2);

  for (const consulta of consultas) {
    // `query` PREPARA a consulta: coluna ou tabela que não existe no esquema
    // estoura aqui. O banco é `:memory:` e está vazio, então o UPDATE não
    // toca em nada.
    let erro: string | null = null;
    try { db.query(consulta).all(); } catch (e) { erro = String(e); }
    expect([consulta, erro]).toEqual([consulta, null]);
  }
});

test("ultimoAberto ignora o que já foi concluído", () => {
  const db = novo();
  aplicarSync(db, "chico", [{ tipo: "progresso", chave: "i:1", segundos: 10, feito: true }]);
  expect(ultimoAberto(db, "chico")).toBeNull();
});

test("ultimoAberto ignora o que nunca foi tocado", () => {
  const db = novo();
  aplicarSync(db, "chico", [{ tipo: "progresso", chave: "i:1", segundos: 0, feito: false }]);
  expect(ultimoAberto(db, "chico")).toBeNull();
});

test("ultimoAberto é por usuário", () => {
  const db = novo();
  aplicarSync(db, "procopio", [{ tipo: "progresso", chave: "i:5", segundos: 30, feito: false }]);
  expect(ultimoAberto(db, "chico")).toBeNull();
  expect(ultimoAberto(db, "procopio")).toEqual({ chave: "i:5", segundos: 30 });
});

// --- Achado 8 (revisão final): op ruim não entope a fila -------------------
// `escoar` (src/ui/player.ts) só tira o lote do localStorage quando `r.ok`. Um
// 500 deixava o MESMO lote voltando a cada 8 s para sempre, e tudo que a
// pessoa marcasse depois se empilhava atrás dele sem nunca chegar ao banco.

test("uma op inválida não impede as válidas do mesmo lote de gravar", () => {
  const db = novo();
  const r = aplicarSync(db, "chico", [
    { tipo: "progresso", chave: "i:1", segundos: 12, feito: false },
    { tipo: "nota", chave: "i:2" },                       // sem texto: estourava no .trim()
    { tipo: "nota", chave: "i:3", texto: "vale" },
  ]);
  expect(r.aplicadas).toBe(2);
  expect(r.recusadas).toEqual([{ indice: 1, motivo: "texto não é texto" }]);
  expect(lerProgresso(db, "chico")["i:1"]).toEqual({ segundos: 12, feito: false });
  expect(lerNotas(db, "chico")["i:3"]).toBe("vale");
});

test("op recusada fica registrada em eventos, não descartada em silêncio", () => {
  const db = novo();
  aplicarSync(db, "chico", [{ tipo: "xxx" }]);
  const e = db.query<{ nivel: string; origem: string; mensagem: string }, []>(
    "SELECT nivel, origem, mensagem FROM eventos").all();
  expect(e.length).toBe(1);
  expect(e[0]!.nivel).toBe("erro");
  expect(e[0]!.origem).toBe("sync");
  expect(e[0]!.mensagem).toContain("tipo desconhecido");
});

test("motivoDeRecusa reconhece cada forma quebrada", () => {
  const casos: [unknown, string | null][] = [
    [{ tipo: "progresso", chave: "i:1", segundos: 0, feito: true }, null],
    [{ tipo: "nota", chave: "i:1", texto: "" }, null],
    [{ tipo: "pref", nome: "velocidade", valor: "1.5" }, null],

    [{ tipo: "progresso" }, "chave ausente"],
    [{ tipo: "progresso", chave: "i:1" }, "segundos não é número"],
    [{ tipo: "progresso", chave: "i:1", segundos: NaN }, "segundos não é número"],
    [{ tipo: "nota", chave: "  " }, "chave ausente"],
    [{ tipo: "pref", valor: "x" }, "nome ausente"],
    [{ tipo: "pref", nome: "velocidade", valor: 2 }, "valor não é texto"],
    [{ tipo: "xxx" }, 'tipo desconhecido: "xxx"'],
    [{}, "tipo desconhecido: sem tipo"],
    [null, "operação não é um objeto"],
    ["nota", "operação não é um objeto"],
  ];
  for (const [op, esperado] of casos) {
    expect([JSON.stringify(op), motivoDeRecusa(op)]).toEqual([JSON.stringify(op), esperado]);
  }
});
