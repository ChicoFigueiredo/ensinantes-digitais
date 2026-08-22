/**
 * Tokens e CSS base. Um arquivo só para cor e tipografia, porque é o que mais
 * muda e o que menos deve estar espalhado.
 *
 * Escuro sóbrio: o vídeo e o texto dominam, a interface recua. Sem sombra —
 * em fundo escuro sombra não separa plano, só suja. Borda de 1px faz o
 * trabalho e some quando não é olhada.
 */
export const CSS = `
:root {
  --fundo: #0e1013;
  --superficie: #16191f;
  --elevada: #1e222a;
  --borda: #2a2f3a;
  --texto: #e8eaed;
  --secundario: #9aa3af;
  --ambar: #e8963c;
  --verde: #4ea672;
  --raio: 16px;
  --fonte: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--fundo);
  color: var(--texto);
  font-family: var(--fonte);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

/* Tempos em coluna: sem isto o número dança a cada segundo de reprodução. */
.tempo, .num { font-variant-numeric: tabular-nums; }

a { color: inherit; text-decoration: none; }
button {
  font: inherit; color: var(--texto); cursor: pointer;
  background: var(--elevada); border: 1px solid var(--borda);
  border-radius: 8px; padding: 6px 12px;
}
button:hover { border-color: var(--ambar); }

header.topo {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 22px; border-bottom: 1px solid var(--borda);
  position: sticky; top: 0; background: var(--fundo); z-index: 10;
}
header.topo h1 { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: .01em; }
header.topo .espaco { flex: 1; }

/* As letrinhas do canto: (c) para o chico, (p) para o procópio. */
.selo {
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 700;
  border: 1px solid var(--borda); background: var(--elevada);
}
.selo.eu { border-color: var(--ambar); color: var(--ambar); }
.selo.outro { color: var(--secundario); }

main { padding: 24px 22px 64px; max-width: 1400px; margin: 0 auto; }

.cartoes { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }

.cartao {
  background: var(--superficie); border: 1px solid var(--borda);
  border-radius: var(--raio); padding: 20px; display: block;
  transition: border-color .15s ease;
}
.cartao:hover { border-color: var(--ambar); }
.cartao h2 { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
.cartao .meta { color: var(--secundario); font-size: 13px; }
.cartao.vazio { opacity: .55; }

.barra { height: 5px; border-radius: 3px; background: var(--elevada); margin-top: 14px; overflow: hidden; }
.barra > i { display: block; height: 100%; background: var(--ambar); }
.barra.pronta > i { background: var(--verde); }

.retomar { margin-top: 34px; }
.retomar h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
              color: var(--secundario); font-weight: 600; margin: 0 0 10px; }

@media (max-width: 640px) { main { padding: 16px 14px 48px; } }
`;

/**
 * CSS da tela de curso: árvore de módulos à esquerda, palco à direita.
 *
 * Abaixo de 900px as duas colunas empilham — não há espaço para elas lado a
 * lado num tablet em retrato — mas o palco vem PRIMEIRO na ordem visual
 * (`order`), com a árvore rolável abaixo. É o vídeo que a pessoa veio ver;
 * fazer a lista de módulos aparecer primeiro obrigaria rolar por ela toda
 * vez que trocasse de aula.
 */
export const CSS_CURSO = `
.curso { display: grid; grid-template-columns: 320px 1fr; gap: 0; height: calc(100vh - 55px); }

.arvore { overflow-y: auto; border-right: 1px solid var(--borda); padding: 12px 0 40px; }
.arvore .modulo > summary {
  padding: 9px 18px; cursor: pointer; font-weight: 600; font-size: 14px;
  list-style: none; display: flex; gap: 8px; align-items: baseline;
}
.arvore .modulo > summary::-webkit-details-marker { display: none; }
.arvore .modulo > summary:hover { background: var(--superficie); }
.arvore .modulo > summary .cod { color: var(--secundario); font-size: 12px; }
.arvore .aula {
  display: flex; gap: 9px; align-items: baseline;
  padding: 7px 18px 7px 34px; font-size: 14px; cursor: pointer;
  border-left: 2px solid transparent; color: var(--secundario);
}
.arvore .aula:hover { background: var(--superficie); color: var(--texto); }
.arvore .aula.corrente { border-left-color: var(--ambar); color: var(--texto); background: var(--superficie); }
.arvore .aula .marca { width: 12px; flex: none; }
.arvore .aula.feita .marca { color: var(--verde); }
.arvore .aula .dur { margin-left: auto; font-size: 12px; }

.palco { overflow-y: auto; padding: 0 0 60px; }
.palco video { width: 100%; background: #000; display: block; aspect-ratio: 16/9; }
.palco .cabeca { padding: 16px 24px 8px; }
.palco .cabeca h2 { margin: 0; font-size: 19px; font-weight: 600; }
.palco .ferramentas { display: flex; gap: 10px; flex-wrap: wrap; padding: 8px 24px 16px; align-items: center; }

/* A largura continua cheia, como a spec pede. O que muda é o teto de altura:
   sem ele o vídeo come ~67% da viewport em telas largas, e o destaque
   automático do trecho corrente (destacarTrecho, na Tarefa 12) acontece
   fora de vista — o recurso existe e não é visto. Só acima de 900px: numa
   tela estreita e alta o mesmo teto deixaria o vídeo minúsculo, então lá ele
   segue só a largura (aspect-ratio acima cuida da altura). */
@media (min-width: 901px) {
  .palco video { max-height: 50vh; object-fit: contain; }
}

@media (max-width: 900px) {
  .curso { grid-template-columns: 1fr; height: auto; }

  /* O vídeo primeiro: é o que a pessoa veio ver. Empilhar na ordem do DOM
     faria ela aterrissar em 42vh de lista de módulos e ter de rolar para
     achar o player — toda vez que trocasse de aula. */
  .palco  { order: 1; }
  .arvore { order: 2; border-right: 0; border-top: 1px solid var(--borda); max-height: none; }
}
`;

