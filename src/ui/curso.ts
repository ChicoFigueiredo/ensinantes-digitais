/**
 * A tela de curso: árvore à esquerda, palco à direita.
 *
 * O estado vive em `dados` e `atual`, dois módulos no escopo do script. Não há
 * framework e não precisa haver: são duas listas e um vídeo, e cada repintura
 * é uma atribuição de innerHTML sobre um nó pequeno.
 */
export const CURSO_JS = `
let dados = null, atual = null, slugAtual = null;

const CHAVE = id => 'i:' + id;
const feito = id => !!(dados?.progresso[CHAVE(id)]?.feito);

function linhaDeAula(item) {
  const marca = feito(item.id) ? '✓' : (item.tipo === 'video' ? '▸' : '·');
  const dur = item.duracao ? relogio(item.duracao) : '';
  return \`<div class="aula \${feito(item.id) ? 'feita' : ''} \${atual?.id === item.id ? 'corrente' : ''}"
               data-id="\${item.id}" id="i\${item.id}">
    <span class="marca">\${marca}</span>
    <span>\${esc(item.titulo)}</span>
    <span class="dur tempo">\${dur}</span>
  </div>\`;
}

function pintarArvore() {
  document.querySelector('.arvore').innerHTML = dados.arvore[0].modulos.map(m => \`
    <details class="modulo" \${m.itens.some(i => i.id === atual?.id) ? 'open' : ''}>
      <summary><span class="cod num">\${esc(m.codigo)}</span><span>\${esc(m.titulo)}</span></summary>
      \${m.itens.map(linhaDeAula).join('')}
    </details>\`).join('');

  document.querySelectorAll('.arvore .aula').forEach(el =>
    el.onclick = () => abrir(Number(el.dataset.id)));
}

function itemPorId(id) {
  for (const m of dados.arvore[0].modulos) for (const i of m.itens) if (i.id === id) return i;
  return null;
}

function abrir(id) {
  atual = itemPorId(id);
  if (!atual) return;
  history.replaceState(null, '', '#i' + id);
  pintarArvore();
  pintarPalco();
}

async function pintarCurso(slug) {
  slugAtual = slug;
  dados = await (await fetch('/api/tudo?curso=' + encodeURIComponent(slug))).json();
  const curso = dados.arvore[0];

  document.getElementById('app').innerHTML = \`
    <header class="topo">
      <a href="/" title="voltar">←</a>
      <h1>\${esc(curso.titulo)}</h1>
      <div class="espaco"></div>\${selos(dados.indicadores)}
    </header>
    <div class="curso"><div class="arvore"></div><div class="palco"></div></div>\`;

  // Retoma o que estava aberto, ou a primeira aula com vídeo.
  const alvo = Number((location.hash.match(/#i(\\d+)/) || [])[1]);
  const primeira = curso.modulos.flatMap(m => m.itens).find(i => i.tipo === 'video');
  atual = (alvo && itemPorId(alvo)) || primeira || null;

  pintarArvore();
  pintarPalco();
}
`;
