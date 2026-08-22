/**
 * Markdown → HTML, o suficiente para os nove arquivos de `Repo/`.
 *
 * Não é um renderizador geral e não deve virar um: a restrição de "sem
 * dependência de runtime" vale, e markdown completo é biblioteca, não função.
 * O escopo é o que esses arquivos usam — título, ênfase, lista, tabela, bloco
 * de código, citação e link. `1351` das linhas medidas em `acervo/Repo/*.md`
 * são de tabela: é de longe o construto dominante, e é o que mais precisa
 * ficar correto.
 *
 * Escapar vem PRIMEIRO, então HTML embutido no arquivo aparece como texto. O
 * conteúdo vem do disco, não de formulário, mas escapar é barato e a
 * alternativa é confiar num arquivo que ninguém releu.
 *
 * Depois do escape, existe UMA única reabertura: `&lt;br&gt;` volta a virar
 * `<br>`. É a exceção deliberada — não uma allowlist geral de tags, só esta.
 * O caso que prova a regra oposta é `<nome>` (acervo/Repo/README.md, linha
 * 80): texto entre `<` e `>` ocorre no acervo de verdade, e tem que
 * sobreviver na tela EXATAMENTE como apareceu — escapado, portanto visível
 * como texto, nunca interpretado como tag.
 */

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Só http(s). `javascript:` num href é o buraco clássico, e um caminho
 * relativo (`README.md`, comum em `Repo/INDEX.md`) não tem rota que o sirva
 * aqui — os dois casos degradam para texto simples, não para link quebrado.
 *
 * Recebe o trecho JÁ escapado (é chamada de dentro de `emLinha`, depois do
 * `escapar` do texto inteiro): reescapar aqui duplicaria entidades como
 * `&amp;` num `?a=1&b=2` de query string.
 */
const hrefSeguro = (uJaEscapado: string): string | null => {
  const u = uJaEscapado.trim();
  return /^https?:\/\//i.test(u) ? u : null;
};

/** Marcador único para proteger código em linha — ver comentário em `emLinha`. */
const MARCA = String.fromCharCode(1);

/**
 * Ênfase, código em linha e link — nessa ordem de PROTEÇÃO, não de escrita:
 * o código em linha é extraído para um marcador ANTES de qualquer outra
 * substituição (reabertura de `<br>`, negrito, itálico, link) e só volta no
 * final. Mesma razão do bloco de código ficar imune a `**`/`` ` ``: o
 * conteúdo dentro de crase é literal, e isso inclui não ganhar de volta uma
 * tag que o escape tinha fechado — README.md documenta `<br>` dentro de
 * crase como EXEMPLO de texto, não como quebra de linha de verdade.
 *
 *O marcador usa um caractere de controle (`String.fromCharCode(1)`), não
 * espaço-mais-dígito: um esquema só de espaço e número colidiria com
 * qualquer número solto no meio de uma frase real ("5 min de vídeo").
 */
function emLinha(texto: string): string {
  let t = escapar(texto);

  const trechosDeCodigo: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_todo, cod: string) => {
    trechosDeCodigo.push(cod);
    return `${MARCA}${trechosDeCodigo.length - 1}${MARCA}`;
  });

  // A única reabertura depois do escape. Roda sobre texto que já não tem o
  // conteúdo de código em linha (protegido acima pelo marcador).
  t = t.replace(/&lt;br&gt;/gi, "<br>");

  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_todo, rotulo: string, url: string) => {
    const h = hrefSeguro(url);
    return h ? `<a href="${h}" target="_blank" rel="noopener">${rotulo}</a>` : rotulo;
  });

  t = t.replace(new RegExp(`${MARCA}(\\d+)${MARCA}`, "g"),
    (_todo, i: string) => `<code>${trechosDeCodigo[Number(i)]}</code>`);
  return t;
}

const celulas = (linha: string): string[] =>
  linha.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function paraHtml(md: string): string {
  const linhas = md.replace(/\r/g, "").split("\n");
  const saida: string[] = [];
  const paragrafo: string[] = [];
  let i = 0;

  const fecharParagrafo = () => {
    if (paragrafo.length) {
      saida.push(`<p>${emLinha(paragrafo.join(" "))}</p>`);
      paragrafo.length = 0;
    }
  };

  while (i < linhas.length) {
    const l = linhas[i]!;

    // Bloco de código ANTES de qualquer processamento em linha: nada de `**`
    // ou `` ` `` sendo interpretado dentro. O conteúdo só passa por
    // `escapar`, nunca por `emLinha`.
    if (/^```/.test(l)) {
      fecharParagrafo();
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^```/.test(linhas[i]!)) corpo.push(linhas[i++]!);
      i++; // consome a cerca de fechamento (ou o fim do arquivo, se faltar)
      saida.push(`<pre><code>${escapar(corpo.join("\n"))}</code></pre>`);
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(l);
    if (titulo) {
      fecharParagrafo();
      const n = titulo[1]!.length;
      saida.push(`<h${n}>${emLinha(titulo[2]!)}</h${n}>`);
      i++;
      continue;
    }

    // Tabela: a linha seguinte TEM de ser a de separação, senão é parágrafo
    // que por acaso começa com barra vertical.
    if (/^\|/.test(l) && /^\|[\s:|-]+\|?$/.test(linhas[i + 1] ?? "")) {
      fecharParagrafo();
      const cab = celulas(l);
      i += 2;
      const corpo: string[] = [];
      while (i < linhas.length && /^\|/.test(linhas[i]!)) {
        corpo.push(`<tr>${celulas(linhas[i++]!).map((c) => `<td>${emLinha(c)}</td>`).join("")}</tr>`);
      }
      saida.push(`<table><thead><tr>${cab.map((c) => `<th>${emLinha(c)}</th>`).join("")}` +
                 `</tr></thead><tbody>${corpo.join("")}</tbody></table>`);
      continue;
    }

    const marcador = /^\s*[-*]\s+/.test(l);
    const numero = /^\s*\d+\.\s+/.test(l);
    if (marcador || numero) {
      fecharParagrafo();
      const tag = marcador ? "ul" : "ol";
      const padrao = marcador ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/;
      const itens: string[] = [];
      while (i < linhas.length && padrao.test(linhas[i]!)) {
        itens.push(`<li>${emLinha(padrao.exec(linhas[i++]!)![1]!)}</li>`);
      }
      saida.push(`<${tag}>${itens.join("")}</${tag}>`);
      continue;
    }

    const citacao = /^>\s?(.*)$/.exec(l);
    if (citacao) {
      fecharParagrafo();
      saida.push(`<blockquote>${emLinha(citacao[1]!)}</blockquote>`);
      i++;
      continue;
    }

    if (!l.trim()) { fecharParagrafo(); i++; continue; }

    paragrafo.push(l);
    i++;
  }

  fecharParagrafo();
  return saida.join("\n");
}
