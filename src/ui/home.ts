/**
 * A home: um cartão por curso, mais "continuar de onde parou".
 *
 * O JS é vanilla e vive numa string. Não é preguiça: sem bundler o painel sobe
 * em ~200 ms, e é isso que faz ele ser aberto no meio do estudo em vez de ser
 * levantado.
 */
export const HOME_JS = `
function relogio(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  const dd = n => String(n).padStart(2, '0');
  return h ? h + ':' + dd(m) + ':' + dd(r) : m + ':' + dd(r);
}

function horas(seg) {
  if (!seg) return '';
  return (seg / 3600).toFixed(1).replace('.', ',') + ' h';
}

/** Quanto do curso o usuário já marcou como feito. */
function progressoDoCurso(curso, progresso) {
  let total = 0, feitos = 0;
  for (const m of curso.modulos) for (const i of m.itens) {
    total++;
    if (progresso['i:' + i.id]?.feito) feitos++;
  }
  return { total, feitos, pct: total ? Math.round(feitos * 100 / total) : 0 };
}

function cartaoDeCurso(curso, progresso) {
  const p = progressoDoCurso(curso, progresso);
  const aulas = curso.modulos.reduce((s, m) => s + m.itens.length, 0);
  const seg = curso.modulos.reduce((s, m) =>
    s + m.itens.reduce((t, i) => t + (i.duracao || 0), 0), 0);
  const vazio = curso.estado === 'esqueleto';

  return \`<a class="cartao \${vazio ? 'vazio' : ''}" href="/curso/\${curso.slug}">
    <h2>\${esc(curso.titulo)}</h2>
    <div class="meta num">\${curso.modulos.length} módulos ·
      \${vazio ? 'não baixado' : aulas + ' itens'}\${seg ? ' · ' + horas(seg) : ''}</div>
    <div class="barra \${p.pct === 100 ? 'pronta' : ''}"><i style="width:\${p.pct}%"></i></div>
    <div class="meta num" style="margin-top:6px">\${vazio ? '—' : p.feitos + ' de ' + p.total + ' · ' + p.pct + '%'}</div>
  </a>\`;
}

const esc = s => (s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Acha o curso e o item correspondentes a \`d.retomar\` (\`{ chave, segundos }\`,
 * chave no formato "i:<id>"), percorrendo a árvore já carregada.
 *
 * O servidor manda a chave mais recente já ordenada por \`updated_at\` — o
 * cliente só precisa achar a que ela aponta, não decidir qual é a mais
 * recente. Ver \`ultimoAberto\` em src/db.ts.
 */
function acharRetomar(arvore, retomar) {
  if (!retomar) return null;
  const id = Number(retomar.chave.slice(2));
  for (const c of arvore) for (const m of c.modulos) for (const i of m.itens) {
    if (i.id === id) return { curso: c, item: i, segundos: retomar.segundos };
  }
  return null;
}

function selos(ind) {
  const meu = '<span class="selo eu" title="você">' + ind.eu + '</span>';
  const outro = ind.outro ? '<span class="selo outro" title="procópio está online">' + ind.outro + '</span>' : '';
  return outro + meu;
}

async function pintarHome() {
  const d = await (await fetch('/api/tudo')).json();
  const retomar = acharRetomar(d.arvore, d.retomar);

  document.getElementById('app').innerHTML = \`
    <header class="topo">
      <h1>Ensinantes Digitais</h1><div class="espaco"></div>\${selos(d.indicadores)}
    </header>
    <main>
      <div class="cartoes">\${d.arvore.map(c => cartaoDeCurso(c, d.progresso)).join('')}</div>
      \${retomar ? \`<div class="retomar">
        <h3>Continuar de onde parou</h3>
        <a class="cartao" href="/curso/\${retomar.curso.slug}#i\${retomar.item.id}">
          <h2>\${esc(retomar.item.titulo)}</h2>
          <div class="meta num">\${esc(retomar.curso.titulo)} · em \${relogio(retomar.segundos)}</div>
        </a></div>\` : ''}
    </main>\`;
}
`;
