import { expect, test } from "bun:test";
import { PAGINA } from "../src/ui/pagina.ts";
import { ADMIN_JS } from "../src/ui/admin.ts";
import { HOME_JS } from "../src/ui/home.ts";

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

// --- Achado 6 (revisão final): o cartão do dono no singular ---------------
// `plural` estava definida em home.ts e em escopo dentro de ADMIN_JS — só não
// era chamada. Com 1 divergência no banco (o estado real de hoje), o cartão
// lia "1 / transcrições divergentes".
//
// O teste RODA o `cardsDeDono` que a página leva, em vez de procurar texto na
// string: é o mesmo código do navegador, e ele só precisa de `d` — nada de
// document nem de fetch.

function cardsDeDono(d: unknown): string {
  const montar = new Function("d", `${HOME_JS}\n${ADMIN_JS}\nreturn cardsDeDono(d);`);
  return montar(d) as string;
}

const dadosDeDono = (divergencias: number, itens: number, recortes: number) => ({
  permissoes: { verDisco: true },
  disco: {
    itens, bytes: 1073741824, segundos: 3600,
    recortes: { pastas: recortes, arquivos: recortes, bytes: 1024 },
  },
  fila: [{ estado: "pronto", n: 1 }],
  tarefas: [],
  divergencias: Array.from({ length: divergencias }, (_, i) => ({
    titulo: `Aula ${i}`,
    comparacao: {
      palavras_nova: 8661, palavras_antiga: 8356,
      palavras_unicas_antiga: 900, similaridade: 0.59,
    },
  })),
});

test("com uma divergência o cartão diz 'transcrição divergente'", () => {
  const html = cardsDeDono(dadosDeDono(1, 1, 1));
  expect(html).toContain("transcrição divergente");
  expect(html).not.toContain("transcrições divergentes");
  expect(html).toContain("1 item ·");
  expect(html).toContain("1 recorte em");
  expect(html).toContain("1 pasta<");
});

test("com duas divergências o cartão volta ao plural", () => {
  const html = cardsDeDono(dadosDeDono(2, 281, 56));
  expect(html).toContain("transcrições divergentes");
  expect(html).toContain("281 itens ·");
  expect(html).toContain("56 recortes em");
  expect(html).toContain("56 pastas<");
});

test("sem divergência nenhuma o cartão continua no plural", () => {
  const html = cardsDeDono(dadosDeDono(0, 0, 0));
  expect(html).toContain("transcrições divergentes");
  expect(html).toContain("nada destoando");
});

test("o cartão do dono não sai para quem não pode ver disco", () => {
  expect(cardsDeDono({ permissoes: { verDisco: false } })).toBe("");
});
