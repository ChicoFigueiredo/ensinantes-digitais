import { expect, test } from "bun:test";

import { ADMIN_JS } from "../src/ui/admin.ts";
import { CURSO_JS, estadoDoModulo } from "../src/ui/curso.ts";
import { HOME_JS } from "../src/ui/home.ts";
import { MATERIAIS_JS } from "../src/ui/materiais.ts";
import { PAGINA } from "../src/ui/pagina.ts";
import { PLAYER_JS } from "../src/ui/player.ts";
import { TRANSCRICAO_JS } from "../src/ui/transcricao.ts";

/**
 * A árvore que MARCA, e não só mostra: a caixa por aula, o "marcar tudo" do
 * módulo e o contador `✓ 3/12`.
 *
 * O padrão é o de tests/hud.test.ts e tests/palco.test.ts: nada de código de
 * cliente redigitado aqui. Os seis blocos de `src/ui/` são montados na mesma
 * ordem em que `pagina.ts` os concatena, dentro de um `document` de mentira, e
 * o que os testes exercitam é exatamente o que roda no navegador.
 *
 * O DOM de mentira daqui é mais fundo que o de hud.test.ts de propósito: o que
 * está em jogo são <details> que abrem e fecham, caixas que carregam
 * `checked`/`indeterminate` e um clique que NÃO pode subir para a linha. Nada
 * disso se observa num nó que só guarda `innerHTML`.
 */

// --- o DOM de mentira -------------------------------------------------------

interface El {
  tag: string;
  classes: string[];
  dataset: Record<string, string>;
  title: string;
  open: boolean;
  checked: boolean;
  indeterminate: boolean;
  conta: string;
  onclick: ((e: { stopPropagation(): void }) => void) | null;
  onchange: (() => void) | null;
}

/** Os atributos com valor de uma tag, pelo texto dela. */
function atributos(corpo: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of corpo.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) a[m[1]!] = m[2]!;
  return a;
}

/** Atributo sem valor — `open` e `checked` são escritos assim no HTML. */
const temFlag = (corpo: string, nome: string) => new RegExp(`\\s${nome}(\\s|$)`).test(corpo);

/**
 * Lê o HTML da árvore e devolve os nós que importam, em ordem de documento.
 *
 * `[^>]*` basta para o corpo da tag porque nenhum atributo daqui contém `>` —
 * e um parser de verdade num teste seria mais código do que o que ele testa.
 */
function analisar(html: string): { elementos: El[]; modulos: El[] } {
  const elementos: El[] = [];
  const modulos: El[] = [];

  for (const m of html.matchAll(/<(details|input|div)\b([^>]*)>/g)) {
    const tag = m[1]!;
    const corpo = m[2]!;
    const at = atributos(corpo);
    const classes = (at.class ?? "").split(/\s+/).filter(Boolean);
    if (tag === "div" && !classes.includes("aula")) continue;

    const dataset: Record<string, string> = {};
    for (const [k, v] of Object.entries(at)) if (k.startsWith("data-")) dataset[k.slice(5)] = v;

    const el: El = {
      tag, classes, dataset, title: at.title ?? "",
      open: tag === "details" && temFlag(corpo, "open"),
      checked: tag === "input" && temFlag(corpo, "checked"),
      indeterminate: false,
      conta: "",
      onclick: null, onchange: null,
    };
    if (tag === "details") modulos.push(el);
    elementos.push(el);
  }

  // O contador vive num <span class="conta">, um por módulo, na ordem deles.
  const contas = [...html.matchAll(/<span class="conta num">([^<]*)<\/span>/g)].map((x) => x[1]!);
  modulos.forEach((mod, i) => { mod.conta = contas[i] ?? ""; });

  return { elementos, modulos };
}

/** `.caixa.tudo` casa com quem tem TODAS as classes pedidas. */
const casa = (el: El, seletor: string) =>
  seletor.split(".").filter(Boolean).every((c) => el.classes.includes(c));

