/**
 * O markdown de `Repo/` no palco, no lugar do vídeo.
 *
 * Reusa a árvore e a marcação de `curso.ts`/`player.ts`: material escrito é
 * item como qualquer outro, e a chave `i:<id>` já serve para "li isto".
 *
 * Sem template literal aninhado aqui — concatenação simples evita uma camada
 * de escape que já causou página em branco em projeto parecido.
 */
export const MATERIAIS_JS = `
// Conta chamadas de pintarMarkdown, mesma ideia de tokenTranscricao em
// transcricao.ts: trocar de material rápido pode fazer a resposta do
// material ANTERIOR (mais lento) chegar depois da do atual já estar na
// tela. Sem isto, essa resposta atrasada sobrescreveria o palco com o
// markdown errado.
let tokenMarkdown = 0;

async function pintarMarkdown() {
  const palco = document.querySelector('.palco');

  // Capturado aqui, e não lido de \`atual\` depois do \`await\`: \`atual\` muda
  // assim que a pessoa abre outro item na árvore, e ler a variável global de
  // novo pintaria o material ERRADO — o mesmo defeito que \`ontimeupdate\`
  // já teve em player.ts, e que \`pintarPalco\` evita capturando \`item\` no
  // topo.
  const item = atual;
  const meuToken = ++tokenMarkdown;

  const d = await (await fetch('/api/markdown?id=' + item.id)).json();
  if (meuToken !== tokenMarkdown) return; // chegou tarde: já não é o item da tela

  const p = dados.progresso[CHAVE(item.id)] || { segundos: 0, feito: false };

  palco.innerHTML =
    '<div class="cabeca"><h2>' + esc(item.titulo) + '</h2></div>' +
    '<div class="ferramentas"><button id="bFeito">' +
      (p.feito ? '✓ lido' : 'marcar como lido') + '</button></div>' +
    '<article class="md">' + d.html + '</article>';

  document.getElementById('bFeito').onclick = () => {
    marcar(item.id, !feito(item.id));
    pintarPalco();
  };
}
`;
