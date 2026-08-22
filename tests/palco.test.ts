import { expect, test } from "bun:test";

import { criarGeracaoDoPalco } from "../src/ui/player.ts";
import { PAGINA } from "../src/ui/pagina.ts";

// Achado 2 da revisão final — terceira ocorrência da mesma família de defeito:
// resposta de rede que chega depois de a pessoa ter trocado de item e reescreve
// o palco com o conteúdo ANTERIOR. As duas ocorrências anteriores foram
// fechadas com uma guarda local por rota, e é justamente isso que deixa a troca
// CRUZADA passar: markdown -> vídeo.

test("a resposta da geração corrente vale", () => {
  const palco = criarGeracaoDoPalco();
  const g = palco.nova();
  expect(palco.vale(g)).toBe(true);
});

test("trocar de item invalida a resposta que já estava em voo", () => {
  const palco = criarGeracaoDoPalco();
  const emVoo = palco.nova(); // abriu o .md grande
  palco.nova();               // clicou na aula em vídeo antes de a resposta chegar
  expect(palco.vale(emVoo)).toBe(false);
});

test("uma geração só: trocar de item invalida as respostas de TODAS as rotas", () => {
  const palco = criarGeracaoDoPalco();

  // O item A saiu com uma resposta de /api/markdown e outra de
  // /api/transcricao pendentes — as duas na MESMA geração.
  const geracaoDeA = palco.nova();
  const markdownDeA = geracaoDeA;
  const transcricaoDeA = geracaoDeA;

  // A pessoa clica no item B.
  const geracaoDeB = palco.nova();

  expect(palco.vale(markdownDeA)).toBe(false);
  expect(palco.vale(transcricaoDeA)).toBe(false);
  expect(palco.vale(geracaoDeB)).toBe(true);
});

test("voltar para o item anterior não ressuscita a resposta velha dele", () => {
  const palco = criarGeracaoDoPalco();
  const primeiraDeA = palco.nova();
  palco.nova();          // foi para B
  const segundaDeA = palco.nova(); // voltou para A
  expect(palco.vale(primeiraDeA)).toBe(false);
  expect(palco.vale(segundaDeA)).toBe(true);
});

// Os testes acima provam a regra; os de baixo provam que a página usa a regra.
// Sem eles, `criarGeracaoDoPalco` viraria função testada e nunca chamada — que
// é o Achado 5 da mesma revisão.

test("a página leva a função de verdade, não uma cópia manuscrita dela", () => {
  expect(PAGINA).toContain(criarGeracaoDoPalco.toString());
});

test("pintarPalco abre geração nova, e as duas rotas assíncronas a conferem", () => {
  expect(PAGINA).toContain("const geracao = PALCO.nova();");
  // Uma conferência em materiais.ts (markdown) e outra em transcricao.ts.
  expect((PAGINA.match(/if \(!PALCO\.vale\(geracao\)\) return/g) ?? []).length).toBe(2);
});

test("não sobrou contador por rota, que é o que deixava a troca cruzada passar", () => {
  expect(PAGINA).not.toContain("tokenMarkdown");
  expect(PAGINA).not.toContain("tokenTranscricao");
});