function criarArvore() {
  let html = "";
  let analise = { elementos: [] as El[], modulos: [] as El[] };
  const arv = {
    scrollTop: 0,
    get innerHTML() { return html; },
    set innerHTML(v: string) { html = v; analise = analisar(v); },
    querySelectorAll: (sel: string) => analise.elementos.filter((el) => casa(el, sel)),
    get modulos() { return analise.modulos; },
  };
  return arv;
}

function criarDom() {
  const arvore = criarArvore();
  const nos = new Map<string, Record<string, unknown>>();

  // O palco é repintado por inteiro: os nós antigos deixam de ser alcançáveis
  // por getElementById, como no navegador.
  const palco = {
    get innerHTML() { return ""; },
    set innerHTML(v: string) {
      nos.clear();
      // `\sid=`, e não `id=`: `data-id="3"` também casaria com `\bid="`.
      for (const m of v.matchAll(/<\w+([^>]*\sid="([^"]+)"[^>]*)>([^<]*)/g)) {
        const dataset: Record<string, string> = {};
        for (const [k, val] of Object.entries(atributos(m[1]!))) {
          if (k.startsWith("data-")) dataset[k.slice(5)] = val;
        }
        nos.set(m[2]!, { id: m[2]!, dataset, textContent: m[3]!, onclick: null });
      }
    },
  };

  const documento = {
    documentElement: { style: { setProperty: () => {} }, setAttribute: () => {} },
    addEventListener: () => {},
    getElementById: (id: string) => nos.get(id) ?? null,
    querySelector: (sel: string) => (sel === ".palco" ? palco : sel === ".arvore" ? arvore : null),
    querySelectorAll: () => [] as unknown[],
    fullscreenElement: null as unknown,
  };

  return { documento, arvore, nos };
}

// --- a montagem do cliente de verdade ---------------------------------------

const MONTAR = new Function(
  "document", "fetch", "setInterval", "addEventListener", "location", "history", "localStorage",
  `${HOME_JS}${ADMIN_JS}${PLAYER_JS}${MATERIAIS_JS}${TRANSCRICAO_JS}${CURSO_JS}
   return {
     pintarPalco, pintarArvore, abrir,
     get atual() { return atual; },
     set atual(x) { atual = x; },
     get dados() { return dados; },
     set dados(x) { dados = x; },
   };`,
);

/**
 * Itens de tipo `pdf`: o palco deles não tem <video>, e é o que deixa este
 * arquivo falar da ÁRVORE sem montar meia API de mídia. O botão "marcar como
 * visto" do palco é o mesmo dos dois casos.
 */
const AULA = (id: number) => ({ id, tipo: "pdf", titulo: "Aula " + id, duracao: 600 });

interface Modulo { codigo: string; titulo: string; itens: ReturnType<typeof AULA>[] }
const MODULO = (codigo: string, ids: number[]): Modulo =>
  ({ codigo, titulo: "Módulo " + codigo, itens: ids.map(AULA) });

function abrirPainel(modulos: Modulo[], progresso: Record<string, unknown> = {}) {
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
    arvore: [{ slug: "c1", titulo: "Curso Um", estado: "completo", modulos }],
    progresso, notas: {}, prefs: {}, permissoes: {}, indicadores: { eu: "c", outro: null },
  };
  cliente.atual = modulos[0]!.itens[0];
  cliente.pintarArvore();
  cliente.pintarPalco();

  const fila = () => JSON.parse(guardado.get("ed.fila") ?? "[]") as Record<string, unknown>[];
  return { ...dom, cliente, fila, guardado };
}

type Painel = ReturnType<typeof abrirPainel>;

const caixas = (p: Painel) => p.arvore.querySelectorAll(".caixa") as El[];
const caixaDaAula = (p: Painel, id: number) =>
  caixas(p).find((el) => el.dataset.id === String(id))!;
const caixaDoModulo = (p: Painel, i: number) =>
  caixas(p).find((el) => el.dataset.mod === String(i))!;
