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
import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";

import { PASTAS_IGNORADAS } from "./config.ts";
import { lerItem } from "./naming.ts";

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
 */
export function medirRecortes(pastasAbsolutas: string[]): Map<string, number> {
  const medido = new Map<string, number>();
  if (!pastasAbsolutas.length) return medido;

  const p = Bun.spawnSync([
    "find", ...pastasAbsolutas, "-maxdepth", "1", "-type", "f", "-printf", "%h\\t%s\\n",
  ]);
  if (p.exitCode !== 0) return medido;   // sem `find`: quem chama fica com 0

  for (const linha of new TextDecoder().decode(p.stdout).split("\n")) {
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
