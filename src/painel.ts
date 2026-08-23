/**
 * O painel — `bun run painel`, depois http://127.0.0.1:17789
 *
 * O roteamento vive em `montarResposta`, que recebe `Request` e devolve
 * `Response` sem abrir porta nenhuma. É o que permite testar a matriz de
 * permissões inteira em memória, sem subir servidor nem fingir rede.
 *
 * A ordem dentro de `montarResposta` importa: a checagem de rota
 * administrativa vem ANTES de qualquer despacho. Uma rota nova que rode
 * processo só precisa entrar em ROTAS_ADMIN para ficar protegida — não há como
 * esquecer de proteger, só como esquecer de listar.
 *
 * A string usada para decidir QUAL handler roda e a string usada para checar
 * SE ele pode rodar são a MESMA: `url.pathname`, sem normalização nenhuma
 * depois. Duas normalizações diferentes — uma para rotear, outra para checar
 * — é como um portão de permissão deixa de valer sem ninguém notar. Por isso
 * nada aqui colapsa barras duplicadas, tira barra final ou mexe em caixa: uma
 * rota que não bate exatamente com um `if` cai no 404, que é seguro.
 */
import type { Database } from "bun:sqlite";

import {
  BANCO_DE_TESTE, DB_PATH, LIMIAR_PALAVRAS, LIMIAR_SIMILARIDADE, PAINEL_HOST, type Usuario,
} from "./config.ts";
import {
  aplicarSync, lerNotas, lerPrefs, lerProgresso, registrar, tocarSessao, ultimoAberto,
} from "./db.ts";
import { dentroDoAcervo, servirArquivo } from "./arquivos.ts";
import { lerTrechos, srtParaVtt } from "./legenda.ts";
import { paraHtml } from "./markdown.ts";
import { sincronizarCopia } from "./backup.ts";
import { gerarRecortes } from "./recortes.ts";
import { abrirNoSistema, revelar } from "./revelar.ts";
import { disparar, estadoTarefas } from "./tarefas.ts";
import { ehRotaAdmin, indicadores, permissoesDe, quemE } from "./usuario.ts";
import { PAGINA } from "./ui/pagina.ts";

export interface ItemArvore {
  id: number; tipo: string; codigo: string | null; titulo: string;
  duracao: number | null; temLegenda: boolean;
  /** Endereço externo dos itens `.url` — ver `alvoExterno`. */
  alvo?: string;
  /** Só para quem tem `verDisco` / `verCaminhos`. */
  bytes?: number; relPath?: string; estado?: string;
}

export interface CursoArvore {
  slug: string; titulo: string; estado: string;
  modulos: { codigo: string; titulo: string; itens: ItemArvore[] }[];
}

interface LinhaArvore {
  curso_slug: string; curso_titulo: string; curso_estado: string;
  mod_codigo: string; mod_titulo: string; mod_pos: number;
  id: number | null; tipo: string | null; codigo: string | null; titulo: string | null;
  duracao: number | null; bytes: number | null; rel_path: string | null; alvo: string | null;
  srt_path: string | null; transcricao_estado: string | null; pos: number | null;
}

/**
 * O endereço que um item de link abre, ou `undefined`.
 *
 * Os 12 itens `.url` do acervo guardam a URL em `itens.alvo` desde o scan, mas
 * nenhuma consulta a lia: o palco mandava o clique para `/api/arquivo`, que
 * servia o `.url` cru — `application/octet-stream`, 47 bytes de INI baixados em
 * vez do site aberto.
 *
 * Só `http`/`https` sai daqui. Um atalho pode apontar para `file:///E:/…`, e
 * esse é um caminho de disco desta máquina — não vai para o convidado, e nem
 * mesmo para o dono vale a pena, porque o navegador não abre `file:` a partir
 * de uma página. Nesses casos o item cai no comportamento antigo (baixar o
 * `.url`), que é feio mas não vaza nada.
 */
