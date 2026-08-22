import { expect, test } from "bun:test";
import { aplicarSync, conectar, lerNotas, lerPrefs, lerProgresso, outroOnline, tocarSessao } from "../src/db.ts";

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

test("as consultas do cli.ts rodam contra o esquema de verdade", () => {
  const db = novo();
  // Estas são as três consultas de src/cli.ts. Elas foram escritas antes do
  // esquema existir; este teste é o que garante que não divergiram dele.
  expect(() => db.query(`
    SELECT c.titulo, c.estado, COUNT(DISTINCT m.id) modulos, COUNT(i.id) itens
      FROM cursos c LEFT JOIN modulos m ON m.curso_id = c.id
                    LEFT JOIN itens i ON i.modulo_id = m.id
     GROUP BY c.id ORDER BY c.posicao`).all()).not.toThrow();

  expect(() => db.query(
    "SELECT transcricao_estado estado, COUNT(*) n FROM itens WHERE tipo='video' GROUP BY 1").all()
  ).not.toThrow();

  expect(() => db.run(
    "UPDATE itens SET transcricao_estado='pendente' WHERE tipo='video'")).not.toThrow();

  expect(() => db.run(
    "UPDATE itens SET transcricao_estado='pendente', transcricao_erro=NULL WHERE transcricao_estado='erro'")
  ).not.toThrow();
});
