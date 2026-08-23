import { expect, test } from "bun:test";

import { ADMIN_JS } from "../src/ui/admin.ts";
import { CURSO_JS } from "../src/ui/curso.ts";
import { HOME_JS } from "../src/ui/home.ts";
import { MATERIAIS_JS } from "../src/ui/materiais.ts";
import { PLAYER_JS } from "../src/ui/player.ts";
import { TRANSCRICAO_JS } from "../src/ui/transcricao.ts";

/**
 * Roda o JS de cliente de verdade — os mesmos seis blocos, na mesma ordem em
 * que `src/ui/pagina.ts` os concatena — com um `document` de mentira.
 *
 * `document`, `fetch`, `setInterval` e `addEventListener` entram como
 * parâmetros, e não como globais: assim eles sombreiam os do Bun, e o
 * `setInterval(escoar, 8000)` de player.ts não fica pendurado depois do teste.
 *
 * O caminho que importa aqui é curto — `pintarCurso` com árvore vazia sai
 * antes de tocar na árvore e no palco —, e o curso que existe entra só para
 * ser o contraponto: sem ele, o teste de cima passaria com a página quebrada
 * de qualquer outro jeito.
 */
const MONTAR = new Function("document", "fetch", "setInterval", "addEventListener",
  "location", "history",
  `${HOME_JS}${ADMIN_JS}${PLAYER_JS}${MATERIAIS_JS}${TRANSCRICAO_JS}${CURSO_JS}
   return pintarCurso;`);

function abrirCurso(slug: string, arvore: unknown[]): Promise<string> {
  const app = { innerHTML: "carregando…" };
  // `.arvore` e `.palco` são pintadas dentro do `#app`; aqui viram nós soltos,
  // porque o que este teste lê é o HTML que `pintarCurso` escreve no `#app`.
  const solto = () => ({ innerHTML: "", querySelectorAll: () => [] });
  const documento = {
    getElementById: (id: string) => (id === "app" ? app : null),
    querySelector: () => solto(),
    querySelectorAll: () => [] as unknown[],
    // `keydown` (atalho F) e `fullscreenchange` são registrados no documento
    // uma vez, no carregamento do script — não por aula. Um documento de
    // verdade tem isto; o de mentira precisa ter também.
    addEventListener: () => {},
    documentElement: { style: { setProperty: () => {} } },
  };
  const buscar = async () => ({
    json: async () => ({
      arvore, indicadores: { eu: "c", outro: null },
      progresso: {}, notas: {}, prefs: {}, retomar: null, permissoes: {},
    }),
  });

  const pintarCurso = MONTAR(documento, buscar, () => 0, () => {},
    { hash: "" }, { replaceState: () => {} });
  return pintarCurso(slug).then(() => app.innerHTML);
}

// Achado 9 da revisão final: /curso/<slug-inexistente> devolve 200 com a
// árvore vazia, `curso.titulo` estourava e a página ficava presa em
// "carregando…" — sem mensagem e sem caminho de volta a não ser digitar a URL.

test("curso inexistente diz o que houve, em português, com link para a home", async () => {
  const html = await abrirCurso("nao-existe", []);
  expect(html).not.toContain("carregando…");
  expect(html).toContain("Curso não encontrado");
  expect(html).toContain('Não há curso com o endereço "nao-existe"');
  expect(html).toContain('href="/"');
  expect(html).toContain("Voltar para a home");
});

test("o slug da URL sai escapado na mensagem, não interpretado", async () => {
  const html = await abrirCurso('<img src=x onerror="1">', []);
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
});

test("curso que existe continua pintando a tela de curso", async () => {
  const html = await abrirCurso("c1", [{ slug: "c1", titulo: "Curso Um", estado: "completo", modulos: [] }]);
  expect(html).toContain("Curso Um");
  expect(html).toContain('class="arvore"');
  expect(html).not.toContain("Curso não encontrado");
});
