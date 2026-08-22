/**
 * Os cards de dono: disco, fila, divergências, recortes e botões de tarefa.
 *
 * Todo este arquivo só é chamado quando `permissoes.verDisco` é verdadeiro. E
 * mesmo assim ele não é a proteção: o servidor já não mandou os dados. Isto
 * aqui é apresentação, não controle de acesso.
 */
export const ADMIN_JS = `
const gb = b => !b ? '—' : (b / 1073741824).toFixed(2).replace('.', ',') + ' GB';
const milhar = n => (n ?? 0).toLocaleString('pt-BR');

function cardsDeDono(d) {
  if (!d.permissoes.verDisco) return '';

  const fila = Object.fromEntries((d.fila || []).map(f => [f.estado, f.n]));
  const div = d.divergencias || [];
  const recortes = d.disco?.recortes || {};

  return \`<section class="dono">
    <h3>Acervo</h3>
    <div class="cartoes">
      <div class="cartao"><h2 class="num">\${gb(d.disco?.bytes)}</h2>
        <div class="meta num">\${milhar(d.disco?.itens)} itens ·
          \${((d.disco?.segundos || 0) / 3600).toFixed(1).replace('.', ',')} h de vídeo</div></div>

      <div class="cartao"><h2 class="num">\${gb(recortes.bytes)}</h2>
        <div class="meta num">\${milhar(recortes.arquivos)} recortes em
          \${milhar(recortes.pastas)} pastas</div>
        <div class="meta">gere o script com "Refazer relatório"</div></div>

      <div class="cartao"><h2 class="num">\${milhar(fila.pronto || 0)} / \${milhar(
          (fila.pronto || 0) + (fila.pendente || 0) + (fila.rodando || 0) + (fila.erro || 0))}</h2>
        <div class="meta">transcritos\${fila.erro ? ' · ' + fila.erro + ' com erro' : ''}</div></div>

      <a class="cartao \${div.length ? 'alerta' : ''}" href="#divergencias">
        <h2 class="num">\${div.length}</h2>
        <div class="meta">transcrições divergentes</div>
        <div class="meta">\${div.length ? 'vale abrir e comparar' : 'nada destoando'}</div></a>
    </div>

    <h3>Tarefas</h3>
    <div class="ferramentas">
      \${(d.tarefas || []).map(t =>
        \`<button data-tarefa="\${t.nome}" title="\${esc(t.dica)}" \${t.rodando ? 'disabled' : ''}>
          \${t.rodando ? '⋯ ' : ''}\${esc(t.rotulo)}</button>\`).join('')}
    </div>

    \${div.length ? \`<h3 id="divergencias">Divergentes</h3>
      <table class="divs"><thead><tr><th>Aula</th><th>nova</th><th>antiga</th><th>únicas (antiga)</th><th>sim.</th></tr></thead>
      <tbody>\${div.map(x => \`<tr><td>\${esc(x.titulo)}</td>
        <td class="num">\${x.comparacao.palavras_nova}</td>
        <td class="num">\${x.comparacao.palavras_antiga}</td>
        <td class="num">\${x.comparacao.palavras_unicas_antiga}</td>
        <td class="num">\${x.comparacao.similaridade.toFixed(2)}</td></tr>\`).join('')}
      </tbody></table>\` : ''}
  </section>\`;
}

function ligarBotoesDeTarefa() {
  document.querySelectorAll('[data-tarefa]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const r = await (await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: b.dataset.tarefa }),
    })).json();
    b.textContent = r.msg;
    setTimeout(pintarHome, 3000);
  });
}
`;
