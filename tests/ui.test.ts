import { expect, test } from "bun:test";
import { PAGINA } from "../src/ui/pagina.ts";

test("a página traz os tokens do tema escuro", () => {
  expect(PAGINA).toContain("--fundo: #0e1013");
  expect(PAGINA).toContain("--ambar: #e8963c");
  expect(PAGINA).toContain("--verde: #4ea672");
});

test("números de tempo são tabulares", () => {
  expect(PAGINA).toContain("tabular-nums");
});

test("não sobrou o artefato de colchete do plano", () => {
  expect(PAGINA).not.toContain("］");
});

test("o HTML é válido o bastante para o parser não abortar", () => {
  // Aspas não fechadas em atributo são o erro mais comum ao editar template
  // string à mão, e deixam a página em branco sem log nenhum.
  const aspas = (PAGINA.match(/"/g) ?? []).length;
  expect(aspas % 2).toBe(0);
});

test("o plural não erra no singular", () => {
  // "1 módulos" apareceu no cartão Materiais, que tem exatamente um.
  expect(PAGINA).toContain("n === 1 ? singular : plural");
});

// Os nove arquivos de `Repo/` trazem 105 réguas horizontais e 16 títulos de
// nível 4. Sem regra própria o navegador desenha o <hr> com bisel 3D claro,
// fora da paleta — e é o construto que mais aparece depois de tabela e lista.
test("markdown: régua e título de nível 4 saem na paleta, não no padrão do navegador", () => {
  expect(PAGINA).toContain(".md hr { border: 0; border-top: 1px solid var(--borda)");
  expect(PAGINA).toContain(".md h4 {");
  expect(PAGINA).toContain(".md h1, .md h2, .md h3, .md h4 {");
});
