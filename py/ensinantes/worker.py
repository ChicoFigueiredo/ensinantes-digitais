"""O laço da fila. `uv run python -m ensinantes.worker`

O modelo é carregado UMA vez e reusado: são ~10 s de carga e 2,5 GB de VRAM.
Recarregar por vídeo dobraria o tempo total sem ganho nenhum.
"""
from __future__ import annotations

import sys
import time

from . import comparar, db
from .transcriber import _carregar_modelo, processar


def resumo(comparados: int, divergentes: int, caminho) -> str:
    """A última linha da fila, com o plural certo.

    `plural` vem de `comparar` — a mesma função que o relatório usa, e a mesma
    que `comparar.main()` já usava. Com os números reais do acervo (72
    comparados, 1 divergente) esta linha imprimia "1 divergentes".
    """
    return (f"{comparar.plural(comparados, 'vídeo comparado', 'vídeos comparados')} · "
            f"{comparar.plural(divergentes, 'divergente', 'divergentes')} → {caminho}")


def main() -> int:
    conn = db.conectar()

    # 'rodando' depois de um reinício é processo morto, não trabalho em curso.
    n = conn.execute(
        "UPDATE itens SET transcricao_estado = 'pendente' WHERE transcricao_estado = 'rodando'").rowcount
    conn.commit()
    if n:
        print(f"destravados {comparar.plural(n, 'item preso', 'itens presos')} em 'rodando'")

    fila = db.pendentes(conn)
    if not fila:
        print("nada pendente")
        return 0

    print(f"{comparar.plural(len(fila), 'vídeo', 'vídeos')} na fila — carregando o modelo…")
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

    print(f"fim: {comparar.plural(len(fila), 'vídeo', 'vídeos')} em "
          f"{(time.monotonic() - inicio) / 60:.1f} min")

    # O relatório de divergências é escrito AQUI, e não à mão depois: cada
    # passada muda as comparações, e um relatório que só nasce quando alguém
    # lembra de rodá-lo não vale como aviso.
    caminho = comparar.escrever(conn)
    comparados, divergentes = comparar.contar(conn)
    print(resumo(comparados, divergentes, caminho))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
