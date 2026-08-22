/**
 * Disco → catálogo.
 *
 * A decisão que sustenta este arquivo é o PRUNE. O acervo tem 172.004 PNGs de
 * recorte, contra 232 vídeos. Descer neles sobre drvfs — o filesystem do WSL
 * para /mnt/e — transforma um scan de segundos numa espera de dezenas de
 * minutos, e um scan que dói ninguém roda.
 *
 * A regra é por CONTEÚDO, não por nome: pasta que tem `.png` e não tem `.mp4` é
 * recorte. Casar por nome perderia as pastas de `00-Lives.de.Leads`, que têm
 * sufixo de resolução (`… 720 x 1280`) e não batem com o nome do vídeo.
 */
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { basename, join } from "node:path";
import type { Database } from "bun:sqlite";

import { ACERVO, PASTAS_IGNORADAS } from "./config.ts";
import { lerItem, lerLinhaLista, lerModulo, ordenarPorCodigo } from "./naming.ts";
import { registrar } from "./db.ts";

export type Tipo = "video" | "pdf" | "planilha" | "doc" | "link" | "markdown";

const TIPOS: Record<string, Tipo> = {
  ".mp4": "video", ".webm": "video", ".mkv": "video",
  ".pdf": "pdf",
  ".xlsx": "planilha", ".xls": "planilha",
  ".docx": "doc", ".doc": "doc", ".pptx": "doc", ".onepkg": "doc",
  ".url": "link",
  ".md": "markdown",
};

/**
 * Extensão → tipo, ou null quando o arquivo não é item.
 *
 * `.png` devolve null de propósito: existe um `icons8-ms-excel-48.png` solto
 * dentro do módulo 01 do curso 1, numa pasta que TEM vídeo e portanto não é
 * podada. Sem esta recusa ele viraria uma "aula" chamada icons8.
 *
 * `.srt`, `.txt` e `.sub` também são null: são sidecars do vídeo, e aparecem
 * amarrados a ele, não como linha própria.
 */
export function tipoDe(arquivo: string): Tipo | null {
  const p = arquivo.lastIndexOf(".");
  if (p < 0) return null;
  return TIPOS[arquivo.slice(p).toLowerCase()] ?? null;
}

export interface ItemBruto {
  tipo: Tipo;
  codigo: string | null;
  titulo: string;
  relPath: string;
  bytes: number;
  /** Legenda vigente, se houver irmã com o mesmo nome-base. */
  srtPath: string | null;
  /** URL do atalho, só para tipo `link`. */
  alvo: string | null;
}

export interface RecorteBruto { relPath: string; arquivos: number; bytes: number }

export interface Achado {
  itens: ItemBruto[];
  recortes: RecorteBruto[];
  /** Pastas e arquivos deixados de fora, para `relatorios/fora-do-catalogo.md`. */
  ignorados: string[];
}

/** Pasta com PNG e sem vídeo é recorte. Ver o comentário do topo. */
export function ehRecorte(entradas: Dirent[]): boolean {
  let png = false;
  for (const e of entradas) {
    if (!e.isFile()) continue;
    const n = e.name.toLowerCase();
    if (n.endsWith(".mp4") || n.endsWith(".webm") || n.endsWith(".mkv")) return false;
    if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg")) png = true;
  }
  return png;
}

/** Conta sem medir: o byte sai depois, numa passada só (ver `medirRecortes`). */
function contarRecorte(entradas: Dirent[]): number {
  let n = 0;
  for (const e of entradas) if (e.isFile()) n++;
  return n;
}

