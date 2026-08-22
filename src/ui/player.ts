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

  // O <video> anterior continua tocando depois de sair do DOM — pausar antes de
  // trocar evita áudio fantasma e um \`ontimeupdate\` órfão gravando progresso.
  document.getElementById('v')?.pause();

  if (!atual) { palco.innerHTML = '<div class="cabeca"><h2>Módulo sem material</h2></div>'; return; }

  // Capturado aqui, e não lido de \`atual\` dentro dos handlers: \`atual\` muda
  // assim que a pessoa clica em outra aula, e um handler que ainda esteja vivo
  // gravaria o tempo DESTE vídeo na chave da aula NOVA.
  const item = atual;

  const p = dados.progresso[CHAVE(item.id)] || { segundos: 0, feito: false };
  const vel = Number(dados.prefs.velocidade || 1);

  const midia = item.tipo === 'video'
    ? \`<video id="v" controls preload="metadata" src="/api/video?id=\${item.id}"
              \${item.temLegenda ? '' : 'data-sem-legenda'}>
         \${item.temLegenda ? \`<track default kind="subtitles" srclang="pt" label="Português"
                                       src="/api/legenda?id=\${item.id}">\` : ''}
       </video>\`
    : \`<div class="cabeca"><a class="cartao" href="/api/arquivo?id=\${item.id}" target="_blank">
         Abrir \${esc(item.titulo)}</a></div>\`;

  palco.innerHTML = midia + \`
    <div class="cabeca"><h2>\${esc(item.titulo)}</h2></div>
    <div class="ferramentas">
      <button id="bFeito">\${p.feito ? '✓ visto' : 'marcar como visto'}</button>
      \${item.tipo === 'video' ? '<button id="bVel" class="num">' + vel + '×</button>' : ''}
      \${dados.permissoes.verCaminhos && item.relPath
        ? '<button id="bRevelar">mostrar na pasta</button>' : ''}
    </div>
    <div id="transcricao"></div>\`;

  document.getElementById('bFeito').onclick = () => { marcar(item.id, !feito(item.id)); pintarPalco(); };

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
      enfileirar({ tipo: 'progresso', chave: CHAVE(item.id), segundos: v.currentTime, feito: feito(item.id) });
      destacarTrecho(v.currentTime);
    };
    v.onended = () => { marcar(item.id, true); pintarPalco(); };

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
      body: JSON.stringify({ id: item.id }),
    });
  }

  carregarTranscricao(item);
}
`;
