/**
 * Tokens e CSS base. Um arquivo só para cor e tipografia, porque é o que mais
 * muda e o que menos deve estar espalhado.
 *
 * São DOIS temas, um conjunto de tokens para cada: o escuro no `:root`, o ocre
 * claro em `[data-tema="claro"]`. Nenhuma regra abaixo dos tokens escreve cor
 * literal — quem quiser um terceiro tema mexe em oito linhas e em mais nada. O
 * tema é preferência de LEITURA, não privilégio: os dois usuários têm o seu, e
 * ele viaja no mesmo caminho da velocidade e do autoplay (localStorage + fila
 * do /api/sync, tabela `prefs`, por usuário).
 *
 * Escuro sóbrio: o vídeo e o texto dominam, a interface recua. O claro é cor de
 * papel, pelo mesmo motivo — de dia, num quarto claro, tela preta cansa.
 *
 * Os tokens `--video-*` são a exceção que confirma a regra: eles NÃO mudam com
 * o tema, porque o vídeo é preto nos dois. Ver o comentário de CSS_CENA.
 *
 * Sombra: nenhuma no escuro, uma no claro. O porquê está escrito inteiro
 * embaixo de `[data-tema="claro"] .cartao` — leia antes de apagar.
 */

/**
 * Chave do localStorage do tema. Uma só, e ela é lida em dois lugares muito
 * distantes — o chip do cabeçalho (src/ui/player.ts) e o script que roda antes
 * da primeira pintura (logo abaixo). Duas cópias de string dariam uma piscada
 * silenciosa no dia em que uma delas mudasse.
 */
export const CHAVE_TEMA = "ed.tema";

/**
 * O trecho que roda ANTES da primeira pintura, no `<head>` e antes do `<style>`.
 *
 * Sem ele a página nasce escura e clareia quando o JS acorda: uma piscada preta
 * a cada navegação, justamente para quem escolheu o claro. Por isso é síncrono,
 * minúsculo e não depende de nada — lê o localStorage e carimba o `<html>`.
 *
 * O `try` não é decoração: com armazenamento bloqueado pelo navegador,
 * `localStorage` LANÇA em vez de devolver null, e uma exceção aqui derrubaria o
 * script inteiro antes do resto da página. Nesse caso vale o escuro do `:root`.
 */
export const SCRIPT_TEMA = `
try {
  var t = localStorage.getItem('${CHAVE_TEMA}');
  if (t === 'claro' || t === 'escuro') document.documentElement.setAttribute('data-tema', t);
} catch (e) {}
`;