/**
 * Mede os bytes de várias pastas de recorte numa ÚNICA chamada ao `find`.
 *
 * Medir com `statSync` arquivo a arquivo custa ~17 min para os 172.004 PNGs do
 * acervo: cada chamada é um round-trip de 3-6 ms sobre drvfs, o filesystem do
 * WSL para /mnt/e. Um `find` só, com a lista inteira de pastas, faz o mesmo
 * trabalho em ~93 s porque o percurso acontece de um lado só da fronteira.
 *
 * As pastas de recorte são planas por construção, daí o `-maxdepth 1`.
 *
 * Devolve um mapa de caminho absoluto → bytes. Pasta ausente do mapa é pasta
 * que o `find` não conseguiu ler — quem chama decide o que fazer.
 *
 * `bin` só existe para o teste: `Bun.spawnSync` LANÇA quando o binário não
 * está no PATH (não devolve um `exitCode` não-zero), e num `const`/`let`
 * exportado o teste não consegue trocar o binário de fora do módulo — ESM
 * não deixa reatribuir um binding importado. Um parâmetro com valor padrão
 * "find" resolve isso sem mudar nada para quem chama sem o segundo argumento.
 */
export function medirRecortes(pastasAbsolutas: string[], bin = "find"): Map<string, number> {
  const medido = new Map<string, number>();
  if (!pastasAbsolutas.length) return medido;

  let saida: string;
  try {
    const p = Bun.spawnSync([
      bin, ...pastasAbsolutas, "-maxdepth", "1", "-type", "f", "-printf", "%h\\t%s\\n",
    ]);
    // Dois modos de falha diferentes: o `find` rodar e falhar (caminho inválido,
    // permissão) cai aqui; o `find` NÃO EXISTIR lança, e cai no catch.
    if (p.exitCode !== 0) return medido;
    saida = new TextDecoder().decode(p.stdout);
  } catch {
    return medido;   // sem `find` no PATH: bytes ficam em 0, a varredura segue
  }

  for (const linha of saida.split("\n")) {
    if (!linha) continue;
    const [dir, tamanho] = linha.split("\t");
    if (!dir || !tamanho) continue;
    medido.set(dir, (medido.get(dir) ?? 0) + Number(tamanho));
  }
  return medido;
}

