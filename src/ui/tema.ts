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
