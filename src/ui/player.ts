/**
 * O palco: vídeo, marcação de visto, e a fila de escrita que sobrevive à
 * queda do túnel.
 *
 * A fila é o detalhe que mais importa aqui. Marcar aula como vista pelo tablet,
 * com o túnel piscando, tem de continuar valendo quando a conexão volta — por
 * isso toda escrita entra numa fila no localStorage e só sai de lá quando o
 * servidor confirma. Reenviar o mesmo lote é inofensivo: cada operação é
 * "deixe assim", nunca "some mais um".
 */
export const PLAYER_JS = `
const FILA = 'ed.fila';

function enfileirar(op) {
  const f = JSON.parse(localStorage.getItem(FILA) || '[]');
  f.push(op);
  localStorage.setItem(FILA, JSON.stringify(f));
  aplicarLocal(op);
  escoar();
}

/** Efeito imediato na tela, sem esperar a rede. */
function aplicarLocal(op) {
  if (op.tipo === 'progresso') dados.progresso[op.chave] = { segundos: op.segundos, feito: op.feito };
  if (op.tipo === 'nota') { if (op.texto.trim()) dados.notas[op.chave] = op.texto; else delete dados.notas[op.chave]; }
  if (op.tipo === 'pref') dados.prefs[op.nome] = op.valor;
}

let escoando = false;
async function escoar() {
  if (escoando) return;
  const ops = JSON.parse(localStorage.getItem(FILA) || '[]');
  if (!ops.length) return;
  escoando = true;
  try {
    const r = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (r.ok) {
      const d = await r.json();
      dados.progresso = d.progresso; dados.notas = d.notas; dados.prefs = d.prefs;
      // Só limpa o que este lote continha: o que entrou na fila durante a
      // viagem fica para a próxima rodada.
      const restante = JSON.parse(localStorage.getItem(FILA) || '[]').slice(ops.length);
      localStorage.setItem(FILA, JSON.stringify(restante));
      pintarArvore();
    }
  } catch (e) { /* sem rede: fica na fila e tenta de novo */ }
  escoando = false;
}
setInterval(escoar, 8000);
addEventListener('online', escoar);

function marcar(id, valor) {
  const p = dados.progresso[CHAVE(id)] || { segundos: 0, feito: false };
  enfileirar({ tipo: 'progresso', chave: CHAVE(id), segundos: p.segundos, feito: valor });
  pintarArvore();
}

const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];

function pintarPalco() {
  const palco = document.querySelector('.palco');
  if (!atual) { palco.innerHTML = '<div class="cabeca"><h2>Módulo sem material</h2></div>'; return; }

  const p = dados.progresso[CHAVE(atual.id)] || { segundos: 0, feito: false };
  const vel = Number(dados.prefs.velocidade || 1);

  const midia = atual.tipo === 'video'
    ? \`<video id="v" controls preload="metadata" src="/api/video?id=\${atual.id}"
              \${atual.temLegenda ? '' : 'data-sem-legenda'}>
         \${atual.temLegenda ? \`<track default kind="subtitles" srclang="pt" label="Português"
                                       src="/api/legenda?id=\${atual.id}">\` : ''}
       </video>\`
    : \`<div class="cabeca"><a class="cartao" href="/api/arquivo?id=\${atual.id}" target="_blank">
         Abrir \${esc(atual.titulo)}</a></div>\`;

  palco.innerHTML = midia + \`
    <div class="cabeca"><h2>\${esc(atual.titulo)}</h2></div>
    <div class="ferramentas">
      <button id="bFeito">\${p.feito ? '✓ visto' : 'marcar como visto'}</button>
      \${atual.tipo === 'video' ? '<button id="bVel" class="num">' + vel + '×</button>' : ''}
      \${dados.permissoes.verCaminhos && atual.relPath
        ? '<button id="bRevelar">mostrar na pasta</button>' : ''}
    </div>
    <div id="transcricao"></div>\`;

  document.getElementById('bFeito').onclick = () => { marcar(atual.id, !feito(atual.id)); pintarPalco(); };

  const v = document.getElementById('v');
  if (v) {
    v.playbackRate = vel;
    if (p.segundos > 5) v.currentTime = p.segundos;

    // A cada 5 s, e não a cada timeupdate: o evento dispara ~4x por segundo, e
    // gravar nessa frequência enche a fila sem ganhar precisão nenhuma.
    let ultimo = 0;
    v.ontimeupdate = () => {
      if (v.currentTime - ultimo < 5) return;
      ultimo = v.currentTime;
      enfileirar({ tipo: 'progresso', chave: CHAVE(atual.id), segundos: v.currentTime, feito: feito(atual.id) });
      destacarTrecho(v.currentTime);
    };
    v.onended = () => { marcar(atual.id, true); pintarPalco(); };

    const bVel = document.getElementById('bVel');
    if (bVel) bVel.onclick = () => {
      const prox = VELOCIDADES[(VELOCIDADES.indexOf(v.playbackRate) + 1) % VELOCIDADES.length];
      v.playbackRate = prox;
      bVel.textContent = prox + '×';
      enfileirar({ tipo: 'pref', nome: 'velocidade', valor: String(prox) });
    };

    const bRev = document.getElementById('bRevelar');
    if (bRev) bRev.onclick = () => fetch('/api/revelar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: atual.id }),
    });
  }

  carregarTranscricao();
}

/**
 * A transcrição de verdade chega na Tarefa 12. Este no-op existe porque
 * \`pintarPalco\` já a chama, e um \`ReferenceError\` aqui deixa a tela de curso
 * em branco sem aviso nenhum no terminal.
 */
function carregarTranscricao() {}

/**
 * Idem: \`ontimeupdate\` já chama \`destacarTrecho\` para acompanhar a
 * transcrição durante a reprodução. Sem este no-op o vídeo continua tocando
 * (o erro fica isolado dentro do handler), mas a cada 5 s o console recebe um
 * \`ReferenceError\` gratuito. A Tarefa 12 substitui pela versão real.
 */
function destacarTrecho() {}
`;