/** `[InternetShortcut]\nURL=…` — atalho do Windows. */
function lerAtalho(absoluto: string): string | null {
  try {
    const m = /^URL=(.+)$/m.exec(readFileSync(absoluto, "utf-8"));
    return m?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Nome sem extensão, para casar vídeo com seus sidecars. */
function base(arquivo: string): string {
  const p = arquivo.lastIndexOf(".");
  return p < 0 ? arquivo : arquivo.slice(0, p);
}

/**
 * Varre UMA pasta de módulo. Não é recursiva por níveis arbitrários: o acervo
 * tem profundidade fixa (curso → módulo → arquivos), e a única subpasta que
 * existe é a de recortes, que não se desce.
 */
export function varrerPasta(absoluto: string, relativo: string): Achado {
  const itens: ItemBruto[] = [];
  const recortes: RecorteBruto[] = [];
  const ignorados: string[] = [];

  const entradas = readdirSync(absoluto, { withFileTypes: true });
  const arquivos = new Set(entradas.filter((e) => e.isFile()).map((e) => e.name));

  for (const e of entradas) {
    const rel = `${relativo}/${e.name}`;

    if (e.isDirectory()) {
      if (PASTAS_IGNORADAS.has(e.name)) { ignorados.push(rel); continue; }
      const dentro = readdirSync(join(absoluto, e.name), { withFileTypes: true });
      if (ehRecorte(dentro)) {
        // bytes fica em 0 de propósito: medir arquivo a arquivo aqui custa
        // 17 min sobre drvfs. Quem mede é `medirRecortes`, numa chamada só.
        recortes.push({ relPath: rel, arquivos: contarRecorte(dentro), bytes: 0 });
      } else {
        ignorados.push(rel);
      }
      continue;
    }

    if (!e.isFile()) continue;
    const tipo = tipoDe(e.name);
    if (!tipo) continue;

    const b = base(e.name);
    const srt = arquivos.has(`${b}.srt`) ? `${relativo}/${b}.srt` : null;

    const { codigo, titulo } = lerItem(e.name);
    itens.push({
      tipo, codigo, titulo, relPath: rel,
      bytes: statSync(join(absoluto, e.name)).size,
      srtPath: tipo === "video" ? srt : null,
      alvo: tipo === "link" ? lerAtalho(join(absoluto, e.name)) : null,
    });
  }

  return { itens, recortes, ignorados };
}

/** Ordem dos cursos na home. `Repo` fecha, como quarta seção. */
export const CURSOS_ESPERADOS = [
  "1-Ensinantes", "2-Acelerador.Conteudo.IA", "3-Criadores.Videos", "Repo",
] as const;

/**
 * Documentos pessoais que estão soltos na raiz do curso 1.
 *
 * Ficam FORA do catálogo porque o painel tem um segundo usuário: o boleto e o
 * certificado do Chico não são material de curso, e não há razão para o
 * Procópio topar com eles ao navegar. Aparecem em
 * `relatorios/fora-do-catalogo.md` — não somem, só não entram na navegação.
 */
export function ehPessoal(arquivo: string): boolean {
  return /^(boleto|certificado)[-_]/i.test(arquivo);
}

/** Restos de organização: scripts de criação de pasta e listas de trabalho. */
export function ehLixoDeOrganizacao(arquivo: string): boolean {
  return /^~\$/.test(arquivo)                    // lock do Excel
    || /^_/.test(arquivo)                        // _l.txt
    || /^(lista|gera_pastas)\./i.test(arquivo)
    || /\.(sh|bash|py|log)$/i.test(arquivo);
}

/** Duração em segundos por ffprobe. null quando o ffprobe não responde. */
export function duracaoDe(absoluto: string): number | null {
  const p = Bun.spawnSync([
    "ffprobe", "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", absoluto,
  ]);
  const n = Number(new TextDecoder().decode(p.stdout).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

const slugificar = (pasta: string): string =>
  pasta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
       .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Título do curso a partir da pasta: tira o prefixo numérico, humaniza. */
const tituloDoCurso = (pasta: string): string =>
  pasta === "Repo" ? "Materiais" : lerModulo(pasta).titulo;

/**
 * Escaneia um curso inteiro e escreve no banco.
 *
 * Idempotente por RECONCILIAÇÃO (marcar-e-varrer), não por apagar-e-recriar.
 * Um `DELETE FROM modulos` no início parecia mais simples, mas `itens.modulo_id`
 * tem `ON DELETE CASCADE`: apagar os módulos apagava TODOS os itens do curso
 * antes da reinserção, e isso quebrava três coisas de uma vez —
 *
 *   1. o cache de duração nunca existia: a linha já não estava lá quando o
 *      UPSERT rodava, então `jaTem` nunca achava nada e o ffprobe repetia
 *      nos 231 vídeos em toda varredura;
 *   2. `itens.id` não era estável entre scans — e é exatamente essa
 *      instabilidade que a chave textual `i:<id>` de `progresso`/`notas`
 *      precisa NÃO ter, porque essas tabelas sobrevivem à reconstrução do
 *      catálogo referenciando a aula pelo id;
 *   3. `transcricao_estado`, `tentativas`, `transcrito_em` e `comparacao`
 *      eram zerados a cada scan, mesmo já preenchidos por outra tarefa.
 *
 * A correção: cada varredura marca (em duas tabelas TEMP) o que encontrou no
 * disco, grava por UPSERT — o que preserva o id e as colunas de estado de
 * quem já existia — e só ao final apaga do banco o que não foi marcado. Itens
 * antes de módulos: apagar módulo primeiro levaria os itens junto pela
 * cascata, e a contagem de removidos mentiria.
 */
export function escanearCurso(db: Database, absoluto: string, posicao: number):
  { itens: number; recortes: number; ignorados: string[] } {
  const pasta = basename(absoluto);
  const slug = slugificar(pasta);

  const entradas = readdirSync(absoluto, { withFileTypes: true });
  const subpastas = entradas.filter((e) => e.isDirectory() && !PASTAS_IGNORADAS.has(e.name));
  const listaTxt = entradas.find((e) => e.isFile() && /^lista\.txt$/i.test(e.name));

  const materiais = pasta === "Repo";
  const esqueleto = !materiais && subpastas.length === 0 && !!listaTxt;
  const estado = materiais ? "materiais" : esqueleto ? "esqueleto" : "completo";

  db.run(`INSERT INTO cursos (slug, pasta, posicao, titulo, estado, escaneado_em)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(slug) DO UPDATE SET
            pasta = excluded.pasta, posicao = excluded.posicao,
            titulo = excluded.titulo, estado = excluded.estado,
            escaneado_em = excluded.escaneado_em`,
    [slug, pasta, posicao, tituloDoCurso(pasta), estado]);

  const cursoId = db.query<{ id: number }, [string]>(
    "SELECT id FROM cursos WHERE slug = ?").get(slug)!.id;

  // Tabelas de "visto nesta varredura", para a reconciliação do final. TEMP
  // porque são de vida curta e por conexão — não fazem parte do esquema.
  db.run("CREATE TEMP TABLE IF NOT EXISTS vistos_itens (rel_path TEXT PRIMARY KEY)");
  db.run("CREATE TEMP TABLE IF NOT EXISTS vistos_modulos (codigo TEXT PRIMARY KEY)");
  db.run("DELETE FROM vistos_itens");
  db.run("DELETE FROM vistos_modulos");

  const upsertModulo = db.prepare(
    `INSERT INTO modulos (curso_id, codigo, pasta, titulo, posicao)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(curso_id, codigo) DO UPDATE SET
       pasta = excluded.pasta, titulo = excluded.titulo, posicao = excluded.posicao`);
  const idDoModulo = db.query<{ id: number }, [number, string]>(
    "SELECT id FROM modulos WHERE curso_id = ? AND codigo = ?");
  const marcarModulo = db.prepare("INSERT OR IGNORE INTO vistos_modulos (codigo) VALUES (?)");
  const novoItem = db.prepare(
    `INSERT INTO itens (modulo_id, tipo, codigo, titulo, rel_path, posicao, bytes,
                        duracao, srt_path, alvo, transcricao_estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rel_path) DO UPDATE SET
       modulo_id = excluded.modulo_id, tipo = excluded.tipo, codigo = excluded.codigo,
       titulo = excluded.titulo, posicao = excluded.posicao, bytes = excluded.bytes,
       duracao = COALESCE(excluded.duracao, itens.duracao),
       srt_path = excluded.srt_path, alvo = excluded.alvo`);
  // Deliberadamente NÃO toca transcricao_estado, tentativas, transcrito_em
  // nem comparacao: são preenchidos por outras tarefas (transcrição), e uma
  // revarredura não pode apagar esse trabalho.
  const marcarItem = db.prepare("INSERT OR IGNORE INTO vistos_itens (rel_path) VALUES (?)");
  // `varrerPasta` sempre devolve bytes:0 para recorte (quem mede é
  // `medirRecortes`, numa chamada só, no fim de `escanearTudo` — descer pasta
  // a pasta aqui custaria de novo os ~90-215 s que a Tarefa 4 evitou). O
  // UPSERT por isso NÃO pode fazer `bytes = excluded.bytes`: isso apagaria a
  // medição a cada scan. A regra é preservar enquanto a contagem de arquivos
  // não mudar, e só zerar (forçando remedição) quando ela mudar.
  const novoRecorte = db.prepare(
    `INSERT INTO recortes (rel_path, arquivos, bytes, visto_em)
     VALUES (?, ?, 0, datetime('now'))
     ON CONFLICT(rel_path) DO UPDATE SET
       arquivos = excluded.arquivos,
       visto_em = excluded.visto_em,
       bytes = CASE WHEN excluded.arquivos = recortes.arquivos THEN recortes.bytes ELSE 0 END`);

  let nItens = 0, nRecortes = 0;
  const ignorados: string[] = [];

  /** Upsert do módulo + marca como visto. Nunca use lastInsertRowid aqui: num UPDATE ele não aponta para a linha atualizada. */
  const gravarModulo = (codigo: string, pastaModulo: string | null, titulo: string, pos: number): number => {
    upsertModulo.run(cursoId, codigo, pastaModulo, titulo, pos);
    marcarModulo.run(codigo);
    return idDoModulo.get(cursoId, codigo)!.id;
  };

  const gravarItens = (moduloId: number, achados: ItemBruto[]): void => {
    ordenarPorCodigo(achados).forEach((it, i) => {
      const abs = join(ACERVO, it.relPath);
      // ffprobe só no que ainda não tem duração: 232 chamadas na primeira vez,
      // zero nas seguintes — agora que o item sobrevive entre scans, esta
      // consulta de fato encontra o valor gravado no scan anterior.
      const jaTem = db.query<{ duracao: number | null }, [string]>(
        "SELECT duracao FROM itens WHERE rel_path = ?").get(it.relPath)?.duracao ?? null;
      const dur = it.tipo === "video" ? (jaTem ?? duracaoDe(abs)) : null;

      novoItem.run(moduloId, it.tipo, it.codigo, it.titulo, it.relPath, i, it.bytes,
        dur, it.srtPath, it.alvo,
        it.tipo === "video" ? (it.srtPath ? "pronto" : "pendente") : "sem-video");
      marcarItem.run(it.relPath);
      nItens++;
    });
  };

  // Tudo numa transação: agora são upserts seguidos de duas varreduras de
  // reconciliação, e uma interrupção no meio deixaria o curso pela metade.
  const rodar = db.transaction(() => {
    if (esqueleto) {
      // Sem pasta nenhuma: os módulos vêm do lista.txt, que é CRLF. Ainda
      // assim pode haver arquivo solto (ex.: `gera_pastas.bash`) — nenhum
      // vira item, mas entram em `ignorados` para o relatório da Tarefa 6.
      const achado = varrerPasta(absoluto, pasta);
      ignorados.push(...achado.ignorados, ...achado.itens.map((it) => it.relPath));

      const linhas = readFileSync(join(absoluto, listaTxt!.name), "utf-8").split("\n");
      let pos = 0;
      for (const linha of linhas) {
        const n = lerLinhaLista(linha);
        if (!n) continue;
        gravarModulo(n.codigo ?? String(pos + 1).padStart(2, "0"), null, n.titulo, pos++);
      }
    } else if (materiais) {
      // Um módulo implícito. Os markdowns e a planilha entram; script, log,
      // lock do Excel e versoes_anteriores ficam fora.
      const modId = gravarModulo("00", null, "Documentos", 0);
      const achado = varrerPasta(absoluto, pasta);
      ignorados.push(...achado.ignorados);
      const validos: ItemBruto[] = [];
      for (const it of achado.itens) {
        if (ehLixoDeOrganizacao(basename(it.relPath))) { ignorados.push(it.relPath); continue; }
        validos.push(it);
      }
      gravarItens(modId, validos);
    } else {
      // Curso completo: um módulo por subpasta, na ordem do código.
      const ordenados = ordenarPorCodigo(subpastas.map((d) => ({ ...lerModulo(d.name), pasta: d.name })));
      ordenados.forEach((m, pos) => {
        const modId = gravarModulo(m.codigo ?? m.pasta, m.pasta, m.titulo, pos);
        const achado = varrerPasta(join(absoluto, m.pasta), `${pasta}/${m.pasta}`);
        ignorados.push(...achado.ignorados);
        gravarItens(modId, achado.itens);
        for (const r of achado.recortes) { novoRecorte.run(r.relPath, r.arquivos); nRecortes++; }
      });

      // Arquivos soltos na raiz do curso — existem no curso 1. A mesma
      // varredura do nível raiz também reencontra as próprias pastas de
      // módulo (elas não são recorte nem PASTAS_IGNORADAS, então
      // `varrerPasta` as devolve como "ignoradas"): essas são falso-positivo
      // aqui, porque já foram catalogadas acima — por isso ficam de fora do
      // relatório de ignorados.
      const nomesModulos = new Set(subpastas.map((d) => d.name));
      const achadoRaiz = varrerPasta(absoluto, pasta);
      for (const rel of achadoRaiz.ignorados) {
        if (nomesModulos.has(basename(rel))) continue;
        ignorados.push(rel);
      }
      const soltos: ItemBruto[] = [];
      for (const it of achadoRaiz.itens) {
        const nome = basename(it.relPath);
        if (ehPessoal(nome) || ehLixoDeOrganizacao(nome)) { ignorados.push(it.relPath); continue; }
        soltos.push(it);
      }
      if (soltos.length) {
        const modId = gravarModulo("ZZ", null, "Avulsos", ordenados.length);
        gravarItens(modId, soltos);
      }
    }

    // Reconciliação: o que sumiu do disco (ou não foi tocado nesta
    // varredura, ex.: curso que virou esqueleto) sai do catálogo. Itens
    // antes de módulos — a ordem importa, ver o comentário do topo.
    db.run(
      `DELETE FROM itens
        WHERE modulo_id IN (SELECT id FROM modulos WHERE curso_id = ?)
          AND rel_path NOT IN (SELECT rel_path FROM vistos_itens)`, [cursoId]);
    db.run(
      `DELETE FROM modulos
        WHERE curso_id = ?
          AND codigo NOT IN (SELECT codigo FROM vistos_modulos)`, [cursoId]);
  });
  rodar();

  registrar(db, "info", "scan", `${pasta}: ${nItens} itens, ${nRecortes} pastas de recorte`);
  return { itens: nItens, recortes: nRecortes, ignorados };
}

/**
 * Mede em lote os recortes que ainda não têm byte.
 *
 * Uma passada do `find` sobre os 171.998 PNGs custa ~90 s numa máquina ociosa.
 * Por isso só as pastas com `bytes = 0` entram: numa segunda varredura, sem
 * mudança no disco, esta função não chama nada.
 */
function medirOsQueFaltam(db: Database): { medidas: number; bytes: number } {
  const pendentes = db.query<{ rel_path: string }, []>(
    "SELECT rel_path FROM recortes WHERE bytes = 0").all();
  if (!pendentes.length) return { medidas: 0, bytes: 0 };

  const porAbsoluto = new Map(pendentes.map((p) => [join(ACERVO, p.rel_path), p.rel_path]));
  const medido = medirRecortes([...porAbsoluto.keys()]);

  const gravar = db.prepare("UPDATE recortes SET bytes = ? WHERE rel_path = ?");
  let total = 0;
  const lote = db.transaction(() => {
    for (const [absoluto, bytes] of medido) {
      const rel = porAbsoluto.get(absoluto);
      if (!rel) continue;          // o `find` devolveu pasta que não pedimos
      gravar.run(bytes, rel);
      total += bytes;
    }
  });
  lote();
  return { medidas: medido.size, bytes: total };
}

/**
 * Roda os quatro cursos na ordem da home e, ao final, mede em lote os
 * recortes que ainda não têm byte. `bytesRecortes` é o total ACUMULADO de
 * todas as pastas de recorte no banco (medidas agora ou em scans
 * anteriores) — não só o que foi medido nesta chamada.
 */
export function escanearTudo(db: Database):
  { cursos: number; itens: number; recortes: number; ignorados: string[]; bytesRecortes: number } {
  let cursos = 0, itens = 0, recortes = 0;
  const ignorados: string[] = [];
  CURSOS_ESPERADOS.forEach((pasta, i) => {
    const abs = join(ACERVO, pasta);
    if (!existsSync(abs)) { registrar(db, "erro", "scan", `pasta ausente: ${pasta}`); return; }
    const r = escanearCurso(db, abs, i);
    cursos++; itens += r.itens; recortes += r.recortes;
    ignorados.push(...r.ignorados);
  });

  const medicao = medirOsQueFaltam(db);
  const bytesRecortes = db.query<{ bytes: number | null }, []>(
    "SELECT SUM(bytes) bytes FROM recortes").get()?.bytes ?? 0;
  registrar(db, "info", "scan",
    `recortes medidos agora: ${medicao.medidas} pasta(s); total acumulado: ${(bytesRecortes / 1073741824).toFixed(2)} GB`);

  return { cursos, itens, recortes, ignorados, bytesRecortes };
}
