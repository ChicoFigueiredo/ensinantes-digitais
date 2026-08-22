import json
import sqlite3

import pytest

from ensinantes.comparar import (
    avaliar,
    comparar_e_gravar,
    divergente,
    normalizar,
    relatorio_divergencias,
    similaridade,
)


def test_normalizar_tira_pontuacao_e_caixa():
    assert normalizar("Olá, mundo! Tudo BEM?") == ["olá", "mundo", "tudo", "bem"]


def test_normalizar_colapsa_espaco_e_quebra_de_linha():
    assert normalizar("um\n\n dois \t três") == ["um", "dois", "três"]


def test_similaridade_de_texto_identico_e_um():
    assert similaridade("a b c d", "a b c d") == 1.0


def test_similaridade_ignora_pontuacao():
    assert similaridade("Bom dia, turma.", "bom dia turma") == 1.0


def test_similaridade_de_textos_diferentes_e_baixa():
    assert similaridade("gato cachorro pássaro", "avião navio trem") < 0.3


def test_avaliar_sem_texto_antigo_devolve_none():
    # 159 dos 232 vídeos nunca tiveram legenda: não há com o que comparar.
    assert avaliar("qualquer coisa", None) is None
    assert avaliar("qualquer coisa", "   ") is None


def test_avaliar_conta_palavras_dos_dois_lados():
    c = avaliar("um dois três quatro", "um dois três")
    assert c["palavras_nova"] == 4
    assert c["palavras_antiga"] == 3
    assert 0.0 <= c["similaridade"] <= 1.0


def test_avaliar_conta_palavras_unicas_da_antiga():
    # Caso real do acervo: 8 blocos idênticos de "Terima kasih telah menonton"
    # na abertura silenciosa. Sem esse sinal, o relatório mostra só a contagem
    # total e não distingue transcrição curta de alucinação repetida.
    antiga = " ".join(["Terima kasih telah menonton"] * 8)
    c = avaliar("qualquer texto novo aqui", antiga)
    assert c["palavras_antiga"] == 32
    assert c["palavras_unicas_antiga"] == 4


def test_divergente_quando_a_nova_encolheu_demais():
    # 80 palavras contra 100 = 0,80, abaixo do limiar de 0,85.
    c = {"palavras_nova": 80, "palavras_antiga": 100, "similaridade": 0.99}
    assert divergente(c) is True


def test_nao_divergente_quando_encolheu_pouco():
    c = {"palavras_nova": 95, "palavras_antiga": 100, "similaridade": 0.99}
    assert divergente(c) is False


def test_divergente_quando_a_similaridade_cai():
    c = {"palavras_nova": 100, "palavras_antiga": 100, "similaridade": 0.60}
    assert divergente(c) is True


def test_transcricao_que_CRESCEU_nao_e_divergente_por_tamanho():
    # A nova pegar mais fala que a antiga é o resultado desejado, não um defeito.
    # similaridade 0,70 < LIMIAR_SIMILARIDADE (0,75): ainda divergente, mas pela
    # similaridade, não pelo tamanho (o tamanho aqui cresceu, não encolheu).
    c = {"palavras_nova": 300, "palavras_antiga": 100, "similaridade": 0.70}
    assert divergente(c) is True   # ainda divergente pela similaridade
    c2 = {"palavras_nova": 300, "palavras_antiga": 100, "similaridade": 0.95}
    assert divergente(c2) is False


def test_avaliar_detecta_o_caso_que_mais_importa():
    """O modo de falha real: o Whisper corta no meio e devolve um pedaço."""
    antiga = " ".join(f"palavra{i}" for i in range(1000))
    nova = " ".join(f"palavra{i}" for i in range(200))
    c = avaliar(nova, antiga)
    assert divergente(c) is True


