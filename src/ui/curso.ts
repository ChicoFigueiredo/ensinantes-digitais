/**
 * A tela de curso: árvore à esquerda, palco à direita.
 *
 * O estado vive em `dados` e `atual`, dois módulos no escopo do script. Não há
 * framework e não precisa haver: são duas listas e um vídeo, e cada repintura
 * é uma atribuição de innerHTML sobre um nó pequeno.
 */

/**
 * Qual item abre quando a pessoa entra no curso sem retomar nada (sem `#i`
 * na URL, ou apontando para um id que não existe mais).
 *
 * Vídeo primeiro é certo para curso de verdade: pula PDF solto no meio da
 * ordem e cai direto na aula. Mas a seção "Materiais" (a pasta `Repo/` do
 * acervo) não tem um único vídeo — só dez `.md` — e sem fallback isso dava
 * `null`, e o palco anunciava "Módulo sem material" com os dez materiais
 * listados do lado. Sem vídeo nenhum no curso, abre o primeiro item de
 * qualquer tipo.
 *
 * Esta função é a que roda no navegador: `CURSO_JS` a embute por `toString()`
 * logo abaixo. Havia uma cópia manuscrita dela dentro da string, e os três
 * testes daqui davam confiança sobre a versão que NÃO rodava — mudar a regra
 * num lado e esquecer do outro passava verde.
 */
export function escolherItemInicial<T extends { tipo: string }>(itens: T[]): T | null {
  return itens.find((i) => i.tipo === "video") ?? itens[0] ?? null;
}

/**
 * O item vizinho na ordem em que a árvore mostra — o anterior (`-1`) ou o
 * próximo (`+1`) —, ou `null` quando não há.
 *
 * A lista chega achatada, atravessando módulo: a última aula de um módulo
 * emenda na primeira do seguinte, que é o que a pessoa espera das setas e do
 * autoplay. E o vizinho é o vizinho de qualquer tipo, não o próximo VÍDEO:
 * pular o PDF que o professor pôs no meio da ordem seria decidir por ela o
 * que faz parte do curso.
 */
export function vizinhoNaLista<T extends { id: number }>(
  itens: T[], id: number, passo: number,
): T | null {
  const i = itens.findIndex((x) => x.id === id);
  return i < 0 ? null : (itens[i + passo] ?? null);
}

/** O que a caixa de "marcar tudo" e o contador de um módulo precisam saber. */
export interface EstadoDoModulo {
  /** Quantas aulas do módulo já foram vistas. */
  feitas: number;
  total: number;
  /** Todas vistas: a caixa do módulo nasce marcada. */
  todos: boolean;
  /** Algumas — nem nenhuma, nem todas: é o traço do `indeterminate`. */
  parcial: boolean;
}

/**
 * O estado agregado de um módulo, que a árvore mostra em três lugares de uma
 * vez: o `checked` da caixa do cabeçalho, o traço de `indeterminate` quando é
 * parcial, e o contador `✓ 3/12` ao lado do título.
 *
 * Os três saem da MESMA contagem de propósito. Caixa marcada com contador
 * dizendo `3/12` é o tipo de desencontro que aparece quando cada um se decide
 * por conta própria.
 *
 * Módulo vazio não é módulo "todo visto": `todos` exige ao menos um item. Sem
 * isso um módulo sem itens nasceria com a caixa marcada — e clicar nela não
 * faria nada, porque não há o que marcar.
 *
 * Esta função é a que roda no navegador: `CURSO_JS` a embute por `toString()`.
 */
export function estadoDoModulo<T extends { id: number }>(
  itens: T[], feito: (id: number) => boolean,
): EstadoDoModulo {
  const total = itens.length;
  const feitas = itens.filter((i) => feito(i.id)).length;
  return {
    feitas,
    total,
    todos: total > 0 && feitas === total,
    parcial: feitas > 0 && feitas < total,
  };
}