/**
 * CSS da transcrição clicável e da anotação por aula, embaixo do vídeo.
 *
 * Largura limitada a 760px: texto corrido esticado na tela toda (o palco pode
 * ter mais de 1000px de largura livre) fica difícil de ler — colunas mais
 * estreitas seguem melhor o olho de linha em linha.
 */
export const CSS_TRANSCRICAO = `
.transc { padding: 8px 24px 40px; max-width: 760px; }
.transc h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
             color: var(--secundario); margin: 22px 0 10px; font-weight: 600; }
.transc .trecho {
  display: flex; gap: 12px; padding: 3px 0; cursor: pointer;
  border-radius: 6px; align-items: baseline;
}
.transc .trecho:hover { background: var(--superficie); }
.transc .trecho.ativo { color: var(--ambar); }
.transc .trecho .t { color: var(--secundario); font-size: 12px; flex: none; width: 52px; }
.transc .trecho.ativo .t { color: var(--ambar); }

.nota textarea {
  width: 100%; min-height: 110px; resize: vertical;
  background: var(--superficie); color: var(--texto);
  border: 1px solid var(--borda); border-radius: 10px; padding: 12px;
  font: inherit; line-height: 1.5;
}
.nota textarea:focus { outline: none; border-color: var(--ambar); }
`;

/**
 * CSS dos cards de dono (Tarefa 16): disco, fila, recortes e divergências.
 * Âmbar sinaliza alerta — o mesmo tom usado no resto do painel para "olhe
 * aqui", sem introduzir uma cor nova só para isto.
 */
export const CSS_ADMIN = `
.dono { margin-top: 44px; }
.dono h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
           color: var(--secundario); font-weight: 600; margin: 26px 0 12px; }
.dono .cartao h2 { font-size: 22px; }
.dono .cartao.alerta { border-color: var(--ambar); }
.dono .ferramentas { display: flex; gap: 10px; flex-wrap: wrap; }

table.divs { width: 100%; border-collapse: collapse; font-size: 14px; }
table.divs th { text-align: left; color: var(--secundario); font-weight: 600;
                font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
                padding: 8px 10px; border-bottom: 1px solid var(--borda); }
table.divs td { padding: 8px 10px; border-bottom: 1px solid var(--borda); }
table.divs td.num, table.divs th:not(:first-child) { text-align: right; }
`;

/**
 * CSS do markdown renderizado (Tarefa 19), para o palco quando o item é
 * `Repo/*.md`.
 *
 * `1351` das linhas medidas nos nove arquivos reais são de tabela — de longe
 * o construto dominante — por isso ela é quem ganha tratamento especial:
 * `display: block; overflow-x: auto` deixa uma tabela larga rolar sozinha em
 * vez de esticar a página inteira (Mapa.Completo.md tem colunas de sobra
 * para isso acontecer).
 */
export const CSS_MARKDOWN = `
.md { padding: 4px 24px 60px; max-width: 760px; line-height: 1.7; }
.md h1, .md h2, .md h3, .md h4 { margin: 28px 0 10px; line-height: 1.3; }
.md h1 { font-size: 24px; } .md h2 { font-size: 20px; } .md h3 { font-size: 17px; }
.md h4 { font-size: 15px; color: var(--secundario); }
.md p { margin: 0 0 14px; }
.md hr { border: 0; border-top: 1px solid var(--borda); margin: 26px 0; }
.md ul, .md ol { margin: 0 0 14px; padding-left: 22px; }
.md li { margin: 4px 0; }
.md a { color: var(--ambar); border-bottom: 1px solid transparent; }
.md a:hover { border-bottom-color: var(--ambar); }
.md code { background: var(--elevada); padding: 1px 5px; border-radius: 5px; font-size: 13px; }
.md pre { background: var(--superficie); border: 1px solid var(--borda);
          border-radius: 10px; padding: 14px; overflow-x: auto; }
.md pre code { background: none; padding: 0; }
.md blockquote { margin: 0 0 14px; padding: 2px 0 2px 16px;
                 border-left: 3px solid var(--borda); color: var(--secundario); }
/* Tabela larga rola sozinha em vez de esticar a página inteira. */
.md table { width: 100%; border-collapse: collapse; margin: 0 0 18px;
            display: block; overflow-x: auto; }
.md th, .md td { padding: 7px 10px; border-bottom: 1px solid var(--borda); text-align: left; }
.md th { color: var(--secundario); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
`;