export function alvoExterno(alvo: string | null): string | undefined {
  const limpo = alvo?.trim();
  return limpo && /^https?:\/\//i.test(limpo) ? limpo : undefined;
}

/**
 * Monta a árvore já FILTRADA pelo que o usuário pode ver.
 *
 * O filtro é aqui, no servidor, e não no CSS da página: o procópio não recebe
 * os bytes nem o caminho, então nem o "ver código-fonte" os entrega.
 */
export function arvore(db: Database, usuario: Usuario, slug?: string): CursoArvore[] {
  const pode = permissoesDe(usuario);
  const linhas = db.query<LinhaArvore, [string | null, string | null]>(`
    SELECT c.slug curso_slug, c.titulo curso_titulo, c.estado curso_estado,
           m.codigo mod_codigo, m.titulo mod_titulo, m.posicao mod_pos,
           i.id, i.tipo, i.codigo, i.titulo, i.duracao, i.bytes, i.rel_path, i.alvo,
           i.srt_path, i.transcricao_estado, i.posicao pos
      FROM cursos c
      JOIN modulos m ON m.curso_id = c.id
      LEFT JOIN itens i ON i.modulo_id = m.id
     WHERE (?1 IS NULL OR c.slug = ?2)
     ORDER BY c.posicao, m.posicao, i.posicao`).all(slug ?? null, slug ?? null);

  const cursos = new Map<string, CursoArvore>();
  for (const l of linhas) {
    let c = cursos.get(l.curso_slug);
    if (!c) {
      c = { slug: l.curso_slug, titulo: l.curso_titulo, estado: l.curso_estado, modulos: [] };
      cursos.set(l.curso_slug, c);
    }
    let m = c.modulos.at(-1);
    if (!m || m.codigo !== l.mod_codigo) {
      m = { codigo: l.mod_codigo, titulo: l.mod_titulo, itens: [] };
      c.modulos.push(m);
    }
    if (l.id === null) continue;

    const item: ItemArvore = {
      id: l.id, tipo: l.tipo!, codigo: l.codigo, titulo: l.titulo!,
      duracao: l.duracao, temLegenda: !!l.srt_path,
    };
    // Endereço de site é conteúdo de curso, como o título: vai para os dois.
    if (l.tipo === "link") item.alvo = alvoExterno(l.alvo);
    if (pode.verDisco) item.bytes = l.bytes ?? 0;
    if (pode.verCaminhos) item.relPath = l.rel_path ?? undefined;
    if (pode.verFila) item.estado = l.transcricao_estado ?? undefined;
    m.itens.push(item);
  }
  return [...cursos.values()];
}

interface DiscoItens { itens: number; bytes: number | null; segundos: number | null }
interface DiscoRecortes { pastas: number; arquivos: number | null; bytes: number | null }

/** Números do acervo — só para quem tem `verDisco`. */
function disco(db: Database) {
  return {
    ...db.query<DiscoItens, []>(`SELECT COUNT(*) itens, SUM(bytes) bytes, SUM(duracao) segundos FROM itens`).get(),
    recortes: db.query<DiscoRecortes, []>(
      `SELECT COUNT(*) pastas, SUM(arquivos) arquivos, SUM(bytes) bytes FROM recortes`).get(),
  };
}

/** Estado da transcrição — só para quem tem `verFila`. */
function fila(db: Database) {
  return db.query(`SELECT transcricao_estado estado, COUNT(*) n
                     FROM itens WHERE tipo = 'video' GROUP BY 1`).all();
}

export interface Comparacao {
  palavras_nova: number;
  palavras_antiga: number;
  palavras_unicas_antiga: number;
  similaridade: number;
}

/**
 * Encolheu demais, ou mudou demais.
 *
 * Crescer NÃO é motivo de alarme por si: uma passada nova pegando mais fala
 * que a transcrição velha é o resultado desejado. Só a similaridade baixa
 * denuncia que o conteúdo mudou de verdade.
 *
 * O mesmo critério está duplicado no lado Python
 * (py/ensinantes/comparar.py, `divergente`). Duplicado de propósito: são
 * dois processos, e um import cruzado entre eles custaria mais do que ganha
 * — mas os dois têm de dizer a mesma coisa.
 */
