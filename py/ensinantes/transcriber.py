"""Transcrição por GPU.

Diferente do focus-scrap, aqui o Whisper é o caminho PADRÃO, não o fallback:
não há legenda de produtor para aproveitar. Dos 231 vídeos do acervo, 159 nunca
tiveram transcrição nenhuma, e os 72 que têm vieram de gerações diferentes ao
longo de dois anos. O objetivo é uma passada uniforme com large-v3.

Antes de escrever, a legenda vigente vai para `_transcricoes.antigas/`. A pasta
é nova de propósito: `_antigo/` já existe no acervo e guarda uma AULA aposentada
inteira, não legendas — misturar as duas coisas perderia as duas.
"""
from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from . import config, db

_LINHA_INDICE = re.compile(r"^\d+$")
_LINHA_METADADO_VTT = re.compile(r"^(WEBVTT|X-TIMESTAMP-MAP|NOTE)\b", re.IGNORECASE)


def _carregar_modelo():
    """Importado em tempo de uso: sem o extra `gpu` isto falha, e falhar aqui é
    melhor do que impedir o resto do worker de rodar."""
    from faster_whisper import BatchedInferencePipeline, WhisperModel

    modelo = WhisperModel(
        config.WHISPER_MODELO, device="cuda", compute_type=config.WHISPER_COMPUTE)
    return BatchedInferencePipeline(model=modelo)


def hms(segundos: float, virgula: bool = True) -> str:
    """Segundos → `HH:MM:SS,mmm` (SRT) ou `HH:MM:SS.mmm` (fala cronometrada).

    Converte para milissegundos inteiros ANTES de separar as unidades. Separar
    primeiro e arredondar a fração depois faz 59,9996 s virar `00:00:59,1000`
    — milissegundo de quatro dígitos, que não é SRT válido. Com 231 vídeos e
    milhares de trechos cada, essa borda aparece.
    """
    total = round(max(0.0, segundos) * 1000)
    h, resto = divmod(total, 3_600_000)
    m, resto = divmod(resto, 60_000)
    s, milis = divmod(resto, 1000)
    sep = "," if virgula else "."
    return f"{int(h):02}:{int(m):02}:{int(s):02}{sep}{int(milis):03}"


def escrever_saidas(trechos: list, destino_base: Path) -> None:
    """Os três formatos que o acervo usa, a partir dos trechos do Whisper."""
    srt, cron, plano = [], [], []
    for i, t in enumerate(trechos, 1):
        texto = t.text.strip()
        srt.append(f"{i}\n{hms(t.start)} --> {hms(t.end)}\n{texto}\n")
        cron.append(f"[{hms(t.start, False)}] {texto}")
        plano.append(texto)

    destino_base.with_suffix(".srt").write_text("\n".join(srt), encoding="utf-8")
    destino_base.with_name(destino_base.stem + "-Fala.Cronometrada.txt").write_text(
        "\n".join(cron), encoding="utf-8")
    destino_base.with_suffix(".txt").write_text(" ".join(plano), encoding="utf-8")


def guardar_antigas(video: Path) -> list[Path]:
    """Move os sidecars existentes para `_transcricoes.antigas/`.

    O vídeo NUNCA é movido. E um backup que já exista não é sobrescrito: a
    primeira geração guardada é a referência original, e é contra ela que a
    comparação faz sentido. Uma segunda passada guarda como `.srt.2`, `.srt.3`.
    """
    pasta = video.parent / config.PASTA_ANTIGAS
    movidos: list[Path] = []

    for sufixo in config.SUFIXOS:
        origem = (video.with_name(video.stem + sufixo) if sufixo.startswith("-")
                  else video.with_suffix(sufixo))
        if not origem.exists():
            continue

        pasta.mkdir(exist_ok=True)
        destino = pasta / origem.name
        if destino.exists():
            n = 2
            while (pasta / f"{origem.name}.{n}").exists():
                n += 1
            destino = pasta / f"{origem.name}.{n}"

        origem.rename(destino)
        movidos.append(destino)

    return movidos


