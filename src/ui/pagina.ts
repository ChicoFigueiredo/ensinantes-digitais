import { CSS, CSS_ADMIN, CSS_CURSO, CSS_TRANSCRICAO } from "./tema.ts";
import { ADMIN_JS } from "./admin.ts";
import { HOME_JS } from "./home.ts";
import { PLAYER_JS } from "./player.ts";
import { TRANSCRICAO_JS } from "./transcricao.ts";
import { CURSO_JS } from "./curso.ts";

/**
 * A página inteira, servida tanto em `/` quanto em `/curso/<slug>`.
 *
 * O roteamento é do lado do cliente: o servidor devolve o mesmo HTML nas duas
 * rotas e o JS decide o que pintar pelo `location.pathname`. É o que permite
 * navegar entre curso e home sem recarregar e sem perder a posição do vídeo.
 */
export const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ensinantes Digitais</title>
<style>${CSS}${CSS_CURSO}${CSS_TRANSCRICAO}${CSS_ADMIN}</style>
</head>
<body>
<div id="app">carregando…</div>
<script>
${HOME_JS}
${ADMIN_JS}
${PLAYER_JS}
${TRANSCRICAO_JS}
${CURSO_JS}
const rota = () => location.pathname.startsWith('/curso/')
  ? pintarCurso(decodeURIComponent(location.pathname.slice('/curso/'.length)))
  : pintarHome();
addEventListener('popstate', rota);
rota();
</script>
</body>
</html>`;
