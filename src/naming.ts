/**
 * Nome no disco → `{ codigo, titulo }`.
 *
 * Três padrões convivem no acervo, porque três pessoas organizaram três cursos
 * em momentos diferentes:
 *
 *   pastas de módulo   `01.A.Jornada.do.Ensinante.Digital`  `02-O Que Todo…`  `B01-…`
 *   arquivos de aula   `01.02-A Ordem…mp4`  `B01.01.c-Apresentação….pdf`
 *   lista.txt (curso 2) `Módulo 01 - O SAK(IA)`
 *
 * A regra do ponto é a que mais confunde: ponto vira espaço APENAS quando o
 * resto do nome não tem espaço nenhum. É o que separa `A.Jornada.do.Ensinante`
 * (todo pontilhado, precisa converter) de `O Que Todo Ensinante Digital`
 * (já legível — converter só estragaria siglas e abreviações com ponto).
 *
 * Sem I/O de propósito: isto é função pura, e é o que permite testá-la contra
 * os nomes reais sem montar árvore de fixture.
 */

export interface Nomeado {
  /** `01`, `B01`, `01.02`, `B01.01.c` — ou null quando o nome não traz código. */
  codigo: string | null;
  titulo: string;
}

/** Extensões que o scanner reconhece — usadas aqui só para recortar o sufixo. */
const EXTENSOES = /\.(mp4|webm|mkv|pdf|xlsx|xls|docx|doc|pptx|md|txt|srt|sub|url|onepkg)$/i;

/**
 * Código com separador hífen: `NN-`, `BNN-`, `NN.NN-`, `BNN.NN.c-`.
 * Guloso nos segmentos pontilhados, que são curtos por natureza (`01`, `c`, `0`).
 */
const COM_HIFEN = /^(B?\d+(?:\.\w{1,3})*)-/;

/**
 * Código com separador ponto: `NN.` seguido de título pontilhado.
 * É o padrão de `01.A.Jornada.do.Ensinante.Digital`, onde o ponto separa
 * o código do título E as palavras do título entre si.
 */
const COM_PONTO = /^(B?\d+)\./;

/**
 * `+` sempre vira espaço: ele nunca é caractere legítimo nestes títulos, só
 * aparece onde um espaço foi codificado no download.
 *
 * `.` continua condicionado a NÃO haver espaço no nome, porque ponto é
 * legítimo em abreviação e sigla — converter sempre estragaria
 * `02-O Que Todo Ensinante Digital` e afins.
 *
 * As duas regras precisam ser separadas por causa de nomes como
 * `Mo_dulo+20+I+Aula+02_+E-book+…+Conexa_o (1)`, onde o ` (1)` do arquivo
 * duplicado introduz um único espaço e desligaria a conversão inteira.
 */
function humanizar(texto: string): string {
  const semMais = texto.replace(/\+/g, " ");
  // Ponto ENTRE DÍGITOS é número, não separador: `AJUSTES_V3.0.2` e
  // `Lei.Direitos.Autorais.9.610` viravam "AJUSTES_V3 0 2" e "…Autorais 9 610".
  // O `(?<!\d)` / `(?!\d)` deixa esses dois pontos em paz e continua abrindo
  // todos os outros.
  const t = /\s/.test(texto) ? semMais : semMais.replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Hífen primeiro. `B01.01.c-Apresentação` casa nas duas regras; só a do
 * hífen dá o código inteiro. `01.A.Jornada…` não casa na do hífen (`.Jornada`
 * tem mais de 3 caracteres, então o `-` nunca aparece), caindo corretamente
 * na do ponto.
 */
function separar(nome: string): Nomeado {
  const h = COM_HIFEN.exec(nome);
  if (h) return { codigo: h[1]!, titulo: humanizar(nome.slice(h[0].length)) };
  const p = COM_PONTO.exec(nome);
  if (p) return { codigo: p[1]!, titulo: humanizar(nome.slice(p[0].length)) };
  return { codigo: null, titulo: humanizar(nome) };
}

/** Pasta de módulo → código e título. */
export function lerModulo(pasta: string): Nomeado {
  return separar(pasta);
}

/**
 * Arquivo de aula ou material → código e título.
 *
 * A extensão sai ANTES de humanizar. Se saísse depois,
 * `Mapa+do+Curso.xlsx` viraria `Mapa do Curso xlsx`.
 */
export function lerItem(arquivo: string): Nomeado {
  return separar(arquivo.replace(EXTENSOES, ""));
}

/** `Módulo 01 - O SAK(IA)` do lista.txt do curso 2. Tolera CRLF. */
export function lerLinhaLista(linha: string): Nomeado | null {
  const limpa = linha.replace(/\r/g, "").trim();
  if (!limpa) return null;
  const m = /^M[óo]dulo\s+(\d+)\s*-\s*(.+)$/i.exec(limpa);
  if (!m) return { codigo: null, titulo: limpa };
  return { codigo: m[1]!, titulo: m[2]!.trim() };
}

/**
 * Ordem de exibição: numerados, depois bônus, depois os sem código.
 *
 * A comparação é peça a peça e numérica quando dá — senão `01.10` viria antes
 * de `01.02`, que é o erro clássico de ordenar código como texto.
 */
export function ordenarPorCodigo<T extends Nomeado>(itens: T[]): T[] {
  const peso = (c: string | null): number => (c === null ? 2 : c.startsWith("B") ? 1 : 0);

  const partes = (c: string): (number | string)[] =>
    c.replace(/^B/, "").split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));

  return [...itens].sort((a, b) => {
    const pa = peso(a.codigo), pb = peso(b.codigo);
    if (pa !== pb) return pa - pb;
    if (a.codigo === null || b.codigo === null) return a.titulo.localeCompare(b.titulo, "pt-BR");

    const xa = partes(a.codigo), xb = partes(b.codigo);
    for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
      const va = xa[i], vb = xb[i];
      if (va === undefined) return -1;
      if (vb === undefined) return 1;
      if (typeof va === "number" && typeof vb === "number") {
        if (va !== vb) return va - vb;
      } else if (String(va) !== String(vb)) {
        return String(va).localeCompare(String(vb), "pt-BR");
      }
    }
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}
