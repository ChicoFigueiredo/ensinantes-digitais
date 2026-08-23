"""Acesso ao mesmo SQLite do lado TypeScript. O esquema é criado lá."""
from __future__ import annotations

import sqlite3

from . import config


def conectar() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def marcar(conn: sqlite3.Connection, item_id: int, estado: str, erro: str | None = None) -> None:
    conn.execute(
        """UPDATE itens SET transcricao_estado = ?, transcricao_erro = ?,
                            tentativas = tentativas + ?,
                            transcrito_em = CASE WHEN ? = 'pronto' THEN datetime('now') ELSE transcrito_em END
            WHERE id = ?""",
        (estado, erro, 1 if estado == "erro" else 0, estado, item_id))
    conn.commit()


def registrar(conn: sqlite3.Connection, nivel: str, origem: str, mensagem: str) -> None:
    conn.execute("INSERT INTO eventos (nivel, origem, mensagem) VALUES (?, ?, ?)",
                 (nivel, origem, mensagem))
    conn.commit()


def pendentes(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT id, rel_path, titulo FROM itens
            WHERE tipo = 'video' AND transcricao_estado = 'pendente'
            ORDER BY id"""
    ).fetchall()