const linhaDaAula = (p: Painel, id: number) =>
  (p.arvore.querySelectorAll(".aula") as El[]).find((el) => el.dataset.id === String(id))!;
const modulo = (p: Painel, i: number) => p.arvore.modulos[i]!;
const contador = (p: Painel, i: number) => modulo(p, i).conta;

/**
 * Um clique que BORBULHA, como o de verdade: o alvo primeiro, os ancestrais
 * depois, e `stopPropagation` interrompendo a subida. É a única forma de este
 * arquivo provar que marcar não navega — num clique que só chama o handler do
 * alvo, o teste passaria mesmo sem `stopPropagation` nenhum.
 */
function clicar(alvo: El, ancestrais: { onclick: ((e: never) => void) | null }[]) {
  let parado = false;
  const evento = { stopPropagation: () => { parado = true; } };
  for (const el of [alvo, ...ancestrais]) {
    el.onclick?.(evento as never);
    if (parado) return;
  }
}

/** O ciclo do navegador: `checked` muda ANTES do clique, e `change` vem depois. */
function marcarCaixa(caixa: El, ancestrais: { onclick: ((e: never) => void) | null }[], valor: boolean) {
  caixa.checked = valor;
  clicar(caixa, ancestrais);
  caixa.onchange?.();
}

/** O <details> alterna quando o clique chega ao cabeçalho — é o que o navegador faz. */
const cabecalho = (mod: El) => ({ onclick: () => { mod.open = !mod.open; } });

const progressoNaFila = (p: Painel) => p.fila().filter((o) => o.tipo === "progresso");

// --- a contagem, sozinha ----------------------------------------------------

const ids = (n: number[]) => n.map((id) => ({ id }));

test("nenhuma vista: nem marcado, nem parcial, e o contador em 0", () => {
  expect(estadoDoModulo(ids([1, 2, 3]), () => false))
    .toEqual({ feitas: 0, total: 3, todos: false, parcial: false });
});

test("algumas vistas: é o estado PARCIAL, o do traço", () => {
  expect(estadoDoModulo(ids([1, 2, 3]), (id) => id === 2))
    .toEqual({ feitas: 1, total: 3, todos: false, parcial: true });
});

test("todas vistas: marcado, e parcial não — traço e marca não convivem", () => {
  expect(estadoDoModulo(ids([1, 2, 3]), () => true))
    .toEqual({ feitas: 3, total: 3, todos: true, parcial: false });
});

test("módulo vazio não nasce marcado: não há o que ter sido visto", () => {
  expect(estadoDoModulo(ids([]), () => true))
    .toEqual({ feitas: 0, total: 0, todos: false, parcial: false });
});

// --- a caixa de cada aula ---------------------------------------------------

test("a caixa nasce refletindo o que já está gravado", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])], { "i:2": { segundos: 0, feito: true } });
  expect(caixaDaAula(p, 1).checked).toBe(false);
  expect(caixaDaAula(p, 2).checked).toBe(true);
  expect(caixaDaAula(p, 3).checked).toBe(false);
});

test("marcar pela caixa enfileira a op de progresso e acende a caixa", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  marcarCaixa(caixaDaAula(p, 2), [linhaDaAula(p, 2)], true);

  expect(progressoNaFila(p)).toEqual([
    { tipo: "progresso", chave: "i:2", segundos: 0, feito: true },
  ]);
  expect(caixaDaAula(p, 2).checked).toBe(true);
  expect(contador(p, 0)).toBe("✓ 1/3");
});

test("desmarcar pela caixa enfileira feito:false, e não some com a op", () => {
  const p = abrirPainel([MODULO("01", [1, 2])], { "i:1": { segundos: 0, feito: true } });
  marcarCaixa(caixaDaAula(p, 1), [linhaDaAula(p, 1)], false);

  expect(progressoNaFila(p)).toEqual([
    { tipo: "progresso", chave: "i:1", segundos: 0, feito: false },
  ]);
  expect(caixaDaAula(p, 1).checked).toBe(false);
  expect(contador(p, 0)).toBe("✓ 0/2");
});