export const CURSO_JS = `
let dados = null, atual = null;

// As MESMAS funções de src/ui/curso.ts, não cópias delas.
${escolherItemInicial.toString()}
${vizinhoNaLista.toString()}
${estadoDoModulo.toString()}

/** A lista achatada que as setas e o autoplay percorrem. */
const itensEmOrdem = () => (dados?.arvore[0]?.modulos || []).flatMap(m => m.itens);
const vizinho = (id, passo) => vizinhoNaLista(itensEmOrdem(), id, passo);

const CHAVE = id => 'i:' + id;
const feito = id => !!(dados?.progresso[CHAVE(id)]?.feito);

/**
 * A caixa de seleção de uma aula.
 *
 * Ela é o controle, não um enfeite: marcar deixa de exigir abrir a aula e
 * descer até o botão do palco. O clique nela PARA nela — o
 * \`stopPropagation\` é ligado em \`pintarArvore\`, e sem ele marcar navegaria
 * junto, porque o clique na LINHA abre a aula.
 *
 * O \`title\` muda com o estado porque a caixa não tem rótulo escrito ao lado:
 * "Marcar como vista" numa caixa já marcada seria uma mentira pequena e
 * diária.
 */
function caixaDeAula(item) {
  const visto = feito(item.id);
  return \`<input type="checkbox" class="caixa" data-id="\${item.id}" \${visto ? 'checked' : ''}
    title="\${visto ? 'Vista — clique para desmarcar' : 'Marcar como vista'}">\`;
}

/**
 * A marca ao lado do título diz o TIPO — ▸ para vídeo, · para o resto.
 *
 * Ela era ✓/▸/· e acumulava duas informações no mesmo caractere. Com a caixa
 * de seleção à esquerda, o ✓ ali seria um segundo visto ao lado do primeiro; o
 * tipo, esse não tem outro lugar onde apareça. Quem continua dizendo "vista" é
 * a classe \`feita\`, que pinta a linha de verde no CSS.
 */
function linhaDeAula(item) {
  const marca = item.tipo === 'video' ? '▸' : '·';
  const dur = item.duracao ? relogio(item.duracao) : '';
  return \`<div class="aula \${feito(item.id) ? 'feita' : ''} \${atual?.id === item.id ? 'corrente' : ''}"
               data-id="\${item.id}" id="i\${item.id}">
    \${caixaDeAula(item)}
    <span class="marca">\${marca}</span>
    <span>\${esc(item.titulo)}</span>
    <span class="dur tempo">\${dur}</span>
  </div>\`;
}

/**
 * O cabeçalho do módulo: caixa de "marcar tudo", código, título e contador.
 *
 * O \`indeterminate\` NÃO sai daqui, e é o detalhe que engana: ele não existe
 * como atributo de HTML — só como propriedade, e só depois de o elemento
 * existir. Escrito na string, o estado parcial some sem erro nenhum e ninguém
 * percebe. Quem o liga é \`pintarArvore\`, no fim.
 */
function cabecaDeModulo(m, indice) {
  const e = estadoDoModulo(m.itens, feito);
  return \`<summary>
    <input type="checkbox" class="caixa tudo" data-mod="\${indice}" \${e.todos ? 'checked' : ''}
      title="\${e.todos ? 'Módulo inteiro visto — clique para desmarcar tudo' : 'Marcar tudo deste módulo como visto'}">
    <span class="cod num">\${esc(m.codigo)}</span>
    <span>\${esc(m.titulo)}</span>
    <span class="conta num">✓ \${e.feitas}/\${e.total}</span>
  </summary>\`;
}

/**
 * O módulo inteiro num clique — para quem já fechou a matéria antes de o
 * painel existir, e para desfazer um "marcar tudo" dado por engano.
 *
 * Vira uma operação \`{tipo:'progresso'}\` por aula, as MESMAS do botão do
 * palco, num empurrão só na fila (\`enfileirarVarias\`). Só entram as aulas que
 * MUDAM: marcar tudo num módulo com onze de doze já vistas é uma operação, não
 * doze — e a fila só existe para carregar o que ainda não chegou ao banco.
 */
function marcarModulo(indice, valor) {
  const m = dados?.arvore[0]?.modulos[indice];
  if (!m) return;
  enfileirarVarias(m.itens.filter(i => feito(i.id) !== valor).map(i => opDeProgresso(i.id, valor)));
  pintarArvore();
}

/**
 * Qual aula a árvore já mostrou como corrente.
 *
 * Serve para uma decisão só: o módulo do item corrente se abre SOZINHO quando
 * a pessoa troca de aula (é o que faz o autoplay atravessar módulo sem deixar
 * a próxima aula escondida), e não numa repintura de marcação. Sem esta
 * distinção, marcar uma caixa reabriria o módulo que a pessoa acabou de
 * fechar.
 */
let aulaDaArvore = null;

function pintarArvore() {
  const arv = document.querySelector('.arvore');
  if (!arv) return; // a home não tem árvore, e a fila escoa lá também

  // O que a pessoa já tinha aberto, e onde ela estava na lista. \`innerHTML =\`
  // refaz TODOS os <details> e zera a rolagem — e marcar uma aula não pode
  // fechar módulo nem jogar a árvore de volta para o topo.
  const abertos = new Set();
  arv.querySelectorAll('.modulo').forEach(el => { if (el.open) abertos.add(el.dataset.mod); });
  const rolagem = arv.scrollTop || 0;

  const trocouDeAula = (atual?.id ?? null) !== aulaDaArvore;
  aulaDaArvore = atual?.id ?? null;
  const aberto = (m, i) => abertos.has(String(i))
    || (trocouDeAula && m.itens.some(x => x.id === atual?.id));

  arv.innerHTML = dados.arvore[0].modulos.map((m, i) => \`
    <details class="modulo" data-mod="\${i}" \${aberto(m, i) ? 'open' : ''}>
      \${cabecaDeModulo(m, i)}
      \${m.itens.map(linhaDeAula).join('')}
    </details>\`).join('');

  arv.scrollTop = rolagem;

  arv.querySelectorAll('.aula').forEach(el =>
    el.onclick = () => abrir(Number(el.dataset.id)));

  arv.querySelectorAll('.caixa').forEach(el => {
    // O clique morre na caixa: na linha ele abriria a aula, e no <summary> ele
    // fecharia o módulo. Marcar não é navegar.
    el.onclick = (e) => e.stopPropagation();
    // Em \`change\`, e não em \`click\`: é o evento que já traz o \`checked\` novo,
    // e é o que também chega pelo teclado (espaço na caixa com foco).
    el.onchange = () => el.dataset.mod === undefined
      ? marcar(Number(el.dataset.id), el.checked)
      : marcarModulo(Number(el.dataset.mod), el.checked);
  });

  // Só por propriedade, e só agora que os elementos existem — ver
  // \`cabecaDeModulo\`.
  arv.querySelectorAll('.caixa.tudo').forEach(el => {
    const m = dados.arvore[0].modulos[Number(el.dataset.mod)];
    el.indeterminate = !!m && estadoDoModulo(m.itens, feito).parcial;
  });

  // A marca de visto aparece em DOIS lugares — a caixa da árvore e o botão do
  // palco — e o estado é um só. Aqui, e não em \`marcar\`, porque todo caminho
  // que muda progresso passa por \`pintarArvore\`: a caixa, o "marcar tudo", o
  // botão do palco, o fim do vídeo e o que chega do outro aparelho por
  // \`escoar\`. Em \`marcar\` seriam cinco lugares para lembrar.
  refletirFeito();
}

/**
 * Põe no botão do palco o que o estado diz — sem repintar o palco.
 *
 * Repintar seria refazer a cena e parar o vídeo (ou refazer o \`fetch\` do
 * markdown) só para trocar duas palavras.
 */
function refletirFeito() {
  const b = document.getElementById('bFeito');
  // O \`data-item\` não é enfeite: \`pintarMarkdown\` só troca o palco QUANDO a
  // resposta de /api/markdown chega, e nesse intervalo \`atual\` já é o item
  // novo enquanto o botão na tela ainda é o do anterior. Sem esta conferência,
  // um escoamento da fila caindo nessa janela escreveria o estado do item novo
  // no botão do item velho — a mesma família de defeito que \`PALCO\`/
  // \`soDaGeracao\` fecham para quem chega por rede e por evento.
  if (!b || !atual || b.dataset.item !== String(atual.id)) return;
  // "lido" para material escrito, "visto" para o resto — as mesmas palavras
  // que materiais.ts e player.ts escrevem ao pintar o palco.
  const verbo = atual.tipo === 'markdown' ? 'lido' : 'visto';
  b.textContent = feito(atual.id) ? '✓ ' + verbo : 'marcar como ' + verbo;
}

function itemPorId(id) {
  for (const m of dados.arvore[0].modulos) for (const i of m.itens) if (i.id === id) return i;
  return null;
}

function abrir(id) {
  const alvo = itemPorId(id);
  if (!alvo) return; // id desconhecido: não mexe em nada
  atual = alvo;
  history.replaceState(null, '', '#i' + id);
  pintarArvore();
  pintarPalco();
}

async function pintarCurso(slug) {
  dados = await (await fetch('/api/tudo?curso=' + encodeURIComponent(slug))).json();
  const curso = dados.arvore[0];

  // Antes de qualquer pintura, inclusive a da tela de curso inexistente: é
  // daqui que sai o tema que o chip anuncia, e é por aqui que a escolha feita
  // no outro aparelho chega a este.
  aplicarPrefsDoServidor(dados.prefs);

  // Slug que não existe devolve 200 com a árvore vazia — e os slugs saem do
  // NOME DA PASTA (\`slugificar\`, src/scan.ts), então renomear uma pasta no
  // acervo transforma todo favorito e todo #i compartilhado num endereço
  // morto. Sem isto, \`curso.titulo\` estourava e a tela ficava em
  // "carregando…" para sempre: sem mensagem e sem caminho de volta.
  if (!curso) {
    document.getElementById('app').innerHTML = \`
      <header class="topo"><a href="/" title="voltar">←</a><h1>Curso não encontrado</h1></header>
      <main><div class="retomar">
        <h3>Não há curso com o endereço "\${esc(slug)}"</h3>
        <div class="meta">A pasta pode ter sido renomeada no acervo. A home lista
          os cursos que existem hoje.</div>
        <a class="cartao" href="/">Voltar para a home</a>
      </div></main>\`;
    return;
  }

  document.getElementById('app').innerHTML = \`
    <header class="topo">
      <a href="/" title="voltar">←</a>
      <h1>\${esc(curso.titulo)}</h1>
      <div class="espaco"></div>
      \${chipDeTema(temaAtual())}\${selos(dados.indicadores)}
    </header>
    <div class="curso"><div class="arvore"></div><div class="palco"></div></div>\`;

  ligarChipDeTema();

  // Retoma o que estava aberto, ou o que \`escolherItemInicial\` decidir: a
  // primeira aula com vídeo e, não havendo vídeo algum no curso (caso de
  // Materiais/, só markdown), o primeiro item de qualquer tipo.
  const alvo = Number((location.hash.match(/#i(\\d+)/) || [])[1]);
  const itens = itensEmOrdem();
  atual = (alvo && itemPorId(alvo)) || escolherItemInicial(itens);

  pintarArvore();
  pintarPalco();
}
`;
