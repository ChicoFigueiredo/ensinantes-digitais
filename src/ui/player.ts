/**
 * O palco: vídeo, controles embutidos, marcação de visto, e a fila de escrita
 * que sobrevive à queda do túnel.
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

/**
 * Um ouvinte que morre junto com a aula que o criou.
 *
 * Resposta de rede fora de ordem não é a única forma de estado velho vazar
 * para a aula nova — EVENTO velho também vaza, e por um caminho pior, porque
 * o elemento que dispara já saiu do DOM e ninguém está olhando para ele:
 *
 * - o `<video>` anterior termina fora da tela, o `ended` dele encontra o
 *   autoplay ligado e navega para a "próxima" da aula ANTIGA — a pessoa
 *   escolheu a aula 7 e é jogada na 3;
 * - o `cuechange` da faixa anterior continua chegando e escreve a fala do
 *   vídeo antigo por cima da legenda da aula nova.
 *
 * Envolver o ouvinte aqui é a mesma disciplina do `vale(g)` depois do
 * `await`, aplicada a quem chega por evento em vez de por `await`. É de
 * propósito que a checagem fica no embrulho e não dentro de cada ouvinte:
 * ouvinte que se defende sozinho é ouvinte que alguém esquece de defender —
 * foi assim nas três ocorrências anteriores desta família de defeito.
 */
export function soDaGeracao<A extends unknown[]>(
  palco: { vale(g: number): boolean },
  geracao: number,
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    if (palco.vale(geracao)) fn(...args);
  };
}

/**
 * O próximo valor de uma roda de opções, voltando ao começo depois do último.
 *
 * Valor que não está na roda — preferência gravada por uma versão antiga, ou
 * dedo no console — recomeça do primeiro em vez de travar o chip: `indexOf`
 * devolve `-1`, e `-1 + 1` é o começo.
 */
export function proximoDaRoda<T>(roda: readonly T[], atual: T): T {
  return roda[(roda.indexOf(atual) + 1) % roda.length]!;
}

/** "1×", "1,25×" — com vírgula, que é como se escreve número em português. */
export function rotuloVelocidade(v: number): string {
  return String(v).replace(".", ",") + "×";
}

/** O que os chips do HUD mostram: cada um traz o estado atual no rótulo. */
export interface EstadoDoHud {
  velocidade: number;
  tamanhoLegenda: number;
  legendaLigada: boolean;
  autoplay: boolean;
}

/**
 * Os chips sobrepostos ao vídeo, no canto superior direito.
 *
 * Sem legenda no item, os chips `CC` e `Aa` não saem: não adianta oferecer
 * controle para o que não existe, e um `CC` que não acende nada é pior que
 * `CC` nenhum. Os outros três valem para qualquer vídeo.
 *
 * Nada de texto de usuário entra aqui — os rótulos são números e palavras
 * fixas —, por isso não há `esc` nesta função. O título da aula continua no
 * `<h2>` do palco, onde já é escapado.
 */
export function hudDoVideo(temLegenda: boolean, e: EstadoDoHud): string {
  const chips = [
    `<button class="chip num" id="bVel"
       title="Velocidade — vale para as próximas aulas e para os seus outros aparelhos"
       >${rotuloVelocidade(e.velocidade)}</button>`,
  ];

  if (temLegenda) {
    chips.push(`<button class="chip${e.legendaLigada ? " on" : ""}" id="bCC"
      title="${e.legendaLigada ? "Legenda ligada — clique para desligar" : "Legenda desligada — clique para ligar"}"
      >CC</button>`);
    chips.push(`<button class="chip num" id="bTam"
      title="Tamanho da legenda: ${e.tamanhoLegenda}px — o mesmo em tela cheia"
      >Aa ${e.tamanhoLegenda}</button>`);
  }

  chips.push(`<button class="chip${e.autoplay ? " on" : ""}" id="bAuto"
    title="${e.autoplay ? "Ao terminar, emenda na próxima aula" : "Ao terminar, para nesta aula"}"
    >${e.autoplay ? "Auto ▶" : "Auto —"}</button>`);

  chips.push(`<button class="chip" id="bTela" title="Tela cheia (F)">⛶</button>`);

  return `<div class="hud">${chips.join("")}</div>`;
}

/**
 * As linhas da fala do momento, a partir do texto cru das cues.
 *
 * Uma cue de WebVTT pode ter várias linhas, e mais de uma cue pode estar ativa
 * ao mesmo tempo (fala emendada). Quebra tudo por linha, tira o que é só
 * espaço — sem isto uma cue terminada em quebra de linha vira uma linha em
 * branco, que na tela aparece como uma tarja vazia embaixo da fala.
 *
 * `\r?\n` porque o `.srt` do acervo vem com fim de linha de Windows, e o `\r`
 * que sobra é invisível no código e visível na tela como um espaço extra
 * dentro da tarja.
 */
