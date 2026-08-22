/**
 * A transcrição embaixo do vídeo, com trecho clicável.
 *
 * Clicar num trecho dá seek — é o que transforma a transcrição de "texto para
 * ler" em "índice do vídeo", que é o uso real: achar onde o professor falou
 * daquilo e voltar lá.
 */
export const TRANSCRICAO_JS = `
let trechos = [];
let ativoAtual = -1;

// Conta chamadas de carregarTranscricao. pintarPalco não espera esta função
// terminar, e trocar de aula rápido dispara outra antes da primeira voltar da
// rede — não há garantia de que as respostas cheguem na ordem em que saíram.
let tokenTranscricao = 0;

/**
 * Recebe \`item\` por parâmetro, e não lê \`atual\`: esta função roda depois de
 * um \`await\`, e nesse intervalo a pessoa pode ter trocado de aula. Ler
 * \`atual\` ali gravaria a anotação da aula ERRADA na chave da aula nova — o
 * mesmo defeito que \`pintarPalco\` já evita capturando \`item\` no topo.
 *
 * Isso protege contra \`atual\` mudar, mas não contra uma resposta de rede
 * fora de ordem: abrir a aula A (lenta) e trocar rápido para B (rápida) pode
 * fazer a resposta de A chegar DEPOIS da de B já estar na tela. Sem o token
 * abaixo, essa resposta atrasada sobrescreveria \`trechos\` com o array de A
 * e religaria o \`oninput\` da anotação — visível na tela como aula B, mas
 * gravando na chave de A. O token de sequência descarta qualquer resposta
 * que não seja mais a mais recente disparada.
 */
async function carregarTranscricao(item) {
  const alvo = document.getElementById('transcricao');
  if (!alvo || item?.tipo !== 'video') { trechos = []; ativoAtual = -1; return; }

  const meuToken = ++tokenTranscricao;

  const d = await (await fetch('/api/transcricao?id=' + item.id)).json();
  if (meuToken !== tokenTranscricao) return;   // chegou tarde: já não é a aula da tela

  trechos = d.trechos || [];
  ativoAtual = -1;   // DOM novo: nenhum trecho está destacado ainda
  const nota = dados.notas[CHAVE(item.id)] || '';

  alvo.className = 'transc';
  alvo.innerHTML = \`
    <div class="nota"><h3>Anotações</h3>
      <textarea id="nota" placeholder="o que você quer lembrar desta aula">\${esc(nota)}</textarea></div>
    <h3>Transcrição\${trechos.length ? '' : ' — ainda não transcrita'}</h3>
    <div id="trechos">\${trechos.map((t, i) =>
      \`<div class="trecho" data-i="\${i}"><span class="t tempo">\${relogio(t.inicio)}</span>
        <span>\${esc(t.texto)}</span></div>\`).join('')}</div>\`;

  alvo.querySelectorAll('.trecho').forEach(el => el.onclick = () => {
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

function destacarTrecho(segundos) {
  if (!trechos.length) return;
  let i = trechos.findIndex(t => segundos >= t.inicio && segundos < t.fim);
  if (i === ativoAtual) return;

  document.getElementById('trechos')?.querySelector('.trecho.ativo')?.classList.remove('ativo');
  ativoAtual = i;
  if (i < 0) return;

  const el = document.getElementById('trechos')?.querySelector('.trecho[data-i="' + i + '"]');
  if (el) { el.classList.add('ativo'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
`;
