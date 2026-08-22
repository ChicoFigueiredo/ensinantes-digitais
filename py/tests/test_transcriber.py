from pathlib import Path

import pytest

from ensinantes import config
from ensinantes.transcriber import escrever_saidas, guardar_antigas, hms, texto_antigo


class Trecho:
    def __init__(self, start, end, text):
        self.start, self.end, self.text = start, end, text


def test_hms_formata_srt_e_cronometrada():
    assert hms(3661.5) == "01:01:01,500"
    assert hms(3661.5, virgula=False) == "01:01:01.500"
    assert hms(0) == "00:00:00,000"
    assert hms(-5) == "00:00:00,000"


def test_hms_rola_para_o_segundo_seguinte_em_vez_de_gerar_4_digitos():
    # Separar segundo e fração antes de arredondar produzia "00:00:59,1000",
    # que não é SRT válido. Os tempos do faster-whisper são float.
    assert hms(59.9996) == "00:01:00,000"
    assert hms(3599.9996) == "01:00:00,000"
    assert hms(0.9999) == "00:00:01,000"


def test_hms_nunca_produz_milissegundo_de_quatro_digitos():
    import random
    random.seed(42)   # determinístico: um teste que falha às vezes não serve
    for _ in range(2000):
        t = random.uniform(0, 4000)
        ms = hms(t).split(",")[1]
        assert len(ms) == 3, f"{t} -> {hms(t)}"


def test_escrever_saidas_produz_os_tres_formatos(tmp_path: Path):
    base = tmp_path / "Aula"
    escrever_saidas([Trecho(0.0, 2.0, " oi "), Trecho(2.0, 4.0, "tudo bem")], base)

    srt = (tmp_path / "Aula.srt").read_text(encoding="utf-8")
    assert "1\n00:00:00,000 --> 00:00:02,000\noi" in srt
    assert "2\n00:00:02,000 --> 00:00:04,000\ntudo bem" in srt

    cron = (tmp_path / "Aula-Fala.Cronometrada.txt").read_text(encoding="utf-8")
    assert cron.startswith("[00:00:00.000] oi")

    assert (tmp_path / "Aula.txt").read_text(encoding="utf-8") == "oi tudo bem"


def test_guardar_antigas_move_os_quatro_sidecars(tmp_path: Path):
    video = tmp_path / "Aula.mp4"
    video.write_text("v")
    for nome in ("Aula.srt", "Aula.txt", "Aula.sub", "Aula-Fala.Cronometrada.txt"):
        (tmp_path / nome).write_text("velho")

    movidos = guardar_antigas(video)

    guardadas = tmp_path / config.PASTA_ANTIGAS
    assert len(movidos) == 4
    assert sorted(p.name for p in guardadas.iterdir()) == [
        "Aula-Fala.Cronometrada.txt", "Aula.srt", "Aula.sub", "Aula.txt"]
    assert not (tmp_path / "Aula.srt").exists()
    assert video.exists(), "o vídeo NÃO pode ser movido"


def test_guardar_antigas_nao_reclama_quando_nao_ha_nada(tmp_path: Path):
    video = tmp_path / "Sozinha.mp4"
    video.write_text("v")
    assert guardar_antigas(video) == []


def test_guardar_antigas_nao_sobrescreve_backup_anterior(tmp_path: Path):
    video = tmp_path / "Aula.mp4"
    video.write_text("v")
    guardadas = tmp_path / config.PASTA_ANTIGAS
    guardadas.mkdir()
    (guardadas / "Aula.srt").write_text("primeira geração")
    (tmp_path / "Aula.srt").write_text("segunda geração")

    guardar_antigas(video)

    # A primeira geração é a referência original — ela não pode ser perdida.
    assert (guardadas / "Aula.srt").read_text(encoding="utf-8") == "primeira geração"
    assert any(p.name.startswith("Aula.srt.") for p in guardadas.iterdir())


def test_texto_antigo_prefere_txt_quando_existe(tmp_path: Path):
    video = tmp_path / "Aula.mp4"
    guardadas = tmp_path / config.PASTA_ANTIGAS
    guardadas.mkdir()
    (guardadas / "Aula.txt").write_text("texto plano guardado")
    (guardadas / "Aula.srt").write_text("1\n00:00:00,000 --> 00:00:01,000\noutro texto\n")

    assert texto_antigo(video) == "texto plano guardado"


def test_texto_antigo_extrai_do_srt_quando_nao_ha_txt(tmp_path: Path):
    # Nenhuma legenda original do acervo tinha `.txt` — só `.srt`. Sem esse
    # fallback, texto_antigo() devolve None para todo vídeo com legenda
    # anterior, e a comparação nunca roda.
    video = tmp_path / "Aula.mp4"
    guardadas = tmp_path / config.PASTA_ANTIGAS
    guardadas.mkdir()
    (guardadas / "Aula.srt").write_text(
        "1\n00:00:00,000 --> 00:00:04,000\nolá mundo\n\n"
        "2\n00:00:04,000 --> 00:00:08,000\ntudo bem\n")

    assert texto_antigo(video) == "olá mundo tudo bem"


def test_texto_antigo_extrai_de_vtt_salvo_como_srt(tmp_path: Path):
    # Caso real do acervo: `.srt` com conteúdo WEBVTT dentro (cabeçalho
    # `WEBVTT`, `X-TIMESTAMP-MAP`, timestamp com ponto em vez de vírgula).
    video = tmp_path / "Aula.mp4"
    guardadas = tmp_path / config.PASTA_ANTIGAS
    guardadas.mkdir()
    (guardadas / "Aula.srt").write_text(
        "WEBVTT\n"
        "X-TIMESTAMP-MAP=MPEGTS:132006,LOCAL:00:00:00.000\n\n"
        "1\n00:00:00.700 --> 00:00:04.700\nolá querido\n\n"
        "2\n00:00:04.700 --> 00:00:09.300\ntudo bem\n")

    assert texto_antigo(video) == "olá querido tudo bem"


def test_texto_antigo_devolve_none_sem_backup(tmp_path: Path):
    assert texto_antigo(tmp_path / "Sozinha.mp4") is None
