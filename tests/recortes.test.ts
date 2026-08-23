import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { conectar } from "../src/db.ts";
import {
  gerarForaDoCatalogo, gerarRecortes, relatorio, script, type LinhaRecorte,
} from "../src/recortes.ts";

// Estes testes NÃO podem escrever em `relatorios/` nem em `scripts/`: fazendo
// isso, `bun test` reescrevia o script real de apagar recortes com os dados da
// fixture, e ele passava a prometer apagar 127 GB listando duas pastas
// inventadas de 0 byte.
const SAIDA = join(tmpdir(), "ensinantes-testes-recortes");
const DESTINOS = { relatorios: SAIDA, scripts: SAIDA };

const AMOSTRA: LinhaRecorte[] = [
  { relPath: "1-Ensinantes/00-Lives.de.Leads/00.01-Descobrindo 720 x 1280",
    arquivos: 15862, bytes: 12_000_000_000, aula: null },
  { relPath: "1-Ensinantes/01.A.Jornada/01.01-Pacto de Ulisses",
    arquivos: 1661, bytes: 1_200_000_000, aula: "Pacto de Ulisses" },
];

test("o relatório traz total, contagem e a aula de origem", () => {
  const md = relatorio(AMOSTRA);
  expect(md).toContain("17.523");            // total de arquivos, separador pt-BR
  expect(md).toContain("12,29 GB");          // total das duas pastas de amostra (12e9 + 1,2e9 bytes)
  expect(md).toContain("Pacto de Ulisses");
  expect(md).toContain("—");                 // aula desconhecida
});

test("o relatório ordena da maior para a menor", () => {
  const md = relatorio(AMOSTRA);
  expect(md.indexOf("00.01-Descobrindo")).toBeLessThan(md.indexOf("01.01-Pacto"));
});

test("o script recusa rodar sem --confirmar", () => {
  const sh = script(AMOSTRA, "/mnt/e/Marketing/Ensinantes.Digitais");
  expect(sh).toContain("set -euo pipefail");
  expect(sh).toContain("--confirmar");
  expect(sh).toMatch(/exit 1/);
});

test("cada rm vem comentado com tamanho e contagem", () => {
  const sh = script(AMOSTRA, "/mnt/e/Marketing/Ensinantes.Digitais");
  expect(sh).toContain("# 15.862 arquivos · 11,18 GB");
  expect(sh).toContain('rm -rf "/mnt/e/Marketing/Ensinantes.Digitais/1-Ensinantes/00-Lives.de.Leads/00.01-Descobrindo 720 x 1280"');
});

