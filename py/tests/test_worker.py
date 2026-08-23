"""A linha final da fila.

Achado 6 da revisão final: o worker imprimia "72 comparados · 1 divergentes"
com os números reais do acervo, tendo `comparar.plural` importado logo acima e
usado corretamente por `comparar.main()`.
"""
from __future__ import annotations

from ensinantes.worker import resumo


def test_resumo_no_singular():
    assert resumo(1, 1, "relatorios/divergencias.md") == (
        "1 vídeo comparado · 1 divergente → relatorios/divergencias.md")


def test_resumo_com_os_numeros_de_hoje():
    # 72 comparações no banco, 1 divergente: o caso que denunciou o defeito.
    assert resumo(72, 1, "x").startswith("72 vídeos comparados · 1 divergente →")


def test_resumo_no_plural_e_no_zero():
    assert resumo(2, 2, "x") == "2 vídeos comparados · 2 divergentes → x"
    assert resumo(0, 0, "x") == "0 vídeos comparados · 0 divergentes → x"