export function linhasDaLegenda(textos: string[]): string[] {
  return textos.flatMap((t) => t.split(/\r?\n/)).map((l) => l.trim()).filter((l) => l.length > 0);
}

export const PLAYER_JS = `
const FILA = 'ed.fila';

// A MESMA função de src/ui/player.ts, não uma cópia manuscrita dela.
const PALCO = (${criarGeracaoDoPalco.toString()})();

${soDaGeracao.toString()}
${proximoDaRoda.toString()}
${rotuloVelocidade.toString()}
${hudDoVideo.toString()}
${linhasDaLegenda.toString()}

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
      // O que o servidor devolveu pode ter vindo do outro aparelho.
      aplicarPrefsDoServidor(d.prefs);
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

// --- preferências do player -------------------------------------------------
// Velocidade, autoplay, tamanho da legenda e liga/desliga seguem a PESSOA, não
// o aparelho: vão para o banco pela fila (tabela \`prefs\`, chave
// \`(usuario, nome)\`) e voltam nas outras telas por \`/api/tudo\`. O
// localStorage fica como cache — é o que faz o chip responder no clique, sem
// esperar a rede, e a página abrir já no jeito certo.
//
// Quem mexeu por último manda. Para uma pessoa com um tablet e um PC isso é o
// certo quase sempre, e é o comportamento que o resto da fila já tem.

const CHAVES_PREF = {
  velocidade: 'ed.velocidade',
  legenda: 'ed.legenda',
  legendaLigada: 'ed.legendaLigada',
  autoplay: 'ed.autoplay',
};

const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const TAMANHOS_LEGENDA = [15, 18, 22, 27];

/** O cache local primeiro; sem ele, o que veio do servidor. */
function lerPref(nome) {
  const local = localStorage.getItem(CHAVES_PREF[nome]);
  return local !== null ? local : (dados?.prefs?.[nome] ?? null);
}

/**
 * Grava a preferência: no localStorage sempre, na fila só quando a mudança
 * NASCEU aqui.
 *
 * \`deOutroAparelho\` é o que impede o eco. Aplicar o que acabou de chegar do
 * servidor sem essa marca devolveria a mesma preferência para a fila, o outro
 * aparelho receberia de volta, aplicaria, devolveria — dois aparelhos abertos
 * ficariam trocando o mesmo valor a cada 8 s para sempre.
 */
function definirPref(nome, valor, deOutroAparelho) {
  const texto = String(valor);
  localStorage.setItem(CHAVES_PREF[nome], texto);
  if (deOutroAparelho) { if (dados) dados.prefs[nome] = texto; return; }
  enfileirar({ tipo: 'pref', nome, valor: texto });
}

/** O que \`/api/sync\` devolveu — pode ter nascido no outro aparelho. */
function aplicarPrefsDoServidor(prefs) {
  for (const nome in CHAVES_PREF) {
    const valor = prefs?.[nome];
    if (valor != null && String(valor) !== lerPref(nome)) definirPref(nome, valor, true);
  }
  refletirHud();
}

const daRoda = (roda, valor, padrao) => roda.includes(valor) ? valor : padrao;
const velocidade = () => daRoda(VELOCIDADES, Number(lerPref('velocidade')), 1);
const tamanhoLegenda = () => daRoda(TAMANHOS_LEGENDA, Number(lerPref('legenda')), 18);
// Legenda LIGADA por padrão (só '0' desliga); autoplay DESLIGADO por padrão
// (só '1' liga): emendar sozinho na próxima aula é escolha, não surpresa.
const legendaLigada = () => lerPref('legendaLigada') !== '0';
const autoplayLigado = () => lerPref('autoplay') === '1';

const estadoDoHud = () => ({
  velocidade: velocidade(), tamanhoLegenda: tamanhoLegenda(),
  legendaLigada: legendaLigada(), autoplay: autoplayLigado(),
});

/** Põe na tela o que as preferências dizem — depois de um clique ou da rede. */
function refletirHud() {
  const e = estadoDoHud();
  const v = document.getElementById('v');
  if (v) v.playbackRate = e.velocidade;

  // Na RAIZ do documento, e não no palco: a propriedade herda, e continua
  // valendo quando a cena vai para tela cheia — em tela cheia o palco não é
  // mais ancestral de nada que importe. Em px, e não em %, de propósito: a
  // legenda não deve encolher junto com a janela.
  document.documentElement?.style?.setProperty('--tamleg', e.tamanhoLegenda + 'px');

  const bVel = document.getElementById('bVel');
  if (bVel) bVel.textContent = rotuloVelocidade(e.velocidade);

  const bTam = document.getElementById('bTam');
  if (bTam) {
    bTam.textContent = 'Aa ' + e.tamanhoLegenda;
    bTam.title = 'Tamanho da legenda: ' + e.tamanhoLegenda + 'px — o mesmo em tela cheia';
  }

  const bCC = document.getElementById('bCC');
  if (bCC) {
    bCC.classList.toggle('on', e.legendaLigada);
    bCC.title = e.legendaLigada
      ? 'Legenda ligada — clique para desligar'
      : 'Legenda desligada — clique para ligar';
  }

  const bAuto = document.getElementById('bAuto');
  if (bAuto) {
    bAuto.textContent = e.autoplay ? 'Auto ▶' : 'Auto —';
    bAuto.classList.toggle('on', e.autoplay);
    bAuto.title = e.autoplay
      ? 'Ao terminar, emenda na próxima aula'
      : 'Ao terminar, para nesta aula';
  }

  aplicarFaixas();
}

// --- legenda desenhada por nós ----------------------------------------------
/**
 * O \`<track>\` continua lá, mas em \`mode = 'hidden'\`: a faixa segue marcando a
 * fala do momento (é o que dispara \`cuechange\`) e o navegador não desenha
 * nada. Quem pinta é a \`div.legenda\`.
 *
 * O MOTIVO, que ninguém adivinha olhando o código: estilizar a legenda nativa
 * (\`video::cue\`) NÃO funciona de verdade — as preferências de legenda do
 * sistema operacional e do navegador (tamanho, cor, fundo) entram por cima da
 * regra da página. Sem esta troca, o chip "Aa" mudaria a regra e nada mudaria
 * na tela, e o "CC" não conseguiria apagar a legenda de vez. Parece
 * complicação à toa; é o que faz os dois chips obedecerem.
 *
 * Em \`'showing'\` o navegador desenharia a legenda DELE por cima da nossa, em
 * dobro — por isso 'hidden' e nunca 'showing'. E o menu nativo do player deixa
 * a pessoa religar a faixa: por isso \`textTracks\` avisa em 'change' e a gente
 * volta para 'hidden'. Desligar de vez é 'disabled', e aí não há fala corrente
 * nenhuma e a div fica vazia sozinha.
 */
function aplicarFaixas() {
  const v = document.getElementById('v');
  if (!v || !v.textTracks) return;
  const modo = legendaLigada() ? 'hidden' : 'disabled';
  for (const t of v.textTracks) if (t.mode !== modo) t.mode = modo;
  pintarLegenda();
}

/** Põe a fala do momento na div, numa <span> só para o fundo colar no texto. */
function pintarLegenda() {
  const el = document.getElementById('legenda');
  if (!el) return;
  const v = document.getElementById('v');
  const textos = [];
  for (const t of (v?.textTracks || [])) {
    if (t.mode === 'disabled') continue;
    for (const c of (t.activeCues || [])) textos.push(c.text);
  }
  const linhas = linhasDaLegenda(textos);
  el.innerHTML = linhas.length ? '<span>' + linhas.map(esc).join('<br>') + '</span>' : '';
}

// --- tela cheia -------------------------------------------------------------
/**
 * Tela cheia vai na CENA, nunca no \`<video>\`: mandando o vídeo, o HUD, as
 * setas e a legenda ficam de fora — todos são irmãos do \`<video>\`, não filhos.
 * É por isso que o CSS esconde o botão nativo de tela cheia do player.
 */
function alternarTelaCheia() {
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  document.getElementById('cena')?.requestFullscreen?.();
}

// Registrados UMA vez, no carregamento, e não a cada \`pintarPalco\`: ouvinte de
// documento registrado por aula empilharia uma cópia a cada troca. Eles não
// guardam nada da aula — leem a cena do DOM na hora do evento —, então não há
// closure velha para invalidar.
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
  if ((e.key || '').toLowerCase() !== 'f') return;
  if (!document.getElementById('cena')) return;
  e.preventDefault();
  alternarTelaCheia();
});

// Reserva: se algo puser o VÍDEO em tela cheia — menu de contexto, ou navegador
// que ignore o seletor que esconde o botão nativo —, troca pela cena. Sem isto
// a pessoa cai numa tela cheia sem HUD e sem legenda, que é o estado que este
// desenho inteiro existe para evitar.
document.addEventListener('fullscreenchange', () => {
  const v = document.getElementById('v');
  const cena = document.getElementById('cena');
  if (!v || !cena || document.fullscreenElement !== v) return;
  document.exitFullscreen?.()?.then?.(() => cena.requestFullscreen?.())?.catch?.(() => {});
});

function pintarPalco() {
  const palco = document.querySelector('.palco');

  // O <video> anterior continua tocando depois de sair do DOM — pausar antes de
  // trocar evita áudio fantasma e um \`ontimeupdate\` órfão gravando progresso.
  document.getElementById('v')?.pause();

  // Geração nova a cada repintura, ANTES de qualquer coisa: toda resposta que
  // já estava em voo — markdown ou transcrição — perde a validade aqui, mesmo
  // a de uma rota diferente da que a pessoa está deixando. E todo ouvinte
  // embrulhado em \`meu()\` na repintura ANTERIOR deixa de valer junto.
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

  /** Todo ouvinte desta repintura passa por aqui — ver \`soDaGeracao\`. */
  const meu = (fn) => soDaGeracao(PALCO, geracao, fn);

  const p = dados.progresso[CHAVE(item.id)] || { segundos: 0, feito: false };

  const midia = item.tipo === 'video'
    ? \`<div class="cena" id="cena">
         <video id="v" controls preload="metadata" src="/api/video?id=\${item.id}">
           \${item.temLegenda ? \`<track default kind="subtitles" srclang="pt" label="Português"
                                       src="/api/legenda?id=\${item.id}">\` : ''}
         </video>
         <div class="legenda" id="legenda"></div>
         <div class="nav">
           <button id="bAnt" title="Aula anterior">‹</button>
           <button id="bProx" title="Próxima aula">›</button>
         </div>
         \${hudDoVideo(item.temLegenda, estadoDoHud())}
       </div>\`
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
      \${dados.permissoes.verCaminhos && item.relPath
        ? '<button id="bRevelar">mostrar na pasta</button>' : ''}
    </div>
    <div id="transcricao"></div>\`;

  document.getElementById('bFeito').onclick = meu(() => { marcar(item.id, !feito(item.id)); pintarPalco(); });

  const v = document.getElementById('v');
  if (v) {
    // A cada 5 s, e não a cada timeupdate: o evento dispara ~4x por segundo, e
    // gravar nessa frequência enche a fila sem ganhar precisão nenhuma.
    let ultimo = 0;
    v.ontimeupdate = meu(() => {
      if (v.currentTime - ultimo < 5) return;
      ultimo = v.currentTime;
      enfileirar({ tipo: 'progresso', chave: CHAVE(item.id), segundos: v.currentTime, feito: feito(item.id) });
      destacarTrecho(v.currentTime);
    });

    // A marca de visto vai ANTES do pulo: assistir até o fim é o que fecha a
    // aula, e depois do pulo \`atual\` já é a seguinte.
    v.onended = meu(() => {
      marcar(item.id, true);
      const prox = autoplayLigado() && vizinho(item.id, 1);
      if (prox) abrir(prox.id); else pintarPalco();
    });

    for (const t of (v.textTracks || [])) t.addEventListener?.('cuechange', meu(pintarLegenda));
    // Duas vezes, e não é redundância: o \`default\` do <track> faz o navegador
    // pôr a faixa em 'showing' quando a mídia carrega, DEPOIS de a gente já ter
    // escondido no desenho. A 'change' pega a religada pelo menu nativo do
    // player; o 'loadedmetadata' pega a do próprio navegador.
    v.textTracks?.addEventListener?.('change', meu(aplicarFaixas));
    v.onloadedmetadata = meu(aplicarFaixas);

    const chip = (id, aoClicar) => {
      const el = document.getElementById(id);
      if (el) el.onclick = meu(aoClicar);
    };
    chip('bVel', () => { definirPref('velocidade', proximoDaRoda(VELOCIDADES, velocidade())); refletirHud(); });
    chip('bTam', () => { definirPref('legenda', proximoDaRoda(TAMANHOS_LEGENDA, tamanhoLegenda())); refletirHud(); });
    chip('bCC', () => { definirPref('legendaLigada', legendaLigada() ? '0' : '1'); refletirHud(); });
    chip('bAuto', () => { definirPref('autoplay', autoplayLigado() ? '0' : '1'); refletirHud(); });
    chip('bTela', () => alternarTelaCheia());

    // Sem vizinho a seta some (CSS), em vez de ficar lá clicável sem destino.
    for (const [id, passo] of [['bAnt', -1], ['bProx', 1]]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const alvo = vizinho(item.id, passo);
      el.disabled = !alvo;
      el.onclick = meu(() => { if (alvo) abrir(alvo.id); });
    }

    // Depois dos chips: é ele que acerta velocidade, --tamleg e o modo das
    // faixas a partir das preferências, num lugar só.
    refletirHud();
    if (p.segundos > 5) v.currentTime = p.segundos;

    const bRev = document.getElementById('bRevelar');
    if (bRev) bRev.onclick = meu(() => fetch('/api/revelar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    }));
  }

  carregarTranscricao(item, geracao);
}
`;