def _texto_de_srt(conteudo: str) -> str:
    """As falas de um `.srt` — ou de um `.vtt` salvo com extensão `.srt`, o
    formato real de parte das legendas legadas do acervo (cabeçalho `WEBVTT`,
    timestamp com ponto em vez de vírgula) — sem índice, timestamp nem
    cabeçalho."""
    falas = []
    for linha in conteudo.splitlines():
        linha = linha.strip()
        if not linha:
            continue
        if "-->" in linha or _LINHA_INDICE.match(linha) or _LINHA_METADADO_VTT.match(linha):
            continue
        # SRT/VTT às vezes trazem <i>, <b>, <font color=...>. Sem tirar, o
        # `normalizar` de comparar.py os transforma em tokens "i"/"b"/"font"
        # que nunca batem com a transcrição nova — similaridade cai por
        # artefato de formatação, e um vídeo bem transcrito vira divergência
        # falsa. Nenhum arquivo do acervo tem tag hoje; isto é defesa.
        linha = re.sub(r"<[^>]+>", "", linha).strip()
        if linha:
            falas.append(linha)
    return " ".join(falas)


def texto_antigo(video: Path) -> str | None:
    """O texto guardado no backup — insumo da comparação.

    Prefere o `.txt` (produzido por uma passada anterior deste próprio
    worker). A legenda ORIGINAL do acervo, porém, só existe como `.srt` —
    nenhum vídeo tinha `.txt` antes desta tarefa — então cai para extrair o
    texto do `.srt` guardado.
    """
    pasta = video.parent / config.PASTA_ANTIGAS
    txt = pasta / (video.stem + ".txt")
    if txt.exists():
        return txt.read_text(encoding="utf-8")

    srt = pasta / (video.stem + ".srt")
    if srt.exists():
        return _texto_de_srt(srt.read_text(encoding="utf-8"))

    return None


def processar(conn: sqlite3.Connection, item: sqlite3.Row, pipeline) -> None:
    video = config.ACERVO / item["rel_path"]
    if not video.exists():
        db.marcar(conn, item["id"], "erro", "vídeo não está no disco")
        db.registrar(conn, "erro", "transcriber", f"{item['rel_path']}: vídeo não está no disco")
        return

    db.marcar(conn, item["id"], "rodando")
    try:
        guardar_antigas(video)
        antigo = texto_antigo(video)

        # vad_filter=True suprime alucinação do Whisper sobre trecho silencioso.
        # Dado real do acervo: em "00.01-Descobrindo Qual é a Tua Obra" os 8
        # primeiros blocos (~4 min de vinheta silenciosa) saíram todos como
        # "Terima kasih telah menonton" — indonésio para "obrigado por assistir",
        # a alucinação clássica do Whisper sobre silêncio. Em "Aula 3 - Atraindo
        # Alunos", 1 bloco (o 2660). Não tire este filtro achando que é enfeite.
        trechos, _info = pipeline.transcribe(
            str(video),
            language=config.WHISPER_IDIOMA,
            beam_size=config.WHISPER_BEAM,
            batch_size=config.WHISPER_BATCH,
            vad_filter=True,
        )
        trechos = list(trechos)
        escrever_saidas(trechos, video)

        from .comparar import comparar_e_gravar
        comparar_e_gravar(conn, item, " ".join(t.text.strip() for t in trechos), antigo)

        db.marcar(conn, item["id"], "pronto")
        db.registrar(conn, "info", "transcriber", f"transcreveu {video.name}")
    except Exception as e:  # noqa: BLE001 — o worker não pode morrer por um vídeo
        db.marcar(conn, item["id"], "erro", str(e)[:400])
        db.registrar(conn, "erro", "transcriber", f"{video.name}: {e}")
