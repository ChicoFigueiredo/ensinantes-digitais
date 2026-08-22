import { CSS } from "./tema.ts";
import { HOME_JS } from "./home.ts";

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
<style>${CSS}</style>
</head>
<body>
<div id="app">carregando…</div>
<script>
${HOME_JS}
// A tela de curso entra na Tarefa 11, junto com o import de CURSO_JS e o
// desvio por location.pathname. Aqui a home é a única tela que existe.
const rota = () => pintarHome();
addEventListener('popstate', rota);
rota();
</script>
</body>
</html>`;
