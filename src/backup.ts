/**
 * Cópia do `ensinantes.db` dentro do próprio acervo.
 *
 * `ensinantes.db` mora em `BASE_DIR` — fora do disco onde vive o acervo, sem
 * redundância própria. Os vídeos e materiais já estão a salvo em `ACERVO`;
 * falta o catálogo que sabe o que cada item é, o progresso de quem estuda, e o
 * que deu erro na transcrição. Se `BASE_DIR` se perder, este projeto se
 * reconstrói do zero (`git clone` + `bun run scan`), mas o catálogo —
 * progresso, notas, estado da fila — não tem como ser refeito sem repetir
 * tudo. Por isso a cópia.
 *
 * `VACUUM INTO` em vez de copiar o arquivo cru: o banco roda em WAL, então
 * parte dos dados mais recentes pode estar só no `.db-wal`, ainda não
 * migrada para o `.db` principal — copiar o arquivo bruto arriscaria uma
 * foto inconsistente. `VACUUM INTO` sempre lê a visão consolidada (WAL +
 * principal) e não precisa de exclusividade: outro processo pode estar
 * escrevendo ao mesmo tempo.
 *
 * A escrita vai para um `.tmp` e só então vira o nome final por `rename` —
 * uma cópia interrompida a meio nunca substitui a anterior, que ainda era boa.
 */
import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";

import { ACERVO } from "./config.ts";
import { registrar } from "./db.ts";

export const COPIA_PATH = join(ACERVO, "ensinantes.db");

export interface Sincronizado {
  ok: boolean;
  bytes: number;
  ms: number;
  caminho: string;
  erro?: string;
}

export function sincronizarCopia(db: Database): Sincronizado {
  const inicio = Date.now();
  const tmp = `${COPIA_PATH}.tmp`;
  try {
    // VACUUM INTO recusa escrever num arquivo que já existe.
    if (existsSync(tmp)) unlinkSync(tmp);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    renameSync(tmp, COPIA_PATH);
    return { ok: true, bytes: statSync(COPIA_PATH).size, ms: Date.now() - inicio, caminho: COPIA_PATH };
  } catch (e) {
    const erro = String(e).slice(0, 300);
    // `log` não existe neste projeto — a função equivalente em `db.ts` é
    // `registrar`, com o mesmo formato (db, nível, origem, mensagem), só que
    // o nível é "erro" e não "error".
    registrar(db, "erro", "sync", `cópia do banco falhou: ${erro}`);
    return { ok: false, bytes: 0, ms: Date.now() - inicio, caminho: COPIA_PATH, erro };
  }
}