// O ponto em que a pessoa parou o vídeo não é do botão de "visto": marcar pela
// árvore não pode zerar o `segundos` que o `ontimeupdate` gravou.
test("marcar pela caixa preserva os segundos já gravados", () => {
  const p = abrirPainel([MODULO("01", [1])], { "i:1": { segundos: 431, feito: false } });
  marcarCaixa(caixaDaAula(p, 1), [linhaDaAula(p, 1)], true);
  expect(progressoNaFila(p)).toEqual([
    { tipo: "progresso", chave: "i:1", segundos: 431, feito: true },
  ]);
});

// O defeito que a caixa introduziria sem `stopPropagation`: o clique sobe para
// a linha, que abre a aula. Marcar a aula 3 enquanto se assiste a 1 jogaria a
// pessoa para dentro da 3, toda vez.
test("o clique na caixa NÃO abre a aula", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  expect(p.cliente.atual.id).toBe(1);

  marcarCaixa(caixaDaAula(p, 3), [linhaDaAula(p, 3)], true);

  expect(p.cliente.atual.id).toBe(1);
  expect(caixaDaAula(p, 3).checked).toBe(true);
});

test("o clique na LINHA continua abrindo a aula", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  clicar(linhaDaAula(p, 3), []);
  expect(p.cliente.atual.id).toBe(3);
  // E abrir não marca nada: são dois gestos diferentes.
  expect(progressoNaFila(p)).toEqual([]);
});

// --- "marcar tudo" do módulo ------------------------------------------------

test("marcar tudo vira uma op por aula, no MESMO lote da fila", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  marcarCaixa(caixaDoModulo(p, 0), [cabecalho(modulo(p, 0))], true);

  expect(progressoNaFila(p)).toEqual([
    { tipo: "progresso", chave: "i:1", segundos: 0, feito: true },
    { tipo: "progresso", chave: "i:2", segundos: 0, feito: true },
    { tipo: "progresso", chave: "i:3", segundos: 0, feito: true },
  ]);
  expect(contador(p, 0)).toBe("✓ 3/3");
  expect(caixaDoModulo(p, 0).checked).toBe(true);
  for (const id of [1, 2, 3]) expect(caixaDaAula(p, id).checked).toBe(true);
});

test("desmarcar tudo desfaz o módulo inteiro", () => {
  const p = abrirPainel([MODULO("01", [1, 2])], {
    "i:1": { segundos: 0, feito: true }, "i:2": { segundos: 90, feito: true },
  });
  expect(contador(p, 0)).toBe("✓ 2/2");

  marcarCaixa(caixaDoModulo(p, 0), [cabecalho(modulo(p, 0))], false);

  expect(progressoNaFila(p)).toEqual([
    { tipo: "progresso", chave: "i:1", segundos: 0, feito: false },
    { tipo: "progresso", chave: "i:2", segundos: 90, feito: false },
  ]);
  expect(contador(p, 0)).toBe("✓ 0/2");
  expect(caixaDoModulo(p, 0).checked).toBe(false);
});

test("só entra na fila o que MUDA: marcar tudo com quase tudo já visto é uma op", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])], {
    "i:1": { segundos: 0, feito: true }, "i:2": { segundos: 0, feito: true },
  });
  marcarCaixa(caixaDoModulo(p, 0), [cabecalho(modulo(p, 0))], true);

  expect(progressoNaFila(p)).toEqual([
    { tipo: "progresso", chave: "i:3", segundos: 0, feito: true },
  ]);
});

test("marcar tudo de um módulo não toca no módulo vizinho", () => {
  const p = abrirPainel([MODULO("01", [1, 2]), MODULO("02", [3, 4])]);
  marcarCaixa(caixaDoModulo(p, 1), [cabecalho(modulo(p, 1))], true);

  expect(progressoNaFila(p).map((o) => o.chave)).toEqual(["i:3", "i:4"]);
  expect(contador(p, 0)).toBe("✓ 0/2");
  expect(contador(p, 1)).toBe("✓ 2/2");
});

