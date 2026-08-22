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
