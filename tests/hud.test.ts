import { expect, test } from "bun:test";

import { ADMIN_JS } from "../src/ui/admin.ts";
import { CURSO_JS } from "../src/ui/curso.ts";
import { HOME_JS } from "../src/ui/home.ts";
import { MATERIAIS_JS } from "../src/ui/materiais.ts";
import { PAGINA } from "../src/ui/pagina.ts";
import { TRANSCRICAO_JS } from "../src/ui/transcricao.ts";
import {
  criarGeracaoDoPalco, hudDoVideo, linhasDaLegenda, PLAYER_JS,
  proximoDaRoda, rotuloVelocidade, soDaGeracao,
} from "../src/ui/player.ts";
import { vizinhoNaLista } from "../src/ui/curso.ts";

/**
 * Os controles embutidos no vídeo, exercitados no código que a página leva.
 *
 * O padrão é o de tests/palco.test.ts e tests/cliente.test.ts: as funções são
 * exportadas de `src/ui/`, embutidas na página por `toString()`, e aqui rodam
 * ou direto (as puras) ou dentro de um `document` de mentira (as que mexem na
 * tela). Nada de código de cliente redigitado no teste — foi apontado como
 * defeito neste projeto, e faz o teste dar confiança sobre a versão que NÃO
 * roda no navegador.
 */

// --- o DOM de mentira -------------------------------------------------------

interface Faixa {
  mode: string;
  activeCues: { text: string }[];
  ouvintes: Record<string, ((...a: unknown[]) => void)[]>;
  addEventListener(tipo: string, fn: (...a: unknown[]) => void): void;
  disparar(tipo: string): void;
}

function criarFaixa(): Faixa {
  const f: Faixa = {
    // Começa em 'showing' de propósito: é o estado em que o navegador põe uma
    // faixa `default`, e é dele que `aplicarFaixas` tem de tirar a faixa.
    mode: "showing",
    activeCues: [],
    ouvintes: {},
    addEventListener(tipo, fn) { (f.ouvintes[tipo] ??= []).push(fn); },
    disparar(tipo) { for (const fn of f.ouvintes[tipo] ?? []) fn(); },
  };
  return f;
}

type Elemento = Record<string, any>;

function criarDom() {
  const nos = new Map<string, Elemento>();
  const vars: Record<string, string> = {};

  const registrar = (html: string) => {
    for (const m of html.matchAll(/id="([^"]+)"/g)) {
      const id = m[1]!;
      const el = criarElemento(id);
      if (id === "v" && /<track /.test(html)) el.textTracks.push(criarFaixa());
      nos.set(id, el);
    }
  };

  function criarElemento(id: string): Elemento {
    const classes = new Set<string>();
    let html = "";
    const el: Elemento = {
      id, textContent: "", title: "", disabled: false, onclick: null,
      classes,
      classList: {
        toggle: (c: string, ligado: boolean) => { if (ligado) classes.add(c); else classes.delete(c); },
        contains: (c: string) => classes.has(c),
      },
      querySelectorAll: () => [] as unknown[],
      querySelector: () => null,
      get innerHTML() { return html; },
      set innerHTML(v: string) { html = v; registrar(v); },
    };
    if (id === "v") {
      Object.assign(el, {
        playbackRate: 1, currentTime: 0, pausas: 0,
        pause() { el.pausas++; },
        // TextTrackList é iterável e tem addEventListener; um array com o
        // método pendurado serve para as duas coisas.
        textTracks: Object.assign([] as Faixa[], {
          addEventListener: (tipo: string, fn: () => void) => { listaOuvintes[tipo] = fn; },
        }),
      });
    }
    return el;
  }

  const listaOuvintes: Record<string, () => void> = {};
  const arvore = criarElemento("arvore");
  const palco = criarElemento("palco");
  // Repintar o palco troca TUDO que está dentro dele: os nós antigos deixam
  // de ser alcançáveis por getElementById, exatamente como no navegador.
  Object.defineProperty(palco, "innerHTML", {
    set(v: string) { nos.clear(); registrar(v); },
    get() { return ""; },
  });

  const ouvintesDoc: Record<string, (e: unknown) => void> = {};
  const documento = {
    documentElement: { style: { setProperty: (k: string, v: string) => { vars[k] = v; } } },
    addEventListener: (tipo: string, fn: (e: unknown) => void) => { ouvintesDoc[tipo] = fn; },
    getElementById: (id: string) => nos.get(id) ?? null,
    querySelector: (sel: string) => (sel === ".palco" ? palco : sel === ".arvore" ? arvore : null),
    querySelectorAll: () => [] as unknown[],
    fullscreenElement: null as unknown,
  };

  return { documento, nos, vars, ouvintesDoc, listaOuvintes };
}