export function ehDivergente(comparacao: Comparacao): boolean {
  const { palavras_antiga, palavras_nova, similaridade } = comparacao;
  const encolheu = palavras_antiga > 0 && palavras_nova < palavras_antiga * LIMIAR_PALAVRAS;
  const mudou = similaridade < LIMIAR_SIMILARIDADE;
  return encolheu || mudou;
}

export interface LinhaComparacao { id: number; titulo: string; comparacao: string }

/**
 * Separa as divergências do que não deu para ler.
 *
 * A versão anterior fazia `JSON.parse(l.comparacao)` cru dentro de um `.map`:
 * UMA linha malformada estourava, `fetchSeguro` transformava em 500 e o dono
 * perdia `/api/tudo` inteiro — árvore, progresso e notas junto. A home sumia
 * por causa de um campo de diagnóstico.
 *
 * O gêmeo Python (`relatorio_divergencias`, em py/ensinantes/comparar.py) já
 * faz assim: linha ruim vai para `malformados`, o relatório sai e ainda as
 * anuncia. Quem escreve a coluna é o `json.dumps` de lá e ela sempre sai
 * válida — isto é defesa em profundidade contra uma linha corrompida no
 * banco, não contra o caminho normal.
 */
export function separarDivergencias(linhas: LinhaComparacao[]) {
  const lista: { id: number; titulo: string; comparacao: Comparacao }[] = [];
  const ilegiveis: string[] = [];

  for (const l of linhas) {
    let comparacao: unknown;
    try {
      comparacao = JSON.parse(l.comparacao);
    } catch {
      ilegiveis.push(l.titulo);
      continue;
    }
    // `JSON.parse('null')` não lança, e desestruturar null lança — o mesmo
    // 500 pela porta dos fundos.
    if (!comparacao || typeof comparacao !== "object") { ilegiveis.push(l.titulo); continue; }
    if (ehDivergente(comparacao as Comparacao)) {
      lista.push({ id: l.id, titulo: l.titulo, comparacao: comparacao as Comparacao });
    }
  }
  return { lista, ilegiveis };
}

function itemPorId(db: Database, id: number) {
  return db.query<{ rel_path: string; srt_path: string | null; titulo: string; tipo: string }, [number]>(
    "SELECT rel_path, srt_path, titulo, tipo FROM itens WHERE id = ?").get(id);
}

/**
 * Item pedido pela query `?id=`, ou `undefined`. O caminho sai do BANCO,
 * nunca da URL — `id` só serve para achar a linha.
 *
 * `Number(null)` vira `0` e `Number("abc")` vira `NaN`, e os dois iriam para
 * a consulta se não fossem barrados aqui: devolver `undefined` antes de
 * consultar é mais honesto sobre "não tem id válido" do que deixar o SQL
 * simplesmente não achar nada, e evita ida ao banco à toa.
 */
function itemPedido(db: Database, url: URL) {
  const id = Number(url.searchParams.get("id"));
  return Number.isInteger(id) && id > 0 ? itemPorId(db, id) : undefined;
}

/**
 * Lê a legenda de um item, com o caminho do banco reconferido contra o
 * acervo antes de abrir o arquivo — a mesma trança que `servirArquivo` usa
 * para o vídeo. O `srt_path` vem do banco, mas a checagem é barata e é a
 * última linha antes de o processo abrir um arquivo.
 */
async function lerSrtDoItem(srtPath: string): Promise<string | null> {
  const alvo = dentroDoAcervo(srtPath);
  if (!alvo) return null;
  return Bun.file(alvo).text();
}

