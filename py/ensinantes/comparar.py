"""A transcrição nova, medida contra a que existia.

Existe porque "reprocessar para garantir que esteja correto e completo" só
significa alguma coisa se houver medida. O modo de falha real do Whisper não é
errar palavra — é PARAR no meio e devolver um pedaço convincente. Uma
transcrição truncada parece perfeita: as frases que sobraram estão certas.

Por isso a checagem principal é de TAMANHO, e não de conteúdo.
"""
from __future__ import annotations

import json
import re
import sqlite3
from difflib import SequenceMatcher

from . import config

_NAO_PALAVRA = re.compile(r"[^\w\s]", re.UNICODE)


def normalizar(texto: str) -> list[str]:
    """Minúsculas, sem pontuação, espaço colapsado."""
    return _NAO_PALAVRA.sub(" ", texto.lower()).split()


def similaridade(a: str, b: str) -> float:
    """0 a 1 sobre a sequência de palavras normalizadas."""
    pa, pb = normalizar(a), normalizar(b)
    if not pa and not pb:
        return 1.0
    if not pa or not pb:
        return 0.0
    return SequenceMatcher(None, pa, pb, autojunk=False).ratio()


def avaliar(nova: str, antiga: str | None) -> dict | None:
    """None quando não há transcrição anterior — 159 vídeos estão nesse caso."""
    if not antiga or not antiga.strip():
        return None
    return {
        "palavras_nova": len(normalizar(nova)),
        "palavras_antiga": len(normalizar(antiga)),
        "palavras_unicas_antiga": len(set(normalizar(antiga))),
        "similaridade": round(similaridade(nova, antiga), 4),
    }


def divergente(comp: dict) -> bool:
    """Encolheu demais, ou mudou demais.

    Crescer NÃO é motivo de alarme por si: a passada nova com large-v3 pegando
    mais fala que uma transcrição velha é exatamente o resultado desejado. Só
    a similaridade baixa denuncia que o conteúdo mudou de verdade.
    """
    antiga = comp["palavras_antiga"]
    encolheu = antiga > 0 and comp["palavras_nova"] < antiga * config.LIMIAR_PALAVRAS
    mudou = comp["similaridade"] < config.LIMIAR_SIMILARIDADE
    return bool(encolheu or mudou)


def comparar_e_gravar(conn: sqlite3.Connection, item: sqlite3.Row,
                      nova: str, antiga: str | None) -> None:
    comp = avaliar(nova, antiga)
    conn.execute("UPDATE itens SET comparacao = ? WHERE id = ?",
                 (json.dumps(comp, ensure_ascii=False) if comp else None, item["id"]))
    conn.commit()

    if comp and divergente(comp):
        conn.execute(
            "INSERT INTO eventos (nivel, origem, mensagem) VALUES ('erro', 'comparar', ?)",
            (f"{item['titulo']}: {comp['palavras_nova']} palavras contra "
             f"{comp['palavras_antiga']}, similaridade {comp['similaridade']}",))
        conn.commit()


def relatorio_divergencias(conn: sqlite3.Connection) -> str:
    linhas = conn.execute(
        "SELECT titulo, rel_path, comparacao FROM itens WHERE comparacao IS NOT NULL"
    ).fetchall()

    suspeitas = []
    for linha in linhas:
        comp = json.loads(linha["comparacao"])
        if divergente(comp):
            suspeitas.append((linha, comp))

    suspeitas.sort(key=lambda x: x[1]["similaridade"])

    corpo = "\n".join(
        f"| {l['titulo']} | {c['palavras_nova']} | {c['palavras_antiga']} | "
        f"{c['palavras_unicas_antiga']} | {c['similaridade']:.2f} | `{l['rel_path']}` |"
        for l, c in suspeitas)

    return f"""# Transcrições divergentes

Comparação da transcrição nova contra a guardada em `{config.PASTA_ANTIGAS}/`.
Uma linha aqui **não** significa que a nova está errada — significa que vale
abrir as duas e olhar. Poucas palavras únicas na antiga (última coluna) é sinal
de alucinação do Whisper sobre trecho silencioso, não de transcrição legítima
curta.

Critério: menos de {config.LIMIAR_PALAVRAS:.0%} das palavras da anterior, **ou**
similaridade abaixo de {config.LIMIAR_SIMILARIDADE:.2f}.

- {len(linhas)} vídeos comparados
- **{len(suspeitas)} divergentes**

| Aula | Palavras (nova) | Palavras (antiga) | Únicas (antiga) | Similaridade | Arquivo |
|---|---:|---:|---:|---:|---|
{corpo}
"""
