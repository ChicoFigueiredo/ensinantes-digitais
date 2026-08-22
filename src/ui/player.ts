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
/**
 * A geração do palco: UM contador para todas as respostas em voo.
 *
 * O palco tem duas rotas assíncronas pintando dentro dele — `/api/markdown`
 * (materiais.ts) e `/api/transcricao` (transcricao.ts) — e cada uma tinha seu
 * próprio contador, que só se defendia contra si mesma. O que derruba a tela é
 * a troca CRUZADA: abrir um `.md` grande, clicar numa aula em vídeo antes da
 * resposta chegar, e ver o markdown do item anterior reescrever o palco por
 * cima do `<video>` — com o botão "marcar como lido" ligado ao id ANTERIOR,
 * enquanto a árvore à esquerda mostra a aula certa como corrente.
 *
 * Por isso a geração é uma só e é incrementada em `pintarPalco`: trocar de
 * item invalida o que está em voo em QUALQUER rota, não só na rota que a
 * pessoa está deixando. Isto é a terceira ocorrência da mesma família de
 * defeito no projeto (closure velha em `ontimeupdate`, respostas de
 * `/api/transcricao` fora de ordem) — as duas anteriores nasceram de guardas
 * locais, cada uma cuidando do seu pedaço.
 *
 * A função é exportada e vai para o navegador por `toString()`, e não
 * redigitada dentro da string: assim o que os testes exercitam é exatamente o
 * que roda na página.
 */
export function criarGeracaoDoPalco() {
  let geracao = 0;
  return {
    /** Uma troca de item. Tudo que saiu para a rede antes disto deixa de valer. */
    nova: (): number => ++geracao,
    /** A resposta que saiu na geração `g` ainda é a do que está na tela? */
    vale: (g: number): boolean => g === geracao,
  };
}

export const PLAYER_JS = `
const FILA = 'ed.fila';

// A MESMA função de src/ui/player.ts, não uma cópia manuscrita dela.
const PALCO = (${criarGeracaoDoPalco.toString()})();

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

  // Geração nova a cada repintura, ANTES de qualquer coisa: toda resposta que
  // já estava em voo — markdown ou transcrição — perde a validade aqui, mesmo
  // a de uma rota diferente da que a pessoa está deixando.
  const geracao = PALCO.nova();

  if (!atual) { palco.innerHTML = '<div class="cabeca"><h2>Módulo sem material</h2></div>'; return; }

  // Markdown de Repo/ tem palco próprio (materiais.ts): sem vídeo, sem
  // velocidade, sem transcrição. Sai daqui antes de qualquer coisa que
  // pressuponha <video>.
  if (atual.tipo === 'markdown') { pintarMarkdown(geracao); return; }

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
    // Item de link (.url) abre o SITE. Sem isto o clique ia para
    // /api/arquivo, que servia o próprio .url como octet-stream: 47 bytes de
    // arquivo INI baixados em vez do site aberto, nos 12 links do acervo.
    // \`rel="noopener"\` porque o destino é externo e abre em outra aba.
    : \`<div class="cabeca"><a class="cartao" href="\${esc(item.alvo || '/api/arquivo?id=' + item.id)}"
         target="_blank" rel="noopener">Abrir \${esc(item.titulo)}</a></div>\`;

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

  carregarTranscricao(item, geracao);
}
`;
