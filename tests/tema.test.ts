import { expect, test } from "bun:test";

import { ADMIN_JS } from "../src/ui/admin.ts";
import { CURSO_JS } from "../src/ui/curso.ts";
import { HOME_JS, anuncioDoTema, chipDeTema } from "../src/ui/home.ts";
import { MATERIAIS_JS } from "../src/ui/materiais.ts";
import { PAGINA } from "../src/ui/pagina.ts";
import { PLAYER_JS } from "../src/ui/player.ts";
import { TRANSCRICAO_JS } from "../src/ui/transcricao.ts";
import { CHAVE_TEMA, CSS, CSS_CENA } from "../src/ui/tema.ts";

/**
 * Os dois temas: os tokens, o contraste, o que NÃO segue o tema e o chip.
 *
 * O teste que mais importa aqui é o de contraste, e ele não confere uma lista
 * de cores escrita à mão: lê os tokens do CSS que a página leva e MEDE. Trocar
 * um tom por outro mais bonito e menos legível quebra o teste, em vez de
 * quebrar a leitura de alguém meses depois.
 */

// --- WCAG 2.1, contraste ----------------------------------------------------

/** Luminância relativa de um #rrggbb, pela fórmula da WCAG. */
function luminancia(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** Razão de contraste entre duas cores, de 1:1 a 21:1. */
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

test("a régua de contraste é a da WCAG, e não uma invenção deste arquivo", () => {
  // Os dois extremos, que qualquer implementação certa acerta.
  expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 2);
  expect(contraste("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
});

// --- os tokens, lidos do CSS que a página leva ------------------------------

/** Os `--tokens` de um bloco do CSS, pelo seletor. */
function tokensDe(seletor: string): Record<string, string> {
  const i = CSS.indexOf(`${seletor} {`);
  expect(i).toBeGreaterThan(-1);
  const corpo = CSS.slice(i, CSS.indexOf("}", i));
  const tokens: Record<string, string> = {};
  for (const m of corpo.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) tokens[m[1]!] = m[2]!.trim();
  return tokens;
}

const ESCURO = tokensDe(":root");
const CLARO = tokensDe('[data-tema="claro"]');

const PALETA = ["--fundo", "--superficie", "--elevada", "--borda", "--texto", "--secundario",
  "--destaque", "--verde"] as const;

test("o escuro continua sendo exatamente o que era, valor por valor", () => {
  expect(ESCURO["--fundo"]).toBe("#0e1013");
  expect(ESCURO["--superficie"]).toBe("#16191f");
  expect(ESCURO["--elevada"]).toBe("#1e222a");
  expect(ESCURO["--borda"]).toBe("#2a2f3a");
  expect(ESCURO["--texto"]).toBe("#e8eaed");
  expect(ESCURO["--secundario"]).toBe("#9aa3af");
  expect(ESCURO["--destaque"]).toBe("#e8963c");
  expect(ESCURO["--verde"]).toBe("#4ea672");
});

test("o claro redefine a paleta INTEIRA — token que falta cai no escuro sem avisar", () => {
  for (const t of PALETA) expect(CLARO[t]).toMatch(/^#[0-9a-f]{6}$/);
});

// 2a: nome de cor que não é a cor apodrece. No claro o token guarda um ocre.
test("não sobrou --ambar em lugar nenhum da página", () => {
  expect(PAGINA).not.toContain("--ambar");
});

// --- contraste: requisito, não gosto ----------------------------------------

test("texto e secundário passam em AA (4,5:1) sobre o fundo, NOS DOIS TEMAS", () => {
  for (const [nome, t] of [["escuro", ESCURO], ["claro", CLARO]] as const) {
    // Medido hoje — escuro: 15,81:1 e 7,47:1; claro: 12,40:1 e 4,87:1.
    expect({ tema: nome, passa: contraste(t["--texto"]!, t["--fundo"]!) >= 4.5 })
      .toEqual({ tema: nome, passa: true });
    expect({ tema: nome, passa: contraste(t["--secundario"]!, t["--fundo"]!) >= 4.5 })
      .toEqual({ tema: nome, passa: true });
  }
});

test("o destaque também passa em AA: ele é TEXTO no selo, no trecho corrente e nos links", () => {
  for (const t of [ESCURO, CLARO]) {
    expect(contraste(t["--destaque"]!, t["--fundo"]!)).toBeGreaterThanOrEqual(4.5);
  }
});

test("texto e secundário passam em AA sobre o cartão, e não só sobre o fundo", () => {
  for (const t of [ESCURO, CLARO]) {
    expect(contraste(t["--texto"]!, t["--superficie"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t["--secundario"]!, t["--superficie"]!)).toBeGreaterThanOrEqual(4.5);
  }
});

// A régua vale sobre TODA superfície onde a cor vira texto, e não só sobre o
// fundo e o cartão. Foi exatamente aqui que passou um defeito: o selo (c)/(p)
// do cabeçalho tem `background: var(--elevada)`, que é mais escura que o fundo,
// e no tema claro `--destaque` dava 4,05:1 e `--secundario` 4,34:1 ali —
// reprovados — enquanto a conferência contra o fundo dizia que estava tudo bem.
// Medir pelo PIOR fundo é o que impede a próxima paleta de repetir isso.
test("texto, secundário e destaque passam em AA sobre a ELEVADA, o pior fundo", () => {
  for (const [nome, t] of [["escuro", ESCURO], ["claro", CLARO]] as const) {
    for (const token of ["--texto", "--secundario", "--destaque"] as const) {
      const r = contraste(t[token]!, t["--elevada"]!);
      expect({ tema: nome, token, passa: r >= 4.5 }).toEqual({ tema: nome, token, passa: true });
    }
  }
});

// O verde fica FORA da régua de 4,5:1, e o motivo é escrito para ninguém
// "consertar" isto depois: ele nunca é prosa. É a barra cheia e o ✓ ao lado do
// título da aula — indicador, não texto —, e para indicador a régua da WCAG é
// 3:1 (1.4.11). Medido hoje: 6,4:1 no escuro; no claro 4,3:1 sobre o fundo da
// árvore e 4,9:1 sobre o cartão.
test("o verde, que é indicador e não texto, passa com folga na régua de 3:1", () => {
  for (const t of [ESCURO, CLARO]) {
    expect(contraste(t["--verde"]!, t["--fundo"]!)).toBeGreaterThanOrEqual(3);
  }
});

// --- 2e: o que está sobre o VÍDEO não segue o tema --------------------------

/** Um bloco de regra, pelo seletor — para conferir o que ele usa. */
function regra(seletor: string): string {
  const folha = CSS + CSS_CENA;
  const i = folha.indexOf(`${seletor} {`);
  expect(i).toBeGreaterThan(-1);
  return folha.slice(i, folha.indexOf("}", i));
}

test("chip, HUD e legenda usam os tokens de vídeo, e nenhum token de tema", () => {
  // Trocar estes por --texto/--borda faria o chip virar texto escuro sobre
  // tarja escura no tema claro: sumiria em cima do vídeo, que é preto sempre.
  for (const sel of [".chip", ".cena .legenda > span", ".cena .nav button"]) {
    const bloco = regra(sel);
    expect(bloco).toContain("var(--video-");
    for (const proibido of ["var(--texto)", "var(--borda)", "var(--superficie)",
      "var(--elevada)", "var(--fundo)", "var(--destaque)"]) {
      expect(bloco).not.toContain(proibido);
    }
  }
  expect(regra(".chip.on")).toContain("var(--video-destaque)");
});

test("o tema claro NÃO redefine nenhum token de vídeo", () => {
  // A outra metade da mesma regra: não basta o chip usar --video-*; o bloco do
  // claro não pode reescrever esses tokens por baixo.
  for (const t of Object.keys(CLARO)) expect(t.startsWith("--video-")).toBe(false);
  expect(ESCURO["--video-texto"]).toBe("#e8eaed");
  expect(ESCURO["--video-fundo"]).toBe("rgba(14, 16, 19, .82)");
});

// --- 2c: a sombra, e por que ela existe só num tema -------------------------

test("sombra: nenhuma no escuro, e no claro só a dos cartões", () => {
  const sombras = [...PAGINA.matchAll(/^[^\n]*box-shadow[^\n]*$/gm)].map((m) => m[0]!.trim());
  expect(sombras).toHaveLength(2);
  // A que existe é do tema claro; a segunda é a que TIRA a sombra do cartão
  // vazio, que não é um plano acima da página.
  for (const s of sombras) expect(s.startsWith('[data-tema="claro"]')).toBe(true);
  expect(sombras.some((s) => s.includes("box-shadow: none"))).toBe(true);
});

test("a razão da sombra fica escrita, senão alguém apaga achando que é violação", () => {
  expect(CSS).toContain("SOMBRA — e por que a regra é DIFERENTE em cada tema");
});

// --- 2d: o chip, e a página que não pisca -----------------------------------

test("o rótulo do chip diz para onde o clique LEVA, não onde a tela está", () => {
  expect(anuncioDoTema("escuro")).toEqual({ rotulo: "Claro", titulo: "Mudar para o tema claro" });
  expect(anuncioDoTema("claro")).toEqual({ rotulo: "Escuro", titulo: "Mudar para o tema escuro" });
  // Valor estranho (preferência de uma versão antiga, dedo no console) é
  // tratado como escuro, que é o padrão do :root.
  expect(anuncioDoTema("roxo").rotulo).toBe("Claro");
});

test("o chip é um botão com id, rótulo e title em português", () => {
  expect(chipDeTema("escuro")).toBe(
    '<button class="tema" id="bTema" title="Mudar para o tema claro">Claro</button>');
});

test("são estas funções que vão para o navegador, não cópias manuscritas delas", () => {
  for (const f of [anuncioDoTema, chipDeTema]) expect(PAGINA).toContain(f.toString());
});

test("o chip aparece ao lado dos selos nas DUAS telas", () => {
  for (const bloco of [HOME_JS, CURSO_JS]) {
    expect(bloco).toContain("${chipDeTema(temaAtual())}${selos(");
    expect(bloco).toContain("ligarChipDeTema()");
  }
});

test("o tema é carimbado no <html> ANTES do <style> — é o que evita a piscada", () => {
  const script = PAGINA.indexOf(`localStorage.getItem('${CHAVE_TEMA}')`);
  const estilo = PAGINA.indexOf("<style>");
  expect(script).toBeGreaterThan(-1);
  expect(script).toBeLessThan(estilo);
  expect(PAGINA).toContain("document.documentElement.setAttribute('data-tema', t)");
});

test("o chip e o script anti-piscada leem a MESMA chave", () => {
  expect(CHAVE_TEMA).toBe("ed.tema");
  expect(PLAYER_JS).toContain(`tema: '${CHAVE_TEMA}'`);
});

// --- o ciclo do chip, no código que a página leva ---------------------------

const MONTAR = new Function(
  "document", "fetch", "setInterval", "addEventListener", "location", "history", "localStorage",
  `${HOME_JS}${ADMIN_JS}${PLAYER_JS}${MATERIAIS_JS}${TRANSCRICAO_JS}${CURSO_JS}
   return {
     trocarTema, temaAtual, ligarChipDeTema, aplicarPrefsDoServidor,
     set dados(x) { dados = x; },
   };`,
);

function abrirCabecalho(prefsLocais: Record<string, string> = {}) {
  const guardado = new Map<string, string>(Object.entries(prefsLocais));
  const localStorage = {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => { guardado.set(k, v); },
  };

  const bTema = { textContent: "", title: "", onclick: null as null | (() => void) };
  const html: Record<string, string> = {};
  const documento = {
    documentElement: {
      style: { setProperty: () => {} },
      setAttribute: (k: string, v: string) => { html[k] = v; },
    },
    getElementById: (id: string) => (id === "bTema" ? bTema : null),
    querySelector: () => null,
    querySelectorAll: () => [] as unknown[],
    addEventListener: () => {},
  };
  // `ok: false` deixa a fila intacta para o teste ler.
  const buscar = async () => ({ ok: false, json: async () => ({}) });

  const cliente = MONTAR(documento, buscar, () => 0, () => {},
    { hash: "" }, { replaceState: () => {} }, localStorage);
  cliente.ligarChipDeTema();

  const fila = () => JSON.parse(guardado.get("ed.fila") ?? "[]") as Record<string, string>[];
  return { cliente, bTema, html, fila, guardado };
}

test("sem preferência nenhuma, o tema é o escuro do :root", () => {
  expect(abrirCabecalho().cliente.temaAtual()).toBe("escuro");
});

test("o clique no chip troca o tema, carimba o <html> e enfileira a preferência", () => {
  const p = abrirCabecalho();
  p.bTema.onclick!();

  expect(p.cliente.temaAtual()).toBe("claro");
  expect(p.html["data-tema"]).toBe("claro");
  expect(p.guardado.get("ed.tema")).toBe("claro");
  expect(p.fila()).toEqual([{ tipo: "pref", nome: "tema", valor: "claro" }]);
  // O rótulo já anuncia a volta.
  expect(p.bTema.textContent).toBe("Escuro");
  expect(p.bTema.title).toBe("Mudar para o tema escuro");

  p.bTema.onclick!();
  expect(p.cliente.temaAtual()).toBe("escuro");
  expect(p.html["data-tema"]).toBe("escuro");
  expect(p.fila().at(-1)).toEqual({ tipo: "pref", nome: "tema", valor: "escuro" });
  expect(p.bTema.textContent).toBe("Claro");
});

// O tema do servidor chegava à tela de curso e NÃO ao cache local: `lerPref`
// acha o valor em `dados.prefs`, `aplicarPrefsDoServidor` conclui que não há o
// que gravar, e o script do topo da página — que só lê o localStorage — não
// achava nada na carga seguinte. A escolha feita no tablet valia uma pintura e
// piscava na próxima.
test("o tema vindo do servidor fica no cache local, senão a próxima carga pisca", () => {
  const p = abrirCabecalho();
  p.cliente.dados = { prefs: { tema: "claro" }, progresso: {}, notas: {} };
  p.cliente.aplicarPrefsDoServidor({ tema: "claro" });

  expect(p.guardado.get("ed.tema")).toBe("claro");
  expect(p.html["data-tema"]).toBe("claro");
  // Aplicar o que veio do servidor não devolve nada para ele.
  expect(p.fila()).toEqual([]);
});

test("a preferência gravada abre a página já no tema certo", () => {
  const p = abrirCabecalho({ "ed.tema": "claro" });
  expect(p.cliente.temaAtual()).toBe("claro");
});

// A home não tem `dados` — ela pinta a partir do `d` local de `pintarHome`. O
// chip do tema é o primeiro controle que existe nas DUAS telas, e a fila
// precisou aprender a viver sem `dados`: sem isso o clique estourava, o catch
// de `escoar` engolia, e a fila NUNCA era limpa — o mesmo lote voltando a cada
// 8 s para sempre, que é exatamente o modo de falha que esta fila existe para
// não ter.
test("trocar o tema na home não estoura, mesmo sem árvore nem `dados`", () => {
  const p = abrirCabecalho();
  expect(() => p.bTema.onclick!()).not.toThrow();
  expect(p.fila()).toHaveLength(1);
});