// O clique na caixa do cabeçalho sobe para o <summary>, e o <summary> alterna o
// <details>: sem `stopPropagation`, marcar o módulo o FECHARIA na mesma hora.
test("o clique em 'marcar tudo' não fecha o módulo", () => {
  const p = abrirPainel([MODULO("01", [1, 2])]);
  expect(modulo(p, 0).open).toBe(true);

  marcarCaixa(caixaDoModulo(p, 0), [cabecalho(modulo(p, 0))], true);

  expect(modulo(p, 0).open).toBe(true);
});

// --- os três estados da caixa do módulo -------------------------------------

test("nenhuma vista: caixa apagada e sem traço", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  expect(caixaDoModulo(p, 0).checked).toBe(false);
  expect(caixaDoModulo(p, 0).indeterminate).toBe(false);
  expect(contador(p, 0)).toBe("✓ 0/3");
});

test("algumas vistas: o TRAÇO do indeterminate, que é o estado fácil de perder", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])], { "i:2": { segundos: 0, feito: true } });
  expect(caixaDoModulo(p, 0).checked).toBe(false);
  expect(caixaDoModulo(p, 0).indeterminate).toBe(true);
  expect(contador(p, 0)).toBe("✓ 1/3");
});

test("todas vistas: caixa marcada e o traço sai", () => {
  const p = abrirPainel([MODULO("01", [1, 2])], {
    "i:1": { segundos: 0, feito: true }, "i:2": { segundos: 0, feito: true },
  });
  expect(caixaDoModulo(p, 0).checked).toBe(true);
  expect(caixaDoModulo(p, 0).indeterminate).toBe(false);
  expect(contador(p, 0)).toBe("✓ 2/2");
});

test("marcar uma de três leva a caixa do módulo ao traço, sem marcá-la", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  marcarCaixa(caixaDaAula(p, 1), [linhaDaAula(p, 1)], true);

  expect(caixaDoModulo(p, 0).indeterminate).toBe(true);
  expect(caixaDoModulo(p, 0).checked).toBe(false);
  expect(contador(p, 0)).toBe("✓ 1/3");
});

// `indeterminate` não existe como atributo de HTML. Escrito na string, ele é
// ignorado em silêncio e o estado parcial some sem ninguém perceber.
test("o traço é ligado por PROPRIEDADE, e não escrito no HTML", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])], { "i:2": { segundos: 0, feito: true } });
  expect(p.arvore.innerHTML).not.toContain("indeterminate");
  expect(caixaDoModulo(p, 0).indeterminate).toBe(true);
  expect(PAGINA).toContain("el.indeterminate =");
});

// --- a árvore não perde o lugar ---------------------------------------------

test("marcar não fecha o módulo aberto nem abre o fechado", () => {
  const p = abrirPainel([MODULO("01", [1, 2]), MODULO("02", [3, 4])]);
  // A pessoa fecha o módulo da aula corrente e abre o outro.
  modulo(p, 0).open = false;
  modulo(p, 1).open = true;

  marcarCaixa(caixaDaAula(p, 3), [linhaDaAula(p, 3)], true);

  expect(modulo(p, 0).open).toBe(false);
  expect(modulo(p, 1).open).toBe(true);
});

test("marcar não rola a árvore de volta para o topo", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  p.arvore.scrollTop = 740;
  marcarCaixa(caixaDaAula(p, 3), [linhaDaAula(p, 3)], true);
  expect(p.arvore.scrollTop).toBe(740);
});

test("marcar não tira o destaque da aula corrente", () => {
  const p = abrirPainel([MODULO("01", [1, 2, 3])]);
  expect(linhaDaAula(p, 1).classes).toContain("corrente");

  marcarCaixa(caixaDaAula(p, 3), [linhaDaAula(p, 3)], true);

  expect(linhaDaAula(p, 1).classes).toContain("corrente");
  expect(linhaDaAula(p, 3).classes).not.toContain("corrente");
  expect(linhaDaAula(p, 3).classes).toContain("feita");
});

