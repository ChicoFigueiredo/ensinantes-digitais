import { expect, test } from "bun:test";
import { paraHtml } from "../src/markdown.ts";

test("títulos de todos os níveis", () => {
  expect(paraHtml("# Um")).toContain("<h1>Um</h1>");
  expect(paraHtml("### Três")).toContain("<h3>Três</h3>");
});

test("ênfase e código em linha", () => {
  expect(paraHtml("**forte** e *fraco* e `cod`"))
    .toContain("<strong>forte</strong> e <em>fraco</em> e <code>cod</code>");
});

test("lista com marcador vira ul", () => {
  const h = paraHtml("- um\n- dois");
  expect(h).toContain("<ul>");
  expect(h).toContain("<li>um</li>");
  expect((h.match(/<li>/g) ?? []).length).toBe(2);
});

test("lista numerada vira ol", () => {
  expect(paraHtml("1. um\n2. dois")).toContain("<ol>");
});

test("tabela com cabeçalho", () => {
  const h = paraHtml("| A | B |\n|---|---:|\n| 1 | 2 |");
  expect(h).toContain("<table>");
  expect(h).toContain("<th>A</th>");
  expect(h).toContain("<td>1</td>");
});

test("bloco de código não interpreta o que está dentro", () => {
  const h = paraHtml("```\n# não é título\n**nem forte**\n```");
  expect(h).toContain("<pre><code>");
  expect(h).not.toContain("<h1>");
  expect(h).not.toContain("<strong>");
});

test("link vira âncora que abre fora", () => {
  expect(paraHtml("[Focus](https://exemplo.com)"))
    .toContain('<a href="https://exemplo.com" target="_blank" rel="noopener">Focus</a>');
});

test("HTML no markdown é escapado", () => {
  const h = paraHtml("texto <script>alert(1)</script> fim");
  expect(h).not.toContain("<script>");
  expect(h).toContain("&lt;script&gt;");
});

test("javascript: em link não vira href", () => {
  expect(paraHtml("[x](javascript:alert(1))")).not.toContain('href="javascript:');
});

test("parágrafos separados por linha em branco", () => {
  const h = paraHtml("um\n\ndois");
  expect((h.match(/<p>/g) ?? []).length).toBe(2);
});

// A partir daqui: casos que o brief não cobriu, achados ao ler os nove
// arquivos reais de acervo/Repo/ antes de implementar.

test("<br> é a única tag reaberta depois do escape", () => {
  // Nenhum arquivo real usa <br> fora de bloco de código, mas o README
  // documenta a convenção (\"Quebras de linha: `<br>`\") — a decisão do
  // projeto é reabrir só esta, então ela precisa funcionar quando aparece
  // solta no texto.
  const h = paraHtml("linha um<br>linha dois");
  expect(h).toContain("<br>");
});

test("<nome> — o caso real do acervo — aparece na tela como texto, não como tag", () => {
  // Trecho verbatim de acervo/Repo/README.md, linha 80: uma célula de tabela
  // com `<nome>.md` dentro de código em linha. Prova que texto entre < e >
  // ocorre no acervo de verdade e tem que sobreviver literalmente.
  const h = paraHtml("| `output` | Path | `<nome>.md` | Arquivo Markdown de saída |");
  expect(h).toContain("&lt;nome&gt;.md");
  expect(h).not.toContain("<nome>");
});

test("código em linha protege o conteúdo da reabertura de <br>", () => {
  // Mesmo trecho real do README: \"Quebras de linha: `<br>`\" documenta o
  // recurso de OUTRA ferramenta — é texto de exemplo dentro de crase, não
  // uma quebra de linha de verdade. Reabrir a tag aqui destruiria o
  // <code> ao redor.
  const h = paraHtml("Quebras de linha: `<br>`");
  expect(h).toContain("<code>&lt;br&gt;</code>");
});

test("negrito com código em linha dentro — caso real de COMPARACAO.md", () => {
  const h = paraHtml("| **v3.0** | **`excel2md_advanced.py`** |");
  expect(h).toContain("<strong><code>excel2md_advanced.py</code></strong>");
});

test("link para caminho relativo (não http) vira texto simples, sem href", () => {
  // acervo/Repo/INDEX.md tem dezenas de links para outros .md do próprio
  // Repo — não há rota para servi-los aqui, então virar texto puro é o
  // comportamento seguro, não uma lacuna.
  const h = paraHtml("[README.md](README.md)");
  expect(h).not.toContain("<a ");
  expect(h).toContain("README.md");
});

test("URL com & no query string não fica escapada duas vezes", () => {
  const h = paraHtml("[link](https://exemplo.com?a=1&b=2)");
  expect(h).toContain('href="https://exemplo.com?a=1&amp;b=2"');
  expect(h).not.toContain("&amp;amp;");
});
