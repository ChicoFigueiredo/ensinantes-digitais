/**
 * Servir arquivo do acervo, com `Range` de verdade.
 *
 * Sem `Range` o navegador carrega o vídeo mas não deixa arrastar a linha do
 * tempo — só tocar do começo. Em aula de 40 minutos isso é a diferença entre o
 * painel ser usável e ser um enfeite.
 *
 * O caminho SEMPRE passa por `dentroDoAcervo`. Quem chama entrega um caminho
 * vindo do banco, mas a conferência fica aqui: é barata, e é a última linha
 * antes de o processo abrir um arquivo.
 */
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { ACERVO } from "./config.ts";

const TIPOS: Record<string, string> = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".onepkg": "application/onenote",
};

export function mime(caminho: string): string {
  const p = caminho.lastIndexOf(".");
  if (p < 0) return "application/octet-stream";
  return TIPOS[caminho.slice(p).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve e confere. Devolve o absoluto, ou null quando o caminho sai do acervo.
 *
 * `resolve` normaliza o `..` ANTES da comparação — comparar a string crua
 * deixaria `1-Ensinantes/../../etc/passwd` passar.
 */
export function dentroDoAcervo(relPath: string): string | null {
  const alvo = resolve(join(ACERVO, relPath));
  const raiz = resolve(ACERVO);
  return alvo === raiz || alvo.startsWith(raiz + "/") ? alvo : null;
}

export function servirArquivo(relPath: string, req: Request): Response {
  const alvo = dentroDoAcervo(relPath);
  if (!alvo || !existsSync(alvo)) return new Response("não encontrado", { status: 404 });

  const tamanho = statSync(alvo).size;
  const tipo = mime(alvo);
  const range = req.headers.get("range");

  if (!range) {
    return new Response(Bun.file(alvo), {
      headers: { "Content-Type": tipo, "Content-Length": String(tamanho), "Accept-Ranges": "bytes" },
    });
  }

  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const inicio = m?.[1] ? Number(m[1]) : 0;
  const fim = m?.[2] ? Number(m[2]) : tamanho - 1;
  if (inicio >= tamanho || fim >= tamanho || inicio > fim) {
    return new Response("range inválido", {
      status: 416, headers: { "Content-Range": `bytes */${tamanho}` },
    });
  }

  return new Response(Bun.file(alvo).slice(inicio, fim + 1), {
    status: 206,
    headers: {
      "Content-Type": tipo,
      "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`,
      "Content-Length": String(fim - inicio + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
