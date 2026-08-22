/**
 * Esquema e acesso. Sem regra de negócio: quem decide o que é divergência ou
 * o que é recorte são outros módulos.
 *
 * O catálogo (`cursos`/`modulos`/`itens`) é DERIVADO do disco — o scan pode
 * refazê-lo a qualquer momento. O estado de quem estuda (`progresso`, `notas`,
 * `prefs`) é o único dado que só existe aqui, e por isso é o que a cópia de
 * backup precisa preservar.
 */
import { Database } from "bun:sqlite";

import { DB_PATH, type Usuario } from "./config.ts";

export type Estado = "pendente" | "rodando" | "pronto" | "erro" | "sem-video";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS cursos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  pasta         TEXT NOT NULL,
  posicao       INTEGER NOT NULL,
  titulo        TEXT NOT NULL,
  estado        TEXT NOT NULL,            -- completo | esqueleto | materiais
  escaneado_em  TEXT
);

CREATE TABLE IF NOT EXISTS modulos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id  INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,
  pasta     TEXT,
  titulo    TEXT NOT NULL,
  posicao   INTEGER NOT NULL,
  UNIQUE(curso_id, codigo)
);

CREATE TABLE IF NOT EXISTS itens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id           INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL,       -- video|pdf|planilha|doc|link|markdown
  codigo              TEXT,
  titulo              TEXT NOT NULL,
  rel_path            TEXT NOT NULL UNIQUE,
  posicao             INTEGER NOT NULL,
  bytes               INTEGER NOT NULL DEFAULT 0,
  duracao             REAL,
  srt_path            TEXT,
  alvo                TEXT,                -- URL, para tipo 'link'
  transcricao_estado  TEXT NOT NULL DEFAULT 'pendente',
  transcricao_erro    TEXT,
  tentativas          INTEGER NOT NULL DEFAULT 0,
  transcrito_em       TEXT,
  comparacao          TEXT                 -- JSON {palavras_nova, palavras_antiga, similaridade}
);

CREATE INDEX IF NOT EXISTS idx_itens_modulo ON itens(modulo_id);
CREATE INDEX IF NOT EXISTS idx_itens_transc ON itens(transcricao_estado);

CREATE TABLE IF NOT EXISTS recortes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path  TEXT NOT NULL UNIQUE,
  item_id   INTEGER REFERENCES itens(id) ON DELETE SET NULL,
  arquivos  INTEGER NOT NULL,
  bytes     INTEGER NOT NULL,
  visto_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eventos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  nivel     TEXT NOT NULL,
  origem    TEXT NOT NULL,
  mensagem  TEXT NOT NULL
);

-- Daqui para baixo, o estado de quem estuda. 'usuario' na chave primária em
-- todas: é o que impede o procópio de sobrescrever o que o chico marcou.
CREATE TABLE IF NOT EXISTS progresso (
  usuario    TEXT    NOT NULL,
  chave      TEXT    NOT NULL,
  segundos   REAL    NOT NULL DEFAULT 0,
  feito      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario, chave)
);

CREATE TABLE IF NOT EXISTS notas (
  usuario    TEXT NOT NULL,
  chave      TEXT NOT NULL,
  texto      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario, chave)
);

CREATE TABLE IF NOT EXISTS prefs (
  usuario    TEXT NOT NULL,
  nome       TEXT NOT NULL,
  valor      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario, nome)
);

CREATE TABLE IF NOT EXISTS ui_estado (
  usuario TEXT NOT NULL,
  nome    TEXT NOT NULL,
  valor   TEXT NOT NULL,
  PRIMARY KEY (usuario, nome)
);

CREATE TABLE IF NOT EXISTS sessoes (
  usuario       TEXT PRIMARY KEY,
  ultimo_acesso TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function conectar(path: string = DB_PATH): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(ESQUEMA);
  return db;
}

export interface Progresso { segundos: number; feito: boolean }