export async function montarResposta(db: Database, req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Uma única string decide QUAL handler roda e SE ele pode rodar. Duas
  // normalizações diferentes — uma para rotear, outra para checar — é como um
  // portão de permissão deixa de valer sem ninguém notar.
  const rota = url.pathname;
  const usuario = quemE(req);
  const pode = permissoesDe(usuario);

  tocarSessao(db, usuario);

  // Primeira tranca, antes de qualquer despacho. A segunda é o 403 do nginx.
  if (ehRotaAdmin(rota) && !pode.admin) {
    return Response.json({ ok: false, msg: "só o chico" }, { status: 403 });
  }

  if (rota === "/" || rota.startsWith("/curso/")) {
    return new Response(PAGINA, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (rota === "/api/eu") {
    return Response.json({ usuario, permissoes: pode, indicadores: indicadores(db, usuario) });
  }

  if (rota === "/api/tudo") {
    const slug = url.searchParams.get("curso") ?? undefined;
    const corpo: Record<string, unknown> = {
      usuario, permissoes: pode, indicadores: indicadores(db, usuario),
      arvore: arvore(db, usuario, slug),
      progresso: lerProgresso(db, usuario),
      notas: lerNotas(db, usuario),
      prefs: lerPrefs(db, usuario),
      retomar: ultimoAberto(db, usuario),
    };
    // Nada de card de disco, fila ou evento para quem não pode vê-los: a chave
    // simplesmente não existe na resposta.
    if (pode.verDisco) corpo.disco = disco(db);
    if (pode.verFila) {
      corpo.fila = fila(db);
      corpo.eventos = db.query(
        "SELECT at, nivel, origem, mensagem FROM eventos ORDER BY id DESC LIMIT 120").all();
      corpo.tarefas = estadoTarefas();
    }
    if (pode.verDivergencias) {
      const { lista, ilegiveis } = separarDivergencias(
        db.query<LinhaComparacao, []>(`
          SELECT id, titulo, comparacao FROM itens
           WHERE comparacao IS NOT NULL ORDER BY id`).all());
      corpo.divergencias = lista;
      // Só aparece quando há o que anunciar — como o aviso do relatório Python.
      if (ilegiveis.length) corpo.divergenciasIlegiveis = ilegiveis;
    }
    return Response.json(corpo);
  }

  // Toda escrita do painel entra por aqui, em lote. O navegador enfileira no
  // localStorage e só tira da fila o que este endpoint confirmar — é o que faz
  // uma piscada do túnel deixar de engolir o que a pessoa marcou.
  //
  // NUNCA bloquear no nginx: sem ela o painel não fica somente-leitura, fica
  // quebrado, com a fila enchendo para sempre.
  if (rota === "/api/sync" && req.method === "POST") {
    const corpo = (await req.json().catch(() => null)) as { ops?: unknown[] } | null;
    if (!corpo || !Array.isArray(corpo.ops)) {
      return Response.json({ ok: false, msg: "fila inválida" }, { status: 400 });
    }
    // Op malformada é recusada uma a uma dentro de `aplicarSync`, e a resposta
    // sai 200 mesmo assim: um 500 aqui deixaria o lote inteiro na fila do
    // localStorage, e ela reenviaria o mesmo lote a cada 8 s para sempre,
    // engolindo em silêncio tudo que a pessoa marcasse depois.
    const r = aplicarSync(db, usuario, corpo.ops);
    return Response.json({
      ok: true, ...r,
      progresso: lerProgresso(db, usuario),
      notas: lerNotas(db, usuario),
      prefs: lerPrefs(db, usuario),
    });
  }

  if (rota === "/api/video" || rota === "/api/arquivo") {
    const item = itemPedido(db, url);
    if (!item) return new Response("não encontrado", { status: 404 });
    return servirArquivo(item.rel_path, req);
  }

  if (rota === "/api/legenda") {
    const item = itemPedido(db, url);
    if (!item?.srt_path) return new Response("sem legenda", { status: 404 });
    const srt = await lerSrtDoItem(item.srt_path);
    if (srt === null) return new Response("não encontrado", { status: 404 });
    return new Response(srtParaVtt(srt), {
      headers: { "Content-Type": "text/vtt; charset=utf-8" },
    });
  }

  if (rota === "/api/transcricao") {
    const item = itemPedido(db, url);
    if (!item?.srt_path) return Response.json({ trechos: [] });
    const srt = await lerSrtDoItem(item.srt_path);
    if (srt === null) return Response.json({ trechos: [] });
    return Response.json({ titulo: item.titulo, trechos: lerTrechos(srt) });
  }

  // Materiais (`Repo/`) é conteúdo de curso: os dois usuários veem. A
  // resposta só tem `titulo` e `html` — nada de `rel_path`, `bytes` nem
  // estado de fila entra aqui, então não há campo para esconder do
  // procópio, ao contrário de `/api/tudo`.
  if (rota === "/api/markdown") {
    const item = itemPedido(db, url);
    if (!item) return new Response("não encontrado", { status: 404 });
    // O `id` vem da URL, então ele decide QUAL linha do banco, mas não decide
    // o que aquela linha é. Sem esta conferência, `?id=` de um vídeo fazia a
    // rota ler o .mp4 inteiro como texto e devolver como JSON: um vídeo de
    // 2,5 MB virou 6,6 MB de resposta, e o de 541 MB derruba o painel — de
    // graça, e para o convidado também, que tem acesso a esta rota.
    if (item.tipo !== "markdown") return new Response("não é material de texto", { status: 400 });
    const alvo = dentroDoAcervo(item.rel_path);
    if (!alvo) return new Response("fora do acervo", { status: 400 });
    return Response.json({ titulo: item.titulo, html: paraHtml(await Bun.file(alvo).text()) });
  }

  // Daqui para baixo, só o chico chega: `ehRotaAdmin` já barrou o resto lá em
  // cima. O que falta aqui é validar o pedido, não o pedinte.
  if (rota === "/api/run" && req.method === "POST") {
    const { nome } = (await req.json().catch(() => ({}))) as { nome?: string };
    const r = disparar(String(nome));
    return Response.json(r, { status: r.ok ? 200 : 400 });
  }

  if (rota === "/api/requeue" && req.method === "POST") {
    const n = db.run(
      "UPDATE itens SET transcricao_estado = 'pendente', transcricao_erro = NULL WHERE transcricao_estado = 'erro'").changes;
    return Response.json({ ok: true, reenfileirados: n });
  }

  if ((rota === "/api/revelar" || rota === "/api/abrir") && req.method === "POST") {
    const { id } = (await req.json().catch(() => ({}))) as { id?: number };
    const item = itemPorId(db, Number(id));
    // O caminho sai do BANCO, nunca da requisição: é o que impede uma URL
    // forjada de virar "abra qualquer arquivo desta máquina".
    if (!item) return Response.json({ ok: false, msg: "item não encontrado" }, { status: 404 });
    // Confere aqui para poder devolver 400 (em vez de 200 com ok:false) num
    // rel_path fora do acervo — mas quem manda de verdade é `revelar.ts`, que
    // faz a MESMA checagem com `dentroDoAcervo` de novo antes de executar
    // qualquer coisa. É a mesma função robusta chamada duas vezes, não duas
    // versões diferentes da checagem.
    if (!dentroDoAcervo(item.rel_path)) return Response.json({ ok: false, msg: "fora do acervo" }, { status: 400 });
    return Response.json(
      rota === "/api/revelar" ? await revelar(item.rel_path) : await abrirNoSistema(item.rel_path));
  }

  if (rota === "/api/limpeza" && req.method === "POST") {
    // Só o relatório de recortes: o `fora-do-catalogo.md` depende dos
    // `ignorados` que a varredura produz, e quem os tem é o `bun run scan`.
    return Response.json({ ok: true, ...gerarRecortes(db) });
  }

  return new Response("não encontrado", { status: 404 });
}

/**
 * A borda de verdade: o que o `Bun.serve` chama para cada requisição.
 *
 * Sem este `try/catch`, uma exceção não tratada em qualquer rota faz o Bun
 * devolver a página de erro de desenvolvimento — que embute linha de
 * código-fonte, nome de função e o CAMINHO ABSOLUTO do projeto no HTML. Isso é
 * inofensivo num servidor que só um dev acessa, mas este painel fica exposto
 * na internet por um túnel, atrás de senha: o procópio (ou qualquer um que
 * passe pela senha) veria a mesma coisa numa rota livre que estourasse.
 *
 * O erro continua indo para o console e para `eventos` — onde o dono o lê, no
 * card de eventos da Tarefa 16. O que muda é só o que sai pela rede: nunca
 * mais que "erro interno" e um 500.
 *
 * É uma função à parte, e não um `try/catch` inline dentro do `fetch` de
 * `Bun.serve`, para dar um jeito de testar a borda sem abrir porta de
 * verdade — os testes chamam `fetchSeguro` direto, do mesmo jeito que chamam
 * `montarResposta`.
 */
export async function fetchSeguro(db: Database, req: Request): Promise<Response> {
  try {
    return await montarResposta(db, req);
  } catch (e) {
    console.error(e);
    try {
      registrar(db, "erro", "painel", `${new URL(req.url).pathname}: ${e}`);
    } catch {
      // Se até `registrar` falhar — o próprio erro original pode ter sido o
      // banco travado, o mesmo banco que `registrar` grava — a resposta AINDA
      // tem de sair limpa. O console fica com a única cópia deste caso raro.
    }
    return new Response("erro interno", { status: 500 });
  }
}

const TENTATIVAS_PORTA = 20;

/** De quanto em quanto tempo o catálogo é copiado para o acervo. */
const MINUTOS_ENTRE_COPIAS = 30;

/** Copia o catálogo, e diz no log se falhou — nunca derruba o painel por isso. */
function copiarBanco(db: Database): void {
  const r = sincronizarCopia(db);
  if (!r.ok) console.warn(`cópia do catálogo falhou: ${r.erro}`);
}

export function servir(db: Database, porta: number): void {
  for (let p = porta; p < porta + TENTATIVAS_PORTA; p++) {
    try {
      if (p !== porta) console.log(`porta ${p - 1} em uso — tentando ${p}…`);
      Bun.serve({ hostname: PAINEL_HOST, port: p, fetch: (req) => fetchSeguro(db, req) });
      console.log(`painel em http://${PAINEL_HOST}:${p}`);
      // Quem sobe um painel de teste precisa VER que é de teste. Sem esta
      // linha, a tela é idêntica à do banco de verdade, e marcar aula achando
      // que é teste (ou o contrário) só se descobre depois.
      if (BANCO_DE_TESTE) console.log(`  banco de TESTE: ${DB_PATH}`);

      // O acervo tem redundância; `ensinantes.db` não. Vídeo e PDF se
      // recuperam do disco original, e o catálogo se refaz com `bun run scan`
      // — mas progresso, anotação e estado da fila só existem aqui. Copiar na
      // subida e de tempos em tempos é o que separa "perdi o índice" de
      // "perdi o que eu já tinha estudado".
      copiarBanco(db);
      setInterval(() => copiarBanco(db), MINUTOS_ENTRE_COPIAS * 60_000).unref();
      // A porta TEM de ser a 17789 para o túnel funcionar. Painel em outra
      // porta = túnel entregando em porta vazia = 502 no tablet, e o terminal
      // aqui parecendo normal.
      if (p !== porta) console.warn(`ATENÇÃO: o túnel aponta para a ${porta}. De fora, isto será 502.`);
      return;
    } catch (e) {
      if ((e as { code?: string })?.code === "EADDRINUSE") continue;
      throw e;
    }
  }
  console.error(`Nenhuma porta livre entre ${porta} e ${porta + TENTATIVAS_PORTA - 1}.`);
  console.error(`  ver quem está:  ss -lptn 'sport = :${porta}'`);
  process.exit(1);
}