// A outra metade da mesma regra: preservar o que estava aberto não pode
// esconder a aula para onde a pessoa acabou de ir (setas, autoplay).
test("abrir uma aula de módulo fechado abre esse módulo", () => {
  const p = abrirPainel([MODULO("01", [1, 2]), MODULO("02", [3, 4])]);
  expect(modulo(p, 1).open).toBe(false);

  p.cliente.abrir(4);

  expect(modulo(p, 1).open).toBe(true);
  expect(modulo(p, 0).open).toBe(true); // e o de antes continua onde estava
});

// --- os dois lados do mesmo estado ------------------------------------------

test("marcar pela caixa muda o botão do palco na hora", () => {
  const p = abrirPainel([MODULO("01", [1, 2])]);
  expect(p.nos.get("bFeito")!.textContent).toBe("marcar como visto");

  marcarCaixa(caixaDaAula(p, 1), [linhaDaAula(p, 1)], true);
  expect(p.nos.get("bFeito")!.textContent).toBe("✓ visto");

  marcarCaixa(caixaDaAula(p, 1), [linhaDaAula(p, 1)], false);
  expect(p.nos.get("bFeito")!.textContent).toBe("marcar como visto");
});

test("o botão do palco muda a caixa da árvore na hora", () => {
  const p = abrirPainel([MODULO("01", [1, 2])]);
  (p.nos.get("bFeito")!.onclick as () => void)();

  expect(caixaDaAula(p, 1).checked).toBe(true);
  expect(contador(p, 0)).toBe("✓ 1/2");
  expect(progressoNaFila(p)).toEqual([
    { tipo: "progresso", chave: "i:1", segundos: 0, feito: true },
  ]);
});

// A janela que o `data-item` fecha: `pintarMarkdown` só troca o palco QUANDO a
// resposta de /api/markdown chega, e nesse intervalo `atual` já é o item novo
// enquanto o botão na tela ainda é o do anterior. Um escoamento da fila caindo
// aí escreveria o estado do item novo no botão do velho.
test("o botão do palco do item anterior não recebe o estado do item novo", () => {
  const p = abrirPainel([MODULO("01", [1, 2])], { "i:2": { segundos: 0, feito: true } });
  expect(p.nos.get("bFeito")!.textContent).toBe("marcar como visto");

  p.cliente.atual = p.cliente.dados.arvore[0].modulos[0].itens[1];
  p.cliente.pintarArvore();

  expect(p.nos.get("bFeito")!.textContent).toBe("marcar como visto");
});

test("'marcar tudo' também alcança o botão do palco da aula corrente", () => {
  const p = abrirPainel([MODULO("01", [1, 2])]);
  marcarCaixa(caixaDoModulo(p, 0), [cabecalho(modulo(p, 0))], true);
  expect(p.nos.get("bFeito")!.textContent).toBe("✓ visto");
});

// --- a página leva o que foi testado ----------------------------------------

test("é esta função de contagem que vai para o navegador, não uma cópia dela", () => {
  expect(PAGINA).toContain(estadoDoModulo.toString());
  expect(PAGINA).toContain("estadoDoModulo(m.itens, feito)");
});

test("o lote do módulo usa a op e a fila que já existiam, sem rota nova", () => {
  // Nada de `{tipo:'lote'}` nem de /api/marcar: `aplicarSync` só conhece
  // progresso, nota e pref, e uma op inventada seria recusada uma a uma.
  expect(PAGINA).toContain("enfileirarVarias(m.itens.filter");
  expect(PAGINA).toContain("opDeProgresso(i.id, valor)");
  expect(PAGINA).not.toContain("'lote'");
  expect((PAGINA.match(/fetch\('\/api\/sync'/g) ?? []).length).toBe(1);
});