@pytest.fixture
def conn():
    """Banco em memória com o mínimo do esquema real (`itens`, `eventos`)."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript("""
        CREATE TABLE itens (
            id INTEGER PRIMARY KEY,
            titulo TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            comparacao TEXT
        );
        CREATE TABLE eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nivel TEXT NOT NULL,
            origem TEXT NOT NULL,
            mensagem TEXT NOT NULL
        );
    """)
    return c


def test_comparar_e_gravar_grava_json_e_nao_registra_evento_quando_ok(conn):
    conn.execute("INSERT INTO itens (id, titulo, rel_path) VALUES (1, 'Aula 1', 'a/1.mp4')")
    conn.commit()
    item = conn.execute("SELECT * FROM itens WHERE id = 1").fetchone()

    comparar_e_gravar(conn, item, "um dois três quatro", "um dois três quatro")

    linha = conn.execute("SELECT comparacao FROM itens WHERE id = 1").fetchone()
    comp = json.loads(linha["comparacao"])
    assert comp["palavras_nova"] == 4
    assert comp["palavras_antiga"] == 4
    assert comp["similaridade"] == 1.0
    assert conn.execute("SELECT COUNT(*) n FROM eventos").fetchone()["n"] == 0


def test_comparar_e_gravar_registra_evento_quando_diverge(conn):
    conn.execute("INSERT INTO itens (id, titulo, rel_path) VALUES (2, 'Aula 2', 'a/2.mp4')")
    conn.commit()
    item = conn.execute("SELECT * FROM itens WHERE id = 2").fetchone()

    antiga = " ".join(f"palavra{i}" for i in range(1000))
    nova = " ".join(f"palavra{i}" for i in range(200))
    comparar_e_gravar(conn, item, nova, antiga)

    linha = conn.execute("SELECT comparacao FROM itens WHERE id = 2").fetchone()
    assert linha["comparacao"] is not None
    eventos = conn.execute("SELECT * FROM eventos").fetchall()
    assert len(eventos) == 1
    assert eventos[0]["origem"] == "comparar"
    assert "Aula 2" in eventos[0]["mensagem"]


def test_comparar_e_gravar_grava_null_quando_nao_ha_antiga(conn):
    conn.execute("INSERT INTO itens (id, titulo, rel_path) VALUES (3, 'Aula 3', 'a/3.mp4')")
    conn.commit()
    item = conn.execute("SELECT * FROM itens WHERE id = 3").fetchone()

    comparar_e_gravar(conn, item, "qualquer coisa", None)

    linha = conn.execute("SELECT comparacao FROM itens WHERE id = 3").fetchone()
    assert linha["comparacao"] is None


def test_relatorio_divergencias_lista_so_os_divergentes_ordenados(conn):
    # item 1: ok, não divergente
    conn.execute("INSERT INTO itens (id, titulo, rel_path, comparacao) VALUES "
                 "(1, 'Aula OK', 'a/1.mp4', ?)",
                 (json.dumps({"palavras_nova": 100, "palavras_antiga": 100,
                              "palavras_unicas_antiga": 50, "similaridade": 0.99}),))
    # item 2: divergente, similaridade 0.50
    conn.execute("INSERT INTO itens (id, titulo, rel_path, comparacao) VALUES "
                 "(2, 'Aula Pior', 'a/2.mp4', ?)",
                 (json.dumps({"palavras_nova": 50, "palavras_antiga": 100,
                              "palavras_unicas_antiga": 4, "similaridade": 0.50}),))
    # item 3: divergente, similaridade 0.60 — deve vir depois do item 2 na ordenação
    conn.execute("INSERT INTO itens (id, titulo, rel_path, comparacao) VALUES "
                 "(3, 'Aula Media', 'a/3.mp4', ?)",
                 (json.dumps({"palavras_nova": 50, "palavras_antiga": 100,
                              "palavras_unicas_antiga": 4, "similaridade": 0.60}),))
    # item 4: nunca comparado (sem legenda anterior) — não deve entrar no relatório
    conn.execute("INSERT INTO itens (id, titulo, rel_path, comparacao) VALUES "
                 "(4, 'Aula Sem Antiga', 'a/4.mp4', NULL)")
    conn.commit()

    texto = relatorio_divergencias(conn)

    assert "3 vídeos comparados" in texto
    assert "**2 divergentes**" in texto
    assert "Aula Pior" in texto
    assert "Aula Media" in texto
    assert "Aula OK" not in texto
    assert "Aula Sem Antiga" not in texto
    # a mais divergente (menor similaridade) vem primeiro
    assert texto.index("Aula Pior") < texto.index("Aula Media")


def test_relatorio_divergencias_nao_quebra_com_json_malformado(conn):
    # Uma linha com `comparacao` ilegível não pode calar o relatório inteiro
    # — ele existe justamente para nada passar em silêncio.
    conn.execute("INSERT INTO itens (id, titulo, rel_path, comparacao) VALUES "
                 "(1, 'Aula Ruim', 'a/1.mp4', 'isto não é json')")
    conn.execute("INSERT INTO itens (id, titulo, rel_path, comparacao) VALUES "
                 "(2, 'Aula Divergente', 'a/2.mp4', ?)",
                 (json.dumps({"palavras_nova": 50, "palavras_antiga": 100,
                              "palavras_unicas_antiga": 4, "similaridade": 0.50}),))
    conn.commit()

    texto = relatorio_divergencias(conn)

    assert "Aula Divergente" in texto
    assert "1 com `comparacao` ilegível" in texto
    assert "Aula Ruim" in texto