// --- a montagem do cliente de verdade ---------------------------------------

const MONTAR = new Function(
  "document", "fetch", "setInterval", "addEventListener", "location", "history", "localStorage",
  `${HOME_JS}${ADMIN_JS}${PLAYER_JS}${MATERIAIS_JS}${TRANSCRICAO_JS}${CURSO_JS}
   return {
     pintarPalco, abrir, pintarLegenda, refletirHud,
     get atual() { return atual; },
     set atual(x) { atual = x; },
     set dados(x) { dados = x; },
   };`,
);

const AULA = (id: number, temLegenda = true) => ({
  id, tipo: "video", titulo: "Aula " + id, duracao: 600, temLegenda,
});

function abrirPainel(itens: ReturnType<typeof AULA>[], prefs: Record<string, string> = {}) {
  const dom = criarDom();
  const guardado = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => { guardado.set(k, v); },
  };
  // `ok: false` deixa a fila intacta para o teste ler: `escoar` só limpa o que
  // o servidor confirmou.
  const buscar = async () => ({ ok: false, json: async () => ({ trechos: [] }) });

  const cliente = MONTAR(dom.documento, buscar, () => 0, () => {},
    { hash: "" }, { replaceState: () => {} }, localStorage);

  cliente.dados = {
    arvore: [{ slug: "c1", titulo: "Curso Um", estado: "completo", modulos: [{ codigo: "01", titulo: "M1", itens }] }],
    progresso: {}, notas: {}, prefs, permissoes: {}, indicadores: { eu: "c", outro: null },
  };
  cliente.atual = itens[0];
  cliente.pintarPalco();

  const fila = () => JSON.parse(guardado.get("ed.fila") ?? "[]") as { tipo: string; nome?: string; valor?: string }[];
  const prefsNaFila = () => fila().filter((o) => o.tipo === "pref");
  return { ...dom, cliente, fila, prefsNaFila, guardado };
}

const chip = (p: ReturnType<typeof abrirPainel>, id: string) => p.nos.get(id);
const clicar = (p: ReturnType<typeof abrirPainel>, id: string) => p.nos.get(id)!.onclick();

// --- as rodas ---------------------------------------------------------------

test("a roda da velocidade anda e volta ao começo depois do fim", () => {
  const v = [0.75, 1, 1.25, 1.5, 1.75, 2];
  expect(proximoDaRoda(v, 1)).toBe(1.25);
  expect(proximoDaRoda(v, 1.75)).toBe(2);
  expect(proximoDaRoda(v, 2)).toBe(0.75);
});

test("a roda do tamanho da legenda anda e volta ao começo depois do fim", () => {
  const t = [15, 18, 22, 27];
  expect(proximoDaRoda(t, 18)).toBe(22);
  expect(proximoDaRoda(t, 27)).toBe(15);
});

test("valor que não está na roda recomeça do primeiro, em vez de travar o chip", () => {
  expect(proximoDaRoda([15, 18, 22, 27], 999)).toBe(15);
});

test("a velocidade sai com vírgula, que é como se escreve número em português", () => {
  expect(rotuloVelocidade(1)).toBe("1×");
  expect(rotuloVelocidade(1.25)).toBe("1,25×");
  expect(rotuloVelocidade(0.75)).toBe("0,75×");
});

// --- os chips no HTML -------------------------------------------------------

const ESTADO = { velocidade: 1, tamanhoLegenda: 18, legendaLigada: true, autoplay: false };

test("com legenda, o HUD traz os cinco chips", () => {
  const html = hudDoVideo(true, ESTADO);
  for (const id of ["bVel", "bCC", "bTam", "bAuto", "bTela"]) expect(html).toContain(`id="${id}"`);
});

test("sem legenda, CC e Aa não aparecem — não se oferece controle para o que não existe", () => {
  const html = hudDoVideo(false, ESTADO);
  expect(html).not.toContain('id="bCC"');
  expect(html).not.toContain('id="bTam"');
  expect(html).toContain('id="bVel"');
  expect(html).toContain('id="bAuto"');
  expect(html).toContain('id="bTela"');
});

