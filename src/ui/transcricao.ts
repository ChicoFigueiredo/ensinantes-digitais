/**
 * A transcrição embaixo do vídeo, com trecho clicável.
 *
 * Clicar num trecho dá seek — é o que transforma a transcrição de "texto para
 * ler" em "índice do vídeo", que é o uso real: achar onde o professor falou
 * daquilo e voltar lá.
 */
export const TRANSCRICAO_JS = `
let trechos = [];

/**
 * Recebe \`item\` por parâmetro, e não lê \`atual\`: esta função roda depois de
 * um \`await\`, e nesse intervalo a pessoa pode ter trocado de aula. Ler
 * \`atual\` ali gravaria a anotação da aula ERRADA na chave da aula nova — o
 * mesmo defeito que \`pintarPalco\` já evita capturando \`item\` no topo.
 */
async function carregarTranscricao(item) {
  const alvo = document.getElementById('transcricao');
  if (!alvo || item?.tipo !== 'video') { trechos = []; return; }

  const d = await (await fetch('/api/transcricao?id=' + item.id)).json();
  trechos = d.trechos || [];
  const nota = dados.notas[CHAVE(item.id)] || '';

  alvo.className = 'transc';
  alvo.innerHTML = \`
    <div class="nota"><h3>Anotações</h3>
      <textarea id="nota" placeholder="o que você quer lembrar desta aula">\${esc(nota)}</textarea></div>
    <h3>Transcrição\${trechos.length ? '' : ' — ainda não transcrita'}</h3>
    <div id="trechos">\${trechos.map((t, i) =>
      \`<div class="trecho" data-i="\${i}"><span class="t tempo">\${relogio(t.inicio)}</span>
        <span>\${esc(t.texto)}</span></div>\`).join('')}</div>\`;

  document.querySelectorAll('.trecho').forEach(el => el.onclick = () => {
    const v = document.getElementById('v');
    if (v) { v.currentTime = trechos[Number(el.dataset.i)].inicio; v.play(); }
  });

  // Grava 800 ms depois da última tecla: sem isso cada letra vira uma
  // operação na fila, e a fila cresce mais rápido do que escoa.
  let timer;
  document.getElementById('nota').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() =>
      enfileirar({ tipo: 'nota', chave: CHAVE(item.id), texto: e.target.value }), 800);
  };
}

let ativoAtual = -1;
function destacarTrecho(segundos) {
  if (!trechos.length) return;
  let i = trechos.findIndex(t => segundos >= t.inicio && segundos < t.fim);
  if (i === ativoAtual) return;

  document.querySelector('.trecho.ativo')?.classList.remove('ativo');
  ativoAtual = i;
  if (i < 0) return;

  const el = document.querySelector('.trecho[data-i="' + i + '"]');
  if (el) { el.classList.add('ativo'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
`;
