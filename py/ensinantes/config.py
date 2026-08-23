"""Espelho Python do .env. Toda variável nova entra aqui E em src/config.ts."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]


def _ler_env() -> None:
    """Lê o .env na mão — o Bun faz isso sozinho, o Python não."""
    arq = BASE_DIR / ".env"
    if not arq.exists():
        return
    for linha in arq.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip())


_ler_env()

ACERVO = Path(os.environ.get("ED_ACERVO", "./acervo"))
if not ACERVO.is_absolute():
    ACERVO = (BASE_DIR / ACERVO).resolve()

DB_PATH = BASE_DIR / "ensinantes.db"
RELATORIOS = BASE_DIR / "relatorios"

WHISPER_MODELO = os.environ.get("ED_WHISPER_MODELO", "large-v3")
WHISPER_COMPUTE = os.environ.get("ED_WHISPER_COMPUTE", "float16")
WHISPER_BATCH = int(os.environ.get("ED_WHISPER_BATCH", "16"))
WHISPER_IDIOMA = "pt"
WHISPER_BEAM = 5

PASTA_ANTIGAS = "_transcricoes.antigas"

LIMIAR_PALAVRAS = float(os.environ.get("ED_DIVERGENCIA_PALAVRAS", "0.85"))
LIMIAR_SIMILARIDADE = float(os.environ.get("ED_DIVERGENCIA_SIMILARIDADE", "0.75"))

#: Os quatro sidecars que uma transcrição produz ou substitui.
SUFIXOS = (".srt", ".txt", ".sub", "-Fala.Cronometrada.txt")