test("cada chip mostra o estado atual no próprio rótulo", () => {
  const html = hudDoVideo(true, { velocidade: 1.5, tamanhoLegenda: 22, legendaLigada: true, autoplay: true });
  expect(html).toContain(">1,5×<");
  expect(html).toContain(">Aa 22<");
  expect(html).toContain(">Auto ▶<");
  expect(hudDoVideo(true, ESTADO)).toContain(">Auto —<");
});

test("CC aceso é o CC com a classe que o pinta de âmbar", () => {
  expect(hudDoVideo(true, ESTADO)).toContain('class="chip on" id="bCC"');
  expect(hudDoVideo(true, { ...ESTADO, legendaLigada: false })).toContain('class="chip" id="bCC"');
});

test("todo chip explica no title o que faz", () => {
  const html = hudDoVideo(true, ESTADO);
  expect((html.match(/ title="/g) ?? []).length).toBe(5);
  expect(html).toContain("Tela cheia (F)");
});

// --- o ciclo de cada chip, com a preferência indo para a fila ---------------

test("o chip da velocidade anda a roda, muda o rótulo e enfileira a preferência", () => {
  const p = abrirPainel([AULA(1), AULA(2)]);
  expect(chip(p, "bVel")!.textContent).toBe("1×");

  clicar(p, "bVel");
  expect(chip(p, "bVel")!.textContent).toBe("1,25×");
  expect(p.nos.get("v")!.playbackRate).toBe(1.25);
  expect(p.prefsNaFila()).toEqual([{ tipo: "pref", nome: "velocidade", valor: "1.25" }]);

  clicar(p, "bVel");
  expect(chip(p, "bVel")!.textContent).toBe("1,5×");
  expect(p.prefsNaFila().at(-1)).toEqual({ tipo: "pref", nome: "velocidade", valor: "1.5" });
});

test("o chip do tamanho anda a roda e põe o px na RAIZ, não no palco", () => {
  const p = abrirPainel([AULA(1)]);
  expect(p.vars["--tamleg"]).toBe("18px");

  clicar(p, "bTam");
  expect(chip(p, "bTam")!.textContent).toBe("Aa 22");
  expect(p.vars["--tamleg"]).toBe("22px");
  expect(p.prefsNaFila()).toEqual([{ tipo: "pref", nome: "legenda", valor: "22" }]);
});

test("o chip CC apaga e acende a legenda, e desligar põe a faixa em 'disabled'", () => {
  const p = abrirPainel([AULA(1)]);
  const faixa = p.nos.get("v")!.textTracks[0] as Faixa;
  expect(chip(p, "bCC")!.classes.has("on")).toBe(true);

  clicar(p, "bCC");
  expect(chip(p, "bCC")!.classes.has("on")).toBe(false);
  expect(faixa.mode).toBe("disabled");
  expect(p.prefsNaFila()).toEqual([{ tipo: "pref", nome: "legendaLigada", valor: "0" }]);

  clicar(p, "bCC");
  expect(chip(p, "bCC")!.classes.has("on")).toBe(true);
  expect(faixa.mode).toBe("hidden");
  expect(p.prefsNaFila().at(-1)).toEqual({ tipo: "pref", nome: "legendaLigada", valor: "1" });
});

test("o chip do autoplay liga e desliga, e enfileira '1'/'0'", () => {
  const p = abrirPainel([AULA(1), AULA(2)]);
  expect(chip(p, "bAuto")!.textContent).toBe("Auto —");

  clicar(p, "bAuto");
  expect(chip(p, "bAuto")!.textContent).toBe("Auto ▶");
  expect(chip(p, "bAuto")!.classes.has("on")).toBe(true);
  expect(p.prefsNaFila()).toEqual([{ tipo: "pref", nome: "autoplay", valor: "1" }]);

  clicar(p, "bAuto");
  expect(chip(p, "bAuto")!.textContent).toBe("Auto —");
  expect(p.prefsNaFila().at(-1)).toEqual({ tipo: "pref", nome: "autoplay", valor: "0" });
});

test("a preferência que veio do servidor abre a aula já no jeito certo", () => {
  const p = abrirPainel([AULA(1)], { velocidade: "1.75", legenda: "27", autoplay: "1" });
  expect(chip(p, "bVel")!.textContent).toBe("1,75×");
  expect(p.nos.get("v")!.playbackRate).toBe(1.75);
  expect(chip(p, "bTam")!.textContent).toBe("Aa 27");
  expect(chip(p, "bAuto")!.textContent).toBe("Auto ▶");
  // Nada foi para a fila: aplicar o que veio do servidor não devolve nada
  // para ele.
  expect(p.prefsNaFila()).toEqual([]);
});

test("aula sem legenda não tem chip de legenda na tela", () => {
  const p = abrirPainel([AULA(1, false)]);
  expect(p.nos.get("bCC")).toBeUndefined();
  expect(p.nos.get("bTam")).toBeUndefined();
  expect(p.nos.get("bVel")).toBeDefined();
});

// --- a legenda que nós desenhamos -------------------------------------------

test("a faixa nativa nasce escondida: quem desenha a legenda somos nós", () => {
  const p = abrirPainel([AULA(1)]);
  // 'hidden', e não 'showing': em 'showing' o navegador desenharia a legenda
  // dele POR CIMA da nossa, em dobro.
  expect((p.nos.get("v")!.textTracks[0] as Faixa).mode).toBe("hidden");
});

test("o menu nativo religa a faixa e nós a escondemos de novo", () => {
  const p = abrirPainel([AULA(1)]);
  const faixa = p.nos.get("v")!.textTracks[0] as Faixa;
  faixa.mode = "showing";
  p.listaOuvintes["change"]!();
  expect(faixa.mode).toBe("hidden");
});

test("cue de várias linhas vira uma tarja só, com <br> entre as linhas", () => {
  const p = abrirPainel([AULA(1)]);
  const faixa = p.nos.get("v")!.textTracks[0] as Faixa;
  faixa.activeCues = [{ text: "primeira linha\nsegunda linha" }];
  faixa.disparar("cuechange");
  expect(p.nos.get("legenda")!.innerHTML).toBe("<span>primeira linha<br>segunda linha</span>");
});

test("o texto da cue sai escapado, não interpretado", () => {
  const p = abrirPainel([AULA(1)]);
  const faixa = p.nos.get("v")!.textTracks[0] as Faixa;
  faixa.activeCues = [{ text: '5 < 7 & "aspas" <img src=x>' }];
  faixa.disparar("cuechange");
  const html = p.nos.get("legenda")!.innerHTML;
  expect(html).not.toContain("<img");
  expect(html).toContain("5 &lt; 7 &amp; &quot;aspas&quot; &lt;img src=x&gt;");
});

test("sem fala corrente a legenda fica vazia, e o CSS a some", () => {
  const p = abrirPainel([AULA(1)]);
  const faixa = p.nos.get("v")!.textTracks[0] as Faixa;
  faixa.activeCues = [];
  faixa.disparar("cuechange");
  expect(p.nos.get("legenda")!.innerHTML).toBe("");
});

test("linha em branco na cue não vira tarja vazia", () => {
  expect(linhasDaLegenda(["uma fala\n"])).toEqual(["uma fala"]);
  expect(linhasDaLegenda(["  \n  "])).toEqual([]);
});

test("duas cues ativas ao mesmo tempo viram duas linhas da mesma tarja", () => {
  expect(linhasDaLegenda(["primeira", "segunda"])).toEqual(["primeira", "segunda"]);
});

test("fim de linha de Windows não deixa espaço sobrando dentro da tarja", () => {
  expect(linhasDaLegenda(["uma fala\r\noutra fala\r\n"])).toEqual(["uma fala", "outra fala"]);
});

// --- as setas ---------------------------------------------------------------

test("o vizinho atravessa o módulo, e não existe antes do primeiro nem depois do último", () => {
  const itens = [{ id: 7 }, { id: 8 }, { id: 9 }];
  expect(vizinhoNaLista(itens, 8, 1)).toEqual({ id: 9 });
  expect(vizinhoNaLista(itens, 8, -1)).toEqual({ id: 7 });
  expect(vizinhoNaLista(itens, 9, 1)).toBeNull();
  expect(vizinhoNaLista(itens, 7, -1)).toBeNull();
  expect(vizinhoNaLista(itens, 404, 1)).toBeNull();
});

test("na primeira aula a seta de voltar fica desligada; a de avançar, não", () => {
  const p = abrirPainel([AULA(1), AULA(2)]);
  expect(chip(p, "bAnt")!.disabled).toBe(true);
  expect(chip(p, "bProx")!.disabled).toBe(false);

  clicar(p, "bProx");
  expect(p.cliente.atual.id).toBe(2);
  expect(chip(p, "bAnt")!.disabled).toBe(false);
  expect(chip(p, "bProx")!.disabled).toBe(true);
});

// --- a geração: o que a aula anterior deixou vivo ---------------------------
//
// Quarta ocorrência possível da mesma família de defeito do projeto, agora por
// EVENTO em vez de por resposta de rede: o elemento anterior já saiu do DOM,
// mas continua disparando.

test("o embrulho de geração deixa passar o ouvinte da aula corrente", () => {
  const palco = criarGeracaoDoPalco();
  let chamou = 0;
  const ouvinte = soDaGeracao(palco, palco.nova(), () => { chamou++; });
  ouvinte();
  expect(chamou).toBe(1);
});

test("trocar de aula cala o ouvinte que a aula anterior deixou", () => {
  const palco = criarGeracaoDoPalco();
  let chamou = 0;
  const ouvinte = soDaGeracao(palco, palco.nova(), () => { chamou++; });
  palco.nova(); // a pessoa clicou em outra aula
  ouvinte();
  expect(chamou).toBe(0);
});

test("com autoplay ligado, o vídeo ANTIGO terminando fora do DOM não sequestra a aula nova", () => {
  const p = abrirPainel([AULA(1), AULA(2), AULA(3)], { autoplay: "1" });
  const videoAntigo = p.nos.get("v")!;

  // A pessoa pula da aula 1 direto para a 3, e só então a 1 termina de tocar
  // no elemento que já saiu da tela.
  p.cliente.abrir(3);
  expect(p.cliente.atual.id).toBe(3);

  videoAntigo.onended();

  // Sem a guarda de geração, o autoplay da aula 1 mandaria para a 2 — a pessoa
  // escolheu a 3 e cairia na 2 — e ainda marcaria a 1 como vista.
  expect(p.cliente.atual.id).toBe(3);
  expect(p.fila()).toEqual([]);
});

// Duas defesas, e a de baixo é a que este teste consegue distinguir:
// `pintarLegenda` monta a fala a partir do `<video>` que está NA TELA, e não do
// elemento que disparou o evento — a faixa velha não tem por onde injetar o
// texto dela. O embrulho de geração é a segunda, e existe para o dia em que
// alguém achar mais rápido fechar o ouvinte sobre o elemento que o criou.
test("cuechange do vídeo antigo não escreve legenda por cima da aula nova", () => {
  const p = abrirPainel([AULA(1), AULA(2)]);
  const faixaAntiga = p.nos.get("v")!.textTracks[0] as Faixa;

  p.cliente.abrir(2);
  const faixaNova = p.nos.get("v")!.textTracks[0] as Faixa;
  faixaNova.activeCues = [{ text: "fala da aula nova" }];
  faixaNova.disparar("cuechange");

  faixaAntiga.activeCues = [{ text: "fala da aula velha" }];
  faixaAntiga.disparar("cuechange");

  expect(p.nos.get("legenda")!.innerHTML).toBe("<span>fala da aula nova</span>");
});

test("o ontimeupdate do vídeo antigo não grava progresso depois da troca", () => {
  const p = abrirPainel([AULA(1), AULA(2)]);
  const videoAntigo = p.nos.get("v")!;

  p.cliente.abrir(2);
  videoAntigo.currentTime = 300;
  videoAntigo.ontimeupdate();

  expect(p.fila()).toEqual([]);
});

// --- a página leva o que foi testado ---------------------------------------

test("são estas funções que vão para o navegador, não cópias manuscritas delas", () => {
  for (const f of [soDaGeracao, proximoDaRoda, rotuloVelocidade, hudDoVideo, linhasDaLegenda, vizinhoNaLista]) {
    expect(PAGINA).toContain(f.toString());
  }
});

test("a tela cheia vai na cena, e o botão nativo do player some", () => {
  // Mandando o <video>, o HUD e a legenda ficariam de fora: são irmãos dele.
  expect(PAGINA).toContain("document.getElementById('cena')?.requestFullscreen?.()");
  expect(PAGINA).toContain("video::-webkit-media-controls-fullscreen-button { display: none; }");
});

test("o tamanho da legenda vai na raiz do documento, para valer em tela cheia", () => {
  expect(PAGINA).toContain("document.documentElement?.style?.setProperty('--tamleg'");
  // Em px, e não em %: a legenda não encolhe junto com a janela.
  expect(PAGINA).toContain("e.tamanhoLegenda + 'px'");
});