test("caminho com aspas não escapa do comando", () => {
  const sh = script(
    [{ relPath: 'x/a"b', arquivos: 1, bytes: 1, aula: null }], "/raiz");
  expect(sh).not.toMatch(/rm -rf "\/raiz\/x\/a"b"/);
  expect(sh).toContain('a\\"b');
});

test("o script usa o caminho real, não o do symlink", () => {
  const sh = script(AMOSTRA, "/mnt/e/Marketing/Ensinantes.Digitais");
  expect(sh).toContain('rm -rf "/mnt/e/Marketing/Ensinantes.Digitais/');
  // Um `rm -rf` que atravessa symlink apaga o mesmo conteúdo, mas o alvo passa
  // a depender de o symlink não ter sido repontado desde a geração.
  expect(sh).not.toContain("/acervo/");
});

test("o script gerado é bash sintaticamente válido", async () => {
  const caminho = join(tmpdir(), `apagar-teste-${process.pid}.sh`);
  writeFileSync(caminho, script(AMOSTRA, "/raiz"), "utf-8");
  // `bash -n` analisa sem executar. Nomes do acervo têm espaço, parêntese e
  // aspas tipográficas — um escape errado vira erro de sintaxe aqui, e não um
  // `rm -rf` no alvo errado lá.
  const p = Bun.spawnSync(["bash", "-n", caminho]);
  rmSync(caminho, { force: true });
  expect(p.exitCode).toBe(0);
});

test("gerarRecortes lê a tabela recortes e escreve os dois arquivos", () => {
  const db = conectar(":memory:");
  db.run("INSERT INTO recortes (rel_path, arquivos, bytes) VALUES (?, ?, ?)",
    ["1-Ensinantes/00-Modulo/00.01-Aula", 10, 1000]);
  db.run("INSERT INTO recortes (rel_path, arquivos, bytes) VALUES (?, ?, ?)",
    ["1-Ensinantes/00-Modulo/00.02-Aula", 20, 2000]);

  const r = gerarRecortes(db, DESTINOS);
  expect(r.total).toBe(2);
  expect(r.bytes).toBe(3000);
  expect(Bun.file(r.relatorio).size).toBeGreaterThan(0);
  expect(Bun.file(r.script).size).toBeGreaterThan(0);
  // A trava: dado de fixture nunca pode sair na pasta de produção. O script
  // real promete apagar 127 GB — se um teste o reescrever, ele passa a mentir.
  expect(r.script.startsWith(SAIDA)).toBe(true);
  expect(r.relatorio.startsWith(SAIDA)).toBe(true);
});

// --- fora-do-catalogo.md -------------------------------------------------

const RAIZ = join(import.meta.dir, "__fixture-recortes");

function montarFixture(): void {
  rmSync(RAIZ, { recursive: true, force: true });
  const antigo = join(RAIZ, "1-Ensinantes", "01.A.Jornada", "_antigo");
  mkdirSync(antigo, { recursive: true });
  writeFileSync(join(antigo, "01.04-Como Tirar as Suas Dúvidas.mp4"), "video");
  writeFileSync(join(antigo, "01.04-Como Tirar as Suas Dúvidas.srt"), "legenda");
}

montarFixture();
afterAll(() => rmSync(RAIZ, { recursive: true, force: true }));

const IGNORADOS = [
  "1-Ensinantes/01.A.Jornada/_antigo",
  "1-Ensinantes/Boleto_Francisco_Lima_Figueiredo.pdf",
  "1-Ensinantes/Certificado-Ensinantes-Digitais-xyz.pdf",
  "Repo/versoes_anteriores",
  "Repo/~$Mapa.do.Curso.On-line.(Completo).xlsx",
  "2-Acelerador.Conteudo.IA/gera_pastas.sh",
  "2-Acelerador.Conteudo.IA/Lista.txt",
  "2-Acelerador.Conteudo.IA/_l.txt",
  "Repo/_transcricoes.antigas",
  "3-Criadores.Videos/um-arquivo-qualquer.xyz",
];

test("fora-do-catalogo conta o total de itens ignorados", () => {
  const r = gerarForaDoCatalogo(IGNORADOS, RAIZ, SAIDA);
  expect(r.total).toBe(IGNORADOS.length);
});

test("a pasta _antigo mostra o conteúdo — a aula que tem dentro, não só o caminho", async () => {
  const r = gerarForaDoCatalogo(IGNORADOS, RAIZ, SAIDA);
  const md = await Bun.file(r.relatorio).text();
  expect(md).toContain("01.04-Como Tirar as Suas Dúvidas.mp4");
  expect(md).toContain("01.04-Como Tirar as Suas Dúvidas.srt");
});

test("documentos pessoais aparecem explicados com a palavra 'de propósito'", async () => {
  const r = gerarForaDoCatalogo(IGNORADOS, RAIZ, SAIDA);
  const md = await Bun.file(r.relatorio).text();
  expect(md).toContain("Documentos pessoais");
  expect(md).toContain("de propósito");
  expect(md).toContain("Boleto_Francisco_Lima_Figueiredo.pdf");
});

test("restos de organização agrupam lock do excel, script e listas", async () => {
  const r = gerarForaDoCatalogo(IGNORADOS, RAIZ, SAIDA);
  const md = await Bun.file(r.relatorio).text();
  const secao = md.slice(md.indexOf("Restos de organização"), md.indexOf("## Outros"));
  expect(secao).toContain("~$Mapa.do.Curso.On-line.(Completo).xlsx");
  expect(secao).toContain("gera_pastas.sh");
  expect(secao).toContain("Lista.txt");
  expect(secao).toContain("_l.txt");
});

test("caminho que não casa com nenhum motivo conhecido cai em 'Outros', não some", async () => {
  const r = gerarForaDoCatalogo(IGNORADOS, RAIZ, SAIDA);
  const md = await Bun.file(r.relatorio).text();
  expect(md).toContain("## Outros");
  expect(md).toContain("um-arquivo-qualquer.xyz");
});

test("_transcricoes.antigas e versoes_anteriores ficam em grupos próprios", async () => {
  const r = gerarForaDoCatalogo(IGNORADOS, RAIZ, SAIDA);
  const md = await Bun.file(r.relatorio).text();
  expect(md).toContain("Backup de transcrição");
  expect(md).toContain("Versões anteriores");
  expect(md).toContain("Repo/versoes_anteriores");
});
