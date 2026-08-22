"""O laço da fila. `uv run python -m ensinantes.worker`

O modelo é carregado UMA vez e reusado: são ~10 s de carga e 2,5 GB de VRAM.
Recarregar por vídeo dobraria o tempo total sem ganho nenhum.
"""
from __future__ import annotations

import sys
import time

from . import db
from .transcriber import _carregar_modelo, processar


def main() -> int:
    conn = db.conectar()

    # 'rodando' depois de um reinício é processo morto, não trabalho em curso.
    n = conn.execute(
        "UPDATE itens SET transcricao_estado = 'pendente' WHERE transcricao_estado = 'rodando'").rowcount
    conn.commit()
    if n:
        print(f"destravados {n} itens presos em 'rodando'")

    fila = db.pendentes(conn)
    if not fila:
        print("nada pendente")
        return 0

    print(f"{len(fila)} vídeos na fila — carregando o modelo…")
    try:
        pipeline = _carregar_modelo()
    except ImportError as e:
        print(f"faster-whisper indisponível: {e}", file=sys.stderr)
        print("instale com: uv sync --extra gpu", file=sys.stderr)
        return 1

    inicio = time.monotonic()
    for i, item in enumerate(fila, 1):
        print(f"[{i}/{len(fila)}] {item['titulo']}", flush=True)
        processar(conn, item, pipeline)

    print(f"fim: {len(fila)} vídeos em {(time.monotonic() - inicio) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
