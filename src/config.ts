/**
 * Configuração central. É o ÚNICO arquivo que lê `process.env`.
 *
 * O Bun carrega o `.env` da raiz sozinho — não há dotenv. O lado Python lê o
 * mesmo arquivo em `py/ensinantes/config.py`, então toda variável nova entra
 * nos dois e no `.env.example`.
 */
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** Raiz do acervo. Por padrão o symlink `acervo` → /mnt/e/Marketing/Ensinantes.Digitais */
const acervoBruto = process.env.ED_ACERVO ?? "./acervo";
export const ACERVO = isAbsolute(acervoBruto) ? acervoBruto : resolve(BASE_DIR, acervoBruto);

/** O banco fica no projeto, NUNCA no acervo: o acervo é conteúdo, não estado. */
export const DB_PATH = join(BASE_DIR, "ensinantes.db");
export const RELATORIOS = join(BASE_DIR, "relatorios");
export const SCRIPTS = join(BASE_DIR, "scripts");

/**
 * A porta vale dos dois lados do túnel e TEM de bater com `PORTA` do
 * `infra/remote/config.sh`. Divergir as duas produz 502 intermitente, que
 * parece problema de rede e não é.
 */
export const PAINEL_PORTA = Number(process.env.ED_PAINEL_PORTA ?? 17789);
export const PAINEL_HOST = process.env.ED_PAINEL_HOST ?? "127.0.0.1";

/** Dois usuários fixos. Não há cadastro, e isso é escopo, não limitação. */
export const USUARIOS = ["chico", "procopio"] as const;
export type Usuario = (typeof USUARIOS)[number];
export const USUARIO_PADRAO: Usuario = "chico";

/** Uma transcrição nova que encolheu abaixo disso vira divergência. */
export const LIMIAR_PALAVRAS = Number(process.env.ED_DIVERGENCIA_PALAVRAS ?? 0.85);
export const LIMIAR_SIMILARIDADE = Number(process.env.ED_DIVERGENCIA_SIMILARIDADE ?? 0.75);

/** Pasta onde o worker guarda a legenda que existia antes de retranscrever. */
export const PASTA_ANTIGAS = "_transcricoes.antigas";

/**
 * Pastas que o scanner nunca trata como conteúdo.
 * `_antigo` guarda uma aula aposentada inteira no curso 1 — vai para relatório,
 * não para o catálogo.
 */
export const PASTAS_IGNORADAS = new Set(["_antigo", PASTA_ANTIGAS, "versoes_anteriores"]);