export const CSS = `
:root {
  --fundo: #0e1013;
  --superficie: #16191f;
  --elevada: #1e222a;
  --borda: #2a2f3a;
  --texto: #e8eaed;
  --secundario: #9aa3af;
  --destaque: #e8963c;
  --verde: #4ea672;

  /* Sobre o vídeo — NÃO seguem o tema. Ver CSS_CENA. */
  --video-texto: #e8eaed;
  --video-borda: #2a2f3a;
  --video-destaque: #e8963c;
  --video-fundo: rgba(14, 16, 19, .82);
  --video-tarja: rgba(14, 16, 19, .86);

  --raio: 16px;
  --fonte: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  /* Barra de rolagem e controle nativo acompanham o tema sem CSS nosso. */
  color-scheme: dark;
}

/*
 * O ocre claro: os MESMOS tokens, em cor de papel.
 *
 * Dois valores saíram do ponto de partida, e os dois por medida de contraste
 * (WCAG AA, 4.5:1 para texto normal), não por gosto:
 *
 *   --secundario  #7b7264 → #6f6759   4,13:1 reprovava sobre o fundo; agora 4,87:1.
 *   --destaque    #b06f26 → #9a5f1f   3,56:1, e ele é TEXTO em quatro lugares
 *                                     (selo, trecho corrente, links do
 *                                     markdown); agora 4,54:1.
 *
 * O texto sobre o fundo (12,4:1) e o resto da paleta ficaram como o dono
 * aprovou. tests/tema.test.ts mede isto a cada rodada, direto destes tokens:
 * mexer numa cor e reprovar no contraste quebra o teste, não a leitura de
 * alguém.
 */
[data-tema="claro"] {
  --fundo: #f4efe4;
  --superficie: #fffdf8;
  --elevada: #ebe2d1;
  --borda: #dcd0b9;
  --texto: #2f2a23;
  /* Escurecidos até passarem em AA sobre a superfície ELEVADA (#ebe2d1), e não
     só sobre o fundo. É onde a conferência anterior errou: o selo (c)/(p) do
     cabeçalho fica sobre a elevada, que é mais escura que o fundo, e ali
     --destaque dava 4,05:1 e --secundario 4,34:1 — reprovados para texto.
     Medindo pelo pior fundo, os três passam em todos: elevada 4,5+ · fundo
     5,1+ · superfície 5,7+. */
  --secundario: #6c6457;
  --destaque: #8f581d;
  --verde: #456d49;
  color-scheme: light;
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
button:hover { border-color: var(--destaque); }

/*
 * O FOCO DE TECLADO, numa regra só.
 *
 * Até aqui existia só \`:hover\`, e metade do uso deste painel é em tablet com
 * teclado — onde \`:hover\` não existe e o cursor de foco era invisível: dava
 * para tabular pelos cartões sem ver onde se estava. O anel é desenhado FORA da
 * borda (\`outline-offset\`), então acender o foco não empurra um pixel de
 * conteúdo. E \`:focus-visible\`, não \`:focus\`: quem chegou com o dedo ou com o
 * mouse não ganha anel nenhum.
 */
:focus-visible { outline: 2px solid var(--destaque); outline-offset: 2px; }

header.topo {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 22px; border-bottom: 1px solid var(--borda);
  position: sticky; top: 0; background: var(--fundo); z-index: 10;
}
header.topo h1 { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: .01em; }
header.topo .espaco { flex: 1; }

/* O chip do tema, ao lado dos selos. O rótulo diz para onde VAI, não onde está. */
.tema { font-size: 12.5px; padding: 4px 10px; }

/* As letrinhas do canto: (c) para o chico, (p) para o procópio. */
.selo {
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 700;
  border: 1px solid var(--borda); background: var(--elevada);
}
.selo.eu { border-color: var(--destaque); color: var(--destaque); }
.selo.outro { color: var(--secundario); }

main { padding: 24px 22px 64px; max-width: 1400px; margin: 0 auto; }

.cartoes { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }

/*
 * O CARTÃO e a hierarquia dele: título (o que é) → meta (de que é feito) →
 * progresso (quanto falta). Três degraus de tamanho e de cor, do mais forte ao
 * mais fraco, para o olho pegar o título primeiro e o resto quando quiser. Era
 * tudo quase do mesmo peso, e o cartão lia como um bloco cinza só.
 */
.cartao {
  background: var(--superficie); border: 1px solid var(--borda);
  border-radius: var(--raio); padding: 20px 20px 18px; display: block;
  transition: border-color .15s ease;
}
.cartao:hover { border-color: var(--destaque); }
.cartao h2 { margin: 0 0 5px; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
.cartao .meta { color: var(--secundario); font-size: 13px; }

/* A contagem recua, a porcentagem fica firme na direita: é ela que se procura. */
.cartao .progresso {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  margin-top: 8px; font-size: 12.5px; color: var(--secundario);
}
.cartao .progresso b { font-size: 13px; font-weight: 600; color: var(--texto); }

/*
 * "Não baixado" é um ESTADO, não um defeito.
 *
 * Era \`opacity: .55\` no cartão inteiro — título, texto e borda desbotados
 * juntos —, e cartão desbotado lê como tela quebrada ou como coisa ainda
 * carregando. Aqui ele fica nítido e diz o que é por outro caminho: contorno
 * tracejado, que é como se desenha o que ainda vai ser preenchido, e sem o
 * fundo de superfície, porque não há conteúdo em cima do qual pousar. A barra
 * de progresso some no HTML (src/ui/home.ts), e não por CSS: não existe
 * progresso a mostrar num curso que não está no disco.
 */
.cartao.vazio { background: transparent; border-style: dashed; }
.cartao.vazio h2 { color: var(--secundario); font-weight: 500; }

.barra { height: 5px; border-radius: 3px; background: var(--elevada); margin-top: 14px; overflow: hidden; }
.barra > i { display: block; height: 100%; background: var(--destaque); }
.barra.pronta > i { background: var(--verde); }

/*
 * SOMBRA — e por que a regra é DIFERENTE em cada tema, de propósito.
 *
 * O projeto proíbe sombra, e a razão está escrita no topo deste arquivo: em
 * fundo escuro sombra não separa plano, só suja — a borda de 1px faz o
 * trabalho sozinha. Essa razão NÃO vale em fundo claro. No papel, --superficie
 * (#fffdf8) está a 1,13:1 do --fundo (#f4efe4) e a borda ocre a 1,33:1 dele:
 * sem sombra o cartão não é um plano acima da página, é um retângulo desenhado
 * nela. A sombra é exatamente o que devolve a separação — e é a razão de a
 * borda clara poder continuar clara, em vez de virar um traço marrom pesado só
 * para se fazer notar.
 *
 * Então: o escuro segue sem sombra NENHUMA, e o claro tem UMA, muito suave,
 * nos cartões. Isto não é violação da regra; é a regra aplicada onde a razão
 * dela existe. Não apague por parecer inconsistente.
 *
 * O cartão vazio fica de fora: ele não é um plano acima da página, é o
 * contorno de algo que ainda não chegou.
 */
[data-tema="claro"] .cartao { box-shadow: 0 2px 6px rgba(47, 42, 35, .07); }
[data-tema="claro"] .cartao.vazio { box-shadow: none; }

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
.arvore .aula.corrente { border-left-color: var(--destaque); color: var(--texto); background: var(--superficie); }
.arvore .aula .marca { width: 12px; flex: none; }
.arvore .aula.feita .marca { color: var(--verde); }
.arvore .aula .dur { margin-left: auto; font-size: 12px; }

/*
 * A CAIXA de seleção: a de cada aula e a de "marcar tudo" no cabeçalho do
 * módulo.
 *
 * É o controle NATIVO, e isso é escolha, não preguiça. \`accent-color\` a pinta
 * com o token de destaque — cor nossa, nenhuma literal —, o \`color-scheme\`
 * declarado nos dois temas lá em cima já faz o navegador desenhar o resto dela
 * em cor de papel ou de noite, e o TRAÇO do estado parcial (\`indeterminate\`)
 * vem pronto. Uma caixa desenhada à mão custaria um pseudo-elemento e três
 * seletores para chegar ao mesmo lugar, e perderia justamente o traço, que é o
 * estado mais difícil de anunciar sem ele.
 */
.arvore .caixa {
  flex: none; align-self: center; margin: 0;
  width: 14px; height: 14px; cursor: pointer;
  accent-color: var(--destaque);
}
/* Um degrau maior no cabeçalho: aquela vale por um módulo inteiro. */
.arvore .modulo > summary .caixa { width: 15px; height: 15px; }

/* O contador "✓ 3/12", encostado na direita do cabeçalho. \`num\` (tabular, lá
   em cima) é o que impede o número de dançar a cada aula marcada. */
.arvore .modulo > summary .conta {
  margin-left: auto; flex: none; white-space: nowrap;
  color: var(--secundario); font-size: 12px; font-weight: 500;
}

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
 * CSS da cena — o vídeo mais os controles que desenhamos por cima dele.
 *
 * A cena existe por causa da tela cheia. O botão nativo põe em tela cheia o
 * VÍDEO, e aí só o vídeo aparece: o HUD, as setas e a legenda são irmãos dele
 * no DOM, não filhos, e ficam de fora. Por isso o botão nativo é escondido e o
 * chip `⛶` põe a CENA inteira em tela cheia — em navegador que ignore o
 * seletor, o `fullscreenchange` de player.ts conserta depois.
 *
 * O HUD fica visível o tempo todo, e não só ao mexer o mouse: metade do uso
 * deste painel é em tablet, onde não existe "mexer o mouse" e um HUD que só
 * aparece no hover simplesmente não existe.
 */
export const CSS_CENA = `
.cena { position: relative; background: #000; }
/* Em tela cheia quem vai é o PALCO, porque ele sobrevive à troca de aula — a
   cena é refeita a cada repintura, e o navegador cai fora da tela cheia quando
   o elemento sai do documento. Ver alternarTelaCheia em player.ts. Aqui o
   CSS faz o palco PARECER a cena: some com o título, as ferramentas, a
   anotação e a transcrição, e a cena ocupa a tela. */
.palco:fullscreen { background: #000; overflow: hidden; display: grid; place-items: center; }
.palco:fullscreen > *:not(.cena) { display: none; }
.palco:fullscreen .cena { width: 100vw; height: 100vh; display: grid; place-items: center; }
.palco:fullscreen .cena video { max-height: 100vh; height: 100vh; object-fit: contain; }
video::-webkit-media-controls-fullscreen-button { display: none; }

.cena .hud {
  position: absolute; top: 10px; right: 10px; max-width: calc(100% - 20px);
  display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; align-items: center;
}
/*
 * O HUD, as setas e a legenda NÃO seguem o tema — e isso é a coisa mais fácil
 * de "consertar" errado deste arquivo.
 *
 * Eles não ficam sobre o painel, ficam sobre o VÍDEO, que é preto nos dois
 * temas. Trocar estes valores por --texto/--borda/--superficie faria o chip
 * virar texto escuro sobre tarja escura no tema claro: sumiria. Por isso os
 * tokens --video-* existem, e por isso [data-tema="claro"] não os redefine —
 * tests/tema.test.ts trava as duas metades dessa regra.
 *
 * A opacidade de 82% é a cor do painel escuro deixando o vídeo aparecer por
 * baixo. Sem sombra: a borda de 1px já separa do vídeo.
 */
.chip {
  background: var(--video-fundo); color: var(--video-texto);
  border: 1px solid var(--video-borda); border-radius: 8px;
  padding: 4px 9px; font-size: 12.5px; line-height: 1.45;
}
.chip.on { border-color: var(--video-destaque); color: var(--video-destaque); }

/* As setas ocupam a altura do vídeo menos a faixa dos controles nativos, e
   só os botões recebem clique — o miolo continua sendo do <video>. */
.cena .nav {
  position: absolute; top: 0; bottom: 52px; left: 0; right: 0; pointer-events: none;
  display: flex; align-items: center; justify-content: space-between; padding: 0 10px;
}
.cena .nav button {
  pointer-events: auto; width: 44px; height: 66px; font-size: 26px; line-height: 1;
  background: var(--video-fundo); color: var(--video-texto); border-color: var(--video-borda);
}
/* Primeira e última aula: a seta some, em vez de ficar clicável sem destino. */
.cena .nav button:disabled { opacity: 0; pointer-events: none; }

/* A legenda é desenhada AQUI, e não pelo navegador — ver o comentário de
   \`aplicarFaixas\` em src/ui/player.ts para o motivo. O tamanho vem de
   --tamleg, que mora na raiz do documento para continuar valendo em tela
   cheia, e é em px para NÃO encolher junto com a janela. */
.cena .legenda {
  position: absolute; left: 0; right: 0; bottom: 58px; padding: 0 5%;
  text-align: center; pointer-events: none;
  font-size: var(--tamleg, 18px); line-height: 1.35;
}
.cena .legenda:empty { display: none; }
/* Uma caixa só para a fala inteira, e não uma por linha: com fundo por linha
   as emendas aparecem como listras entre elas. */
.cena .legenda > span {
  display: inline-block; background: var(--video-tarja); color: var(--video-texto);
  border-radius: 6px; padding: .18em .5em;
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
.transc .trecho.ativo { color: var(--destaque); }
.transc .trecho .t { color: var(--secundario); font-size: 12px; flex: none; width: 52px; }
.transc .trecho.ativo .t { color: var(--destaque); }

.nota textarea {
  width: 100%; min-height: 110px; resize: vertical;
  background: var(--superficie); color: var(--texto);
  border: 1px solid var(--borda); border-radius: 10px; padding: 12px;
  font: inherit; line-height: 1.5;
}
.nota textarea:focus { outline: none; border-color: var(--destaque); }
`;

/**
 * CSS dos cards de dono (Tarefa 16): disco, fila, recortes e divergências.
 * O DESTAQUE sinaliza alerta — o mesmo token usado no resto do painel para
 * "olhe aqui", sem introduzir uma cor nova só para isto. Não diz "âmbar" de
 * propósito: no tema claro esse token guarda um ocre, e comentário que fixa o
 * nome de uma cor envelhece na primeira troca de tema.
 */
export const CSS_ADMIN = `
.dono { margin-top: 44px; }
.dono h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
           color: var(--secundario); font-weight: 600; margin: 26px 0 12px; }
/*
 * Cartão de NÚMERO: o número domina, a legenda recua.
 *
 * O que se lê aqui é "18,82 GB", "231 de 231", "1 divergente" — o resto é
 * rodapé. Em 22px o número tinha quase o peso do texto embaixo dele e o
 * cartão virava um parágrafo curto; em 30px, com a legenda um degrau abaixo
 * da meta comum, o olho pega o número de longe e só desce se quiser.
 */
.dono .cartao h2 { font-size: 30px; line-height: 1.2; margin: 0 0 3px; letter-spacing: -.02em; }
.dono .cartao .meta { font-size: 12.5px; }
.dono .cartao .meta + .meta { margin-top: 2px; }
.dono .cartao.alerta { border-color: var(--destaque); }
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
.md a { color: var(--destaque); border-bottom: 1px solid transparent; }
.md a:hover { border-bottom-color: var(--destaque); }
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