export function lerProgresso(db: Database, usuario: Usuario): Record<string, Progresso> {
  const linhas = db.query<{ chave: string; segundos: number; feito: number }, [string]>(
    "SELECT chave, segundos, feito FROM progresso WHERE usuario = ?").all(usuario);
  return Object.fromEntries(linhas.map((l) => [l.chave, { segundos: l.segundos, feito: !!l.feito }]));
}

export function lerNotas(db: Database, usuario: Usuario): Record<string, string> {
  const linhas = db.query<{ chave: string; texto: string }, [string]>(
    "SELECT chave, texto FROM notas WHERE usuario = ?").all(usuario);
  return Object.fromEntries(linhas.map((l) => [l.chave, l.texto]));
}

export function lerPrefs(db: Database, usuario: Usuario): Record<string, string> {
  const linhas = db.query<{ nome: string; valor: string }, [string]>(
    "SELECT nome, valor FROM prefs WHERE usuario = ?").all(usuario);
  return Object.fromEntries(linhas.map((l) => [l.nome, l.valor]));
}

export type OpSync =
  | { tipo: "progresso"; chave: string; segundos: number; feito: boolean }
  | { tipo: "nota"; chave: string; texto: string }
  | { tipo: "pref"; nome: string; valor: string };

/**
 * Aplica um lote de escritas do painel.
 *
 * Toda operação é "deixe assim", nunca "some mais um" — por isso reenviar o
 * mesmo lote é inofensivo, e por isso o navegador pode tentar de novo depois de
 * uma piscada do túnel sem medo de duplicar.
 */
export function aplicarSync(db: Database, usuario: Usuario, ops: OpSync[]): { aplicadas: number } {
  const prog = db.prepare(`INSERT INTO progresso (usuario, chave, segundos, feito, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(usuario, chave) DO UPDATE SET
      segundos = excluded.segundos, feito = excluded.feito, updated_at = excluded.updated_at`);
  const nota = db.prepare(`INSERT INTO notas (usuario, chave, texto, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(usuario, chave) DO UPDATE SET
      texto = excluded.texto, updated_at = excluded.updated_at`);
  // Texto em branco não vira linha vazia: apagar o texto apaga a anotação.
  const semNota = db.prepare("DELETE FROM notas WHERE usuario = ? AND chave = ?");
  const pref = db.prepare(`INSERT INTO prefs (usuario, nome, valor, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(usuario, nome) DO UPDATE SET
      valor = excluded.valor, updated_at = excluded.updated_at`);

  const lote = db.transaction((lista: OpSync[]) => {
    for (const op of lista) {
      if (op.tipo === "progresso") prog.run(usuario, op.chave, op.segundos, op.feito ? 1 : 0);
      else if (op.tipo === "nota") {
        if (op.texto.trim()) nota.run(usuario, op.chave, op.texto);
        else semNota.run(usuario, op.chave);
      } else pref.run(usuario, op.nome, op.valor);
    }
  });
  lote(ops);
  return { aplicadas: ops.length };
}

export function tocarSessao(db: Database, usuario: Usuario): void {
  db.run(`INSERT INTO sessoes (usuario, ultimo_acesso) VALUES (?, datetime('now'))
    ON CONFLICT(usuario) DO UPDATE SET ultimo_acesso = datetime('now')`, [usuario]);
}

/** Alguém que não seja `usuario` deu sinal de vida nos últimos `minutos`. */
export function outroOnline(db: Database, usuario: Usuario, minutos = 5): boolean {
  const r = db.query<{ n: number }, [string, string]>(
    `SELECT COUNT(*) n FROM sessoes
      WHERE usuario <> ? AND ultimo_acesso > datetime('now', ?)`
  ).get(usuario, `-${minutos} minutes`);
  return (r?.n ?? 0) > 0;
}

export function registrar(db: Database, nivel: "info" | "erro", origem: string, mensagem: string): void {
  db.run("INSERT INTO eventos (nivel, origem, mensagem) VALUES (?, ?, ?)", [nivel, origem, mensagem]);
}

/** `rodando` depois de um reinício é processo morto, não trabalho em curso. */
export function destravar(db: Database): number {
  return db.run("UPDATE itens SET transcricao_estado = 'pendente' WHERE transcricao_estado = 'rodando'").changes;
}
