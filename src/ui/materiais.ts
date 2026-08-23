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
/**
 * \`geracao\` vem de \`pintarPalco\` (player.ts) e é a MESMA que a transcrição
 * recebe: um contador só para o palco inteiro. O contador próprio que existia
 * aqui só se defendia de markdown -> markdown; markdown -> vídeo passava
 * batido, e a resposta atrasada reescrevia o palco por cima do \`<video>\`.
 */
async function pintarMarkdown(geracao) {
  const palco = document.querySelector('.palco');

  // Capturado aqui, e não lido de \`atual\` depois do \`await\`: \`atual\` muda
  // assim que a pessoa abre outro item na árvore, e ler a variável global de
  // novo pintaria o material ERRADO — o mesmo defeito que \`ontimeupdate\`
  // já teve em player.ts, e que \`pintarPalco\` evita capturando \`item\` no
  // topo.
  const item = atual;

  const d = await (await fetch('/api/markdown?id=' + item.id)).json();
  if (!PALCO.vale(geracao)) return; // chegou tarde: o palco já é de outro item

  const p = dados.progresso[CHAVE(item.id)] || { segundos: 0, feito: false };

  palco.innerHTML =
    '<div class="cabeca"><h2>' + esc(item.titulo) + '</h2></div>' +
    '<div class="ferramentas"><button id="bFeito" data-item="' + item.id + '">' +
      (p.feito ? '✓ lido' : 'marcar como lido') + '</button></div>' +
    '<article class="md">' + d.html + '</article>';

  // Como no palco de vídeo: só \`marcar\`, porque \`refletirFeito\` (chamada no
  // fim de \`pintarArvore\`) já reescreve o rótulo. Aqui o \`pintarPalco()\` que
  // estava neste lugar custava ainda mais caro — ele refaz o \`fetch\` de
  // /api/markdown e a pessoa perde a posição de leitura do material.
  document.getElementById('bFeito').onclick = () => marcar(item.id, !feito(item.id));
}
`;
