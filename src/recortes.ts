/**
 * O que fica fora da navegação: relatório para ler e script para rodar quando
 * quiser.
 *
 * São 127,24 GB em 56 pastas de recorte (171.998 PNGs) — 87% do acervo,
 * contra 18,4 GB de vídeo de verdade. Apagá-las é a maior economia de disco
 * disponível, e por isso mesmo o script é ENTREGUE, não disparado: uma
 * limpeza automática de 127 GB é o tipo de conveniência que se lamenta uma
 * vez só.
 *
 * O segundo relatório — `fora-do-catalogo.md` — cobre o resto do que a
 * varredura deixou de fora (aula aposentada, backups, documentos pessoais,
 * restos de organização): não tem script, porque não é para apagar, é para
 * o Chico ver que aquilo existe.
 */
import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Database } from "bun:sqlite";

import { ACERVO, PASTA_ANTIGAS, RELATORIOS, SCRIPTS } from "./config.ts";
import { ehLixoDeOrganizacao, ehPessoal } from "./scan.ts";

export interface LinhaRecorte {
  relPath: string;
  arquivos: number;
  bytes: number;
  /** Título da aula de origem, quando o caminho casa com um item. */
  aula: string | null;
}

const gb = (b: number): string => `${(b / 1_073_741_824).toFixed(2).replace(".", ",")} GB`;
const num = (n: number): string => n.toLocaleString("pt-BR");

export function listar(db: Database): LinhaRecorte[] {
  return db.query<LinhaRecorte, []>(`
    SELECT r.rel_path AS relPath, r.arquivos, r.bytes, i.titulo AS aula
      FROM recortes r
      LEFT JOIN itens i ON i.rel_path LIKE r.rel_path || '.%' AND i.tipo = 'video'
     ORDER BY r.bytes DESC`).all();
}

export function relatorio(linhas: LinhaRecorte[]): string {
  const bytes = linhas.reduce((s, l) => s + l.bytes, 0);
  const arquivos = linhas.reduce((s, l) => s + l.arquivos, 0);

  const corpo = linhas.map((l) =>
    `| ${gb(l.bytes)} | ${num(l.arquivos)} | ${l.aula ?? "—"} | \`${l.relPath}\` |`).join("\n");

  return `# Recortes em PNG

Gerado pelo \`bun run recortes\`. **Nada foi apagado.**

- **${num(linhas.length)} pastas**
- **${num(arquivos)} arquivos**
- **${gb(bytes)}**

Para apagar, leia e rode \`scripts/apagar-recortes.sh --confirmar\`.

| Tamanho | Arquivos | Aula | Pasta |
|---:|---:|---|---|
${corpo}
`;
}

