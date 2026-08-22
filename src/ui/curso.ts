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

export const CURSO_JS = `
let dados = null, atual = null;

// A MESMA função de src/ui/curso.ts, não uma cópia dela.
${escolherItemInicial.toString()}

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

  document.getElementById('app').innerHTML = \`
    <header class="topo">
      <a href="/" title="voltar">←</a>
      <h1>\${esc(curso.titulo)}</h1>
      <div class="espaco"></div>\${selos(dados.indicadores)}
    </header>
    <div class="curso"><div class="arvore"></div><div class="palco"></div></div>\`;

  // Retoma o que estava aberto, ou o que \`escolherItemInicial\` decidir: a
  // primeira aula com vídeo e, não havendo vídeo algum no curso (caso de
  // Materiais/, só markdown), o primeiro item de qualquer tipo.
  const alvo = Number((location.hash.match(/#i(\\d+)/) || [])[1]);
  const itens = curso.modulos.flatMap(m => m.itens);
  atual = (alvo && itemPorId(alvo)) || escolherItemInicial(itens);

  pintarArvore();
  pintarPalco();
}
`;
