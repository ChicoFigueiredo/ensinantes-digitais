#!/usr/bin/env bun
/**
 * CLI do painel. Despacha por subcomando.
 *
 * Cada subcomando importa seu módulo com `import()` dinâmico — NUNCA com
 * import estático no topo do arquivo. Os módulos `db.ts`, `scan.ts`,
 * `recortes.ts` e `painel.ts` ainda não existem nesta tarefa; um import
 * estático faria o `cli.ts` inteiro falhar ao carregar antes mesmo de existir
 * o primeiro deles. Com import dinâmico, cada subcomando passa a funcionar
 * assim que o módulo dele nascer, e os demais continuam dando um erro claro
 * em vez de derrubar o CLI inteiro.
 *
 * O caminho do módulo é passado por uma variável, não por um literal, de
 * propósito: um literal faria o `tsc` tentar resolver o módulo em tempo de
 * checagem de tipos e falhar o typecheck do projeto inteiro por causa de um
 * arquivo que ainda não existe.
 */
import { PAINEL_PORTA } from "./config.ts";

const AJUDA = `
Uso: bun run src/cli.ts <comando>

Comandos:
  scan         escaneia o acervo e popula o catálogo (cursos, itens, recortes)
  painel       destrava o banco e sobe o servidor do painel
  transcrever  marca todos os vídeos como pendentes de transcrição
  requeue      recoloca na fila os itens que erraram a transcrição
  recortes     gera os recortes a partir das transcrições
  status       mostra o catálogo por curso e a fila de transcrição
`.trim();

/** Imprime a ajuda e sai. Sem argumento sai limpo (0); comando desconhecido é erro (1). */
function imprimirAjuda(codigoSaida: number): never {
  console.log(AJUDA);
  process.exit(codigoSaida);
}

/** Um módulo que ainda não nasceu é esperado nesta fase do projeto — não é bug, é aviso. */
function moduloAusente(caminho: string): never {
  console.error(`módulo ainda não implementado: ${caminho}`);
  process.exit(1);
}

function ehErroDeModuloAusente(erro: unknown): boolean {
  // No Bun, uma falha de resolução de módulo chega como `ResolveMessage`, não
  // como `Error` — por isso a checagem é pelo texto, não por `instanceof Error`.
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return /Cannot find module|Failed to resolve/.test(mensagem);
}

/** Importa um módulo pelo caminho; se ele ainda não existir, avisa e sai — sem stack trace. */
async function importarModulo(caminho: string): Promise<any> {
  try {
    return await import(caminho);
  } catch (erro) {
    if (ehErroDeModuloAusente(erro)) moduloAusente(caminho);
    throw erro;
  }
}

async function abrirBanco() {
  const caminhoDb = "./db.ts";
  const { destravar } = await importarModulo(caminhoDb);
  return destravar();
}

async function comandoScan() {
  const db = await abrirBanco();
  const caminhoScan = "./scan.ts";
  const { escanearTudo } = await importarModulo(caminhoScan);
  const resultado = await escanearTudo(db);
  console.log(
    `cursos: ${resultado.cursos}, itens: ${resultado.itens}, recortes: ${resultado.recortes}`,
  );
}

async function comandoPainel() {
  const db = await abrirBanco();
  const caminhoPainel = "./painel.ts";
  const { servir } = await importarModulo(caminhoPainel);
  await servir(db, PAINEL_PORTA);
}

async function comandoTranscrever() {
  const db = await abrirBanco();
  const resultado = db
    .query("UPDATE itens SET transcricao_estado='pendente' WHERE tipo='video'")
    .run();
  console.log(`${resultado.changes} vídeo(s) marcado(s) como pendente. Rode: bun run worker`);
}

async function comandoRequeue() {
  const db = await abrirBanco();
  const resultado = db
    .query(
      "UPDATE itens SET transcricao_estado='pendente', transcricao_erro=NULL WHERE transcricao_estado='erro'",
    )
    .run();
  console.log(`${resultado.changes} item(ns) recolocado(s) na fila.`);
}

async function comandoRecortes() {
  const db = await abrirBanco();
  const caminhoRecortes = "./recortes.ts";
  const { gerar } = await importarModulo(caminhoRecortes);
  const r = await gerar(db);
  console.log(`${r.total} pastas · ${(r.bytes / 1073741824).toFixed(2)} GB`);
  console.log(`  ${r.relatorio}\n  ${r.script}  (não executado)`);
}

async function comandoStatus() {
  const db = await abrirBanco();
  // Esquema definido em src/db.ts (Tarefa 3): itens não tem curso_id — a
  // ligação com o curso passa por modulos (itens.modulo_id → modulos.id →
  // modulos.curso_id → cursos.id), e a coluna de nome do curso é `titulo`.
  const catalogo = db.query(`
    SELECT c.titulo, c.estado, COUNT(DISTINCT m.id) modulos, COUNT(i.id) itens
      FROM cursos c LEFT JOIN modulos m ON m.curso_id = c.id
                    LEFT JOIN itens i ON i.modulo_id = m.id
     GROUP BY c.id ORDER BY c.posicao`).all();
  console.table(catalogo);

  const fila = db.query(
    "SELECT transcricao_estado estado, COUNT(*) n FROM itens WHERE tipo='video' GROUP BY 1").all();
  console.table(fila);
}

async function main() {
  const [comando] = process.argv.slice(2);

  if (!comando) imprimirAjuda(0);

  switch (comando) {
    case "scan":
      return comandoScan();
    case "painel":
      return comandoPainel();
    case "transcrever":
      return comandoTranscrever();
    case "requeue":
      return comandoRequeue();
    case "recortes":
      return comandoRecortes();
    case "status":
      return comandoStatus();
    default:
      imprimirAjuda(1);
  }
}

main();