/** Aspas no caminho viram \\" — senão o nome fecha a string e vira comando. */
const escapar = (s: string): string => s.replace(/(["\\$`])/g, "\\$1");

export function script(linhas: LinhaRecorte[], acervo: string): string {
  const bytes = linhas.reduce((s, l) => s + l.bytes, 0);

  const comandos = linhas.map((l) =>
    `# ${num(l.arquivos)} arquivos · ${gb(l.bytes)}${l.aula ? ` · ${l.aula}` : ""}\n` +
    `rm -rf "${escapar(join(acervo, l.relPath))}"`).join("\n\n");

  return `#!/usr/bin/env bash
# Apaga as pastas de recorte em PNG do acervo Ensinantes Digitais.
#
# GERADO POR 'bun run recortes' — não edite à mão, refaça.
# Libera ${gb(bytes)} em ${num(linhas.length)} pastas.
#
# Isto é IRREVERSÍVEL. Leia a lista antes.
set -euo pipefail

if [[ "\${1:-}" != "--confirmar" ]]; then
  echo "Este script apaga ${gb(bytes)} de forma irreversível."
  echo "Leia relatorios/recortes.md, e então rode:  $0 --confirmar"
  exit 1
fi

${comandos}

echo "Pronto: ${gb(bytes)} liberados."
`;
}

/**
 * Lê a tabela `recortes` e escreve o relatório e o script.
 *
 * `destinos` existe por causa dos TESTES. Sem ele a função escrevia sempre em
 * `relatorios/` e `scripts/`, então rodar `bun test` reescrevia o script real
 * de apagar recortes com os dados da fixture: ele passava a anunciar "0,00 GB
 * em 2 pastas" e a listar caminhos de `/mnt/e/` montados com nomes inventados.
 * Quem rodasse confiando nele não apagaria nada e concluiria que a limpeza foi
 * feita — com os 127 GB ainda no disco. O padrão continua sendo o de produção.
 */
export function gerarRecortes(
  db: Database,
  destinos: { relatorios?: string; scripts?: string } = {},
): { relatorio: string; script: string; total: number; bytes: number } {
  const pastaRelatorios = destinos.relatorios ?? RELATORIOS;
  const pastaScripts = destinos.scripts ?? SCRIPTS;
  const linhas = listar(db);
  mkdirSync(pastaRelatorios, { recursive: true });
  mkdirSync(pastaScripts, { recursive: true });

  const md = join(pastaRelatorios, "recortes.md");
  const sh = join(pastaScripts, "apagar-recortes.sh");
  writeFileSync(md, relatorio(linhas), "utf-8");

  // O caminho real, não o do symlink `acervo`. Este arquivo é guardado e
  // rodado depois — possivelmente muito depois — e um `rm -rf` de 127 GB não
  // pode depender de um symlink continuar apontando para onde apontava hoje.
  // Serve também para quem lê a lista antes de rodar reconhecer o disco de
  // verdade. Se o acervo estiver desmontado, `realpathSync` lança — e é
  // melhor falhar aqui do que gerar um script apontando para um caminho que
  // ninguém conseguiu resolver.
  const raiz = realpathSync(ACERVO);
  writeFileSync(sh, script(linhas, raiz), { encoding: "utf-8", mode: 0o755 });

  return {
    relatorio: md, script: sh,
    total: linhas.length,
    bytes: linhas.reduce((s, l) => s + l.bytes, 0),
  };
}

// --- fora-do-catalogo.md -----------------------------------------------

type Motivo = "_antigo" | "_transcricoes.antigas" | "versoes_anteriores" | "pessoal" | "organizacao" | "outros";

const GRUPOS: { motivo: Motivo; titulo: string; explicacao: string }[] = [
  {
    motivo: "_antigo",
    titulo: "Aula aposentada (`_antigo/`)",
    explicacao:
      "No curso 1 esta pasta guarda uma aula inteira que saiu de circulação — " +
      "vídeo incluído, não só legenda. Fica fora da navegação, mas o material " +
      "não some do disco; o conteúdo de cada pasta está listado abaixo.",
  },
  {
    motivo: "_transcricoes.antigas",
    titulo: "Backup de transcrição (`_transcricoes.antigas/`)",
    explicacao:
      "Criada pelo próprio projeto ao retranscrever um vídeo: guarda a legenda " +
      "anterior como referência de comparação, não é conteúdo de curso.",
  },
  {
    motivo: "versoes_anteriores",
    titulo: "Versões anteriores (`Repo/versoes_anteriores/`)",
    explicacao: "Rascunhos e cópias antigas de documentos, dentro de `Repo/`.",
  },
  {
    motivo: "pessoal",
    titulo: "Documentos pessoais",
    explicacao:
      "Ficam fora **de propósito**: o painel tem um segundo usuário (o " +
      "professor Procópio) e esses arquivos não são material de curso.",
  },
  {
    motivo: "organizacao",
    titulo: "Restos de organização",
    explicacao:
      "Lock do Excel, script de criação de pasta, listas de trabalho — " +
      "sobras do processo de organizar o acervo, não conteúdo.",
  },
  {
    motivo: "outros",
    titulo: "Outros",
    explicacao: "Não casou com nenhum motivo conhecido — listado para não sumir em silêncio.",
  },
];

/**
 * Deduz o motivo pelo caminho. Ver `PASTAS_IGNORADAS`, `ehPessoal` e
 * `ehLixoDeOrganizacao`.
 *
 * Hoje, no acervo real, os grupos "Backup de transcrição" e "Restos de
 * organização" saem vazios — e isso não é bug:
 *
 *   - `_transcricoes.antigas/` só passa a existir depois que o worker
 *     retranscreve um vídeo pela primeira vez (Tarefa 14). Antes disso não
 *     há nada para listar.
 *   - `gera_pastas.sh`, `Lista.txt` e `_l.txt` existem no disco, mas `.sh`,
 *     `.txt` não são extensão reconhecida por `tipoDe` (`scan.ts`) — o
 *     arquivo nunca vira `ItemBruto` e por isso nunca chega a `ignorados`.
 *     É limitação herdada da Tarefa 4, já registrada; não alargamos
 *     `tipoDe` só para poder listar sobra de organização que não é material.
 */
function motivoDe(relPath: string): Motivo {
  const nome = basename(relPath);
  if (nome === "_antigo") return "_antigo";
  if (nome === PASTA_ANTIGAS) return "_transcricoes.antigas";
  if (nome === "versoes_anteriores") return "versoes_anteriores";
  if (ehPessoal(nome)) return "pessoal";
  if (ehLixoDeOrganizacao(nome)) return "organizacao";
  return "outros";
}

/**
 * Conteúdo de uma pasta `_antigo/`, para o relatório mostrar a aula que tem
 * dentro. `acervo` é parâmetro (com padrão `ACERVO`) só para o teste poder
 * apontar para uma fixture — mesmo truque de `medirRecortes` em `scan.ts`.
 */
function listarConteudo(relPath: string, acervo: string): string[] {
  const absoluto = join(acervo, relPath);
  if (!existsSync(absoluto)) return [];
  try {
    return readdirSync(absoluto, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Recebe a lista que a varredura acumulou e escreve o relatório do que ficou de fora. */
export function gerarForaDoCatalogo(
  ignorados: string[],
  acervo: string = ACERVO,
  destinoRelatorios?: string,
): { relatorio: string; total: number } {
  const porMotivo = new Map<Motivo, string[]>();
  for (const rel of ignorados) {
    const m = motivoDe(rel);
    if (!porMotivo.has(m)) porMotivo.set(m, []);
    porMotivo.get(m)!.push(rel);
  }

  const secoes = GRUPOS
    .filter((g) => (porMotivo.get(g.motivo)?.length ?? 0) > 0)
    .map((g) => {
      const caminhos = porMotivo.get(g.motivo)!.sort();
      const corpo = caminhos.map((rel) => {
        if (g.motivo !== "_antigo") return `- \`${rel}\``;
        const conteudo = listarConteudo(rel, acervo);
        const lista = conteudo.length
          ? conteudo.map((n) => `  - \`${n}\``).join("\n")
          : "  - (pasta vazia ou ilegível)";
        return `- \`${rel}\`\n${lista}`;
      }).join("\n");
      return `## ${g.titulo}\n\n${g.explicacao}\n\n${corpo}\n`;
    });

  const relatorioMd = `# Fora do catálogo

Gerado pelo \`bun run scan\`. Estes caminhos existem no acervo mas não entram
na navegação do painel. **Nada foi apagado nem movido** — cada grupo abaixo
explica o motivo.

- **${num(ignorados.length)} itens fora do catálogo**

${secoes.join("\n")}`;

  // Mesmo motivo de `gerarRecortes`: teste não pode reescrever o relatório real.
  const pastaRelatorios = destinoRelatorios ?? RELATORIOS;
  mkdirSync(pastaRelatorios, { recursive: true });
  const md = join(pastaRelatorios, "fora-do-catalogo.md");
  writeFileSync(md, relatorioMd, "utf-8");

  return { relatorio: md, total: ignorados.length };
}
