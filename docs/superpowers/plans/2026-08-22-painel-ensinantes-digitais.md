# Painel Ensinantes Digitais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um painel web local que navega os três cursos do combo Ensinantes Digitais direto do disco, com vídeo, transcrição, PDFs e progresso separado por usuário, acessível de fora por túnel SSH.

**Architecture:** Fork adaptado do focus-scrap. O sistema de arquivos é a fonte da verdade: `scan.ts` varre `/mnt/e/Marketing/Ensinantes.Digitais/` e materializa o catálogo em SQLite; o painel (`Bun.serve`, sem bundler) serve HTML/CSS/JS inline a partir de `src/ui/`; um worker Python transcreve os vídeos na GPU e compara cada transcrição nova com a anterior. A identidade do usuário vem do header que o nginx repassa do htpasswd — o app não tem tela de login.

**Tech Stack:** Bun 1.3+ (TypeScript, `bun:sqlite`, `Bun.serve`, `bun test`), Python 3.12 + uv (`faster-whisper` com CUDA), ffmpeg/ffprobe, nginx + certbot no droplet.

**Spec:** [`docs/superpowers/specs/2026-08-22-ensinantes-digitais-design.md`](../specs/2026-08-22-ensinantes-digitais-design.md)

## Global Constraints

Valem para toda tarefa. Copiados da spec.

- **Sem bundler, sem framework de front.** HTML/CSS/JS inline servidos por `Bun.serve`. O painel sobe em ~200 ms e isso é requisito, não acidente.
- **Sem rede para fora.** Nenhuma dependência de Playwright, OpenRouter ou qualquer API. `package.json` não tem `dependencies` de runtime.
- **Porta 17789** em `ED_PAINEL_PORTA` (`.env`) e em `PORTA` (`infra/remote/config.sh`). Os dois têm de bater. Diferente da 17788 do focus-scrap.
- **Usuários válidos: exatamente `['chico', 'procopio']`.** Sem header `X-Painel-Usuario`, o usuário é `chico`.
- **Toda tabela de estado do usuário tem `usuario` na chave primária.** `progresso`, `notas`, `prefs`, `ui_estado`.
- **Rota administrativa verifica `usuario === 'chico'` no servidor**, além do 403 do nginx. Esconder no CSS não conta.
- **`/api/sync` nunca é bloqueada.** Bloqueá-la quebra o painel em vez de deixá-lo somente-leitura.
- **O scanner nunca desce em pasta de recorte.** Regra por conteúdo: tem `.png` e não tem `.mp4` → conta, registra, não desce.
- **Nada é apagado automaticamente.** O script de limpeza é gerado e entregue.
- **Idioma do código:** identificadores, comentários e mensagens em português, como no focus-scrap.
- **Paleta:** `#0e1013` fundo · `#16191f` superfície · `#1e222a` elevada · `#2a2f3a` borda · `#e8eaed` texto · `#9aa3af` secundário · `#e8963c` âmbar · `#4ea672` verde.

## Descobertas do disco que o plano incorpora

Levantadas durante a escrita do plano, sobre o acervo real. Cada uma tem tarefa
que a trata:

1. **`lista.txt` do curso 2 é CRLF** e usa o padrão `Módulo 01 - O SAK(IA)` —
   diferente do padrão das pastas (`01-Nome`). Tarefa 2.
2. **Códigos de três níveis com letra:** `B01.01.c-Apresentação Direitos
   autorais.pdf`, `B01.01.0-…`. Tarefa 2.
3. **Código repetido entre tipos:** `02.05-LINHA EDITORIAL DE VÍDEOS.mp4` e
   `02.05-PERSONAELINHAEDITORIAL.pdf` no mesmo módulo. A unicidade é por
   `rel_path`, não por código. Tarefa 3.
4. **PNG solto dentro de pasta de módulo:** `icons8-ms-excel-48.png` convive com
   os vídeos do módulo 01. Não é recorte (a pasta tem `.mp4`) e não pode virar
   item: imagem nunca é item. Tarefa 4.
5. **Arquivos na raiz do curso 1**, fora de qualquer módulo: `Ensinantes
   Digitais.onepkg` (61 MB), dois `.xlsx` de 55 MB, `Lista.txt`, `_l.txt`,
   `gera_pastas.sh`, e **dois documentos pessoais** —
   `Boleto_Francisco_Lima_Figueiredo.pdf` e
   `Certificado-Ensinantes-Digitais-….pdf`. Tarefa 5.
6. **`.url` são atalhos do Windows** em formato INI com `URL=…`. Tarefa 4.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/config.ts` | Caminhos, porta, usuários, limiares. Único lugar que lê `process.env` | 1 |
| `src/naming.ts` | Nome no disco → `{codigo, titulo}`. Sem I/O | 2 |
| `src/db.ts` | Esquema e acesso. Sem regra de negócio | 3 |
| `src/scan.ts` | Percorre o disco e materializa o catálogo | 4, 5 |
| `src/recortes.ts` | Relatório e gerador do script de limpeza | 6 |
| `src/legenda.ts` | `srt`→`vtt` e lista de trechos. Cópia do focus-scrap | 7 |
| `src/arquivos.ts` | MIME e resposta com `Range`. Sem conhecer rotas | 8 |
| `src/usuario.ts` | Header → usuário, permissões, presença | 9 |
| `src/painel.ts` | `Bun.serve`, roteamento, aplicação das permissões | 10, 11 |
| `src/ui/tema.ts` | Tokens de cor, tipografia, CSS base | 12 |
| `src/ui/home.ts` | Cards dos cursos e "continuar de onde parou" | 12 |
| `src/ui/curso.ts` | Árvore de módulos e aulas | 13 |
| `src/ui/player.ts` | Vídeo, controles, preferências | 13 |
| `src/ui/transcricao.ts` | Trechos clicáveis, notas, divergência | 14 |
| `src/revelar.ts` | Abrir no Explorer. Cópia do focus-scrap | 15 |
| `src/backup.ts` | Cópia do `.db` para o acervo. Cópia do focus-scrap | 15 |
| `src/cli.ts` | Despacho dos subcomandos | 16 |
| `py/ensinantes/config.py` | Espelho Python do `.env` | 17 |
| `py/ensinantes/db.py` | Acesso ao mesmo SQLite | 17 |
| `py/ensinantes/transcriber.py` | Whisper + escrita dos três formatos | 17 |
| `py/ensinantes/comparar.py` | Similaridade e classificação de divergência | 18 |
| `py/ensinantes/worker.py` | Laço da fila | 17, 18 |
| `infra/remote/*` | Túnel, nginx, dois usuários | 20 |

---

### Task 1: Fundação do projeto

Sem esta tarefa nada compila. Ela entrega um `bun test` que roda e um
`src/config.ts` que as outras dezenove tarefas importam.

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env`
- Create: `src/config.ts`
- Create: `acervo` (symlink)
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `ACERVO: string`, `DB_PATH: string`, `PAINEL_PORTA: number`, `PAINEL_HOST: string`, `USUARIOS: readonly ["chico","procopio"]`, `USUARIO_PADRAO: "chico"`, `LIMIAR_PALAVRAS: number`, `LIMIAR_SIMILARIDADE: number`, `BASE_DIR: string`, `RELATORIOS: string`, `SCRIPTS: string`

- [ ] **Step 1: Criar o symlink e conferir que o acervo está montado**

```bash
cd /mnt/d/Chico/ensinantes-digitais
ln -sfn /mnt/e/Marketing/Ensinantes.Digitais acervo
ls acervo/   # tem de listar 1-Ensinantes, 2-Acelerador.Conteudo.IA, 3-Criadores.Videos, Repo
```

Se `ls` falhar, o disco `E:` não está montado no WSL e nada mais nesta tarefa
faz sentido. Pare e resolva antes de seguir.

- [ ] **Step 2: Escrever `package.json`**

```json
{
  "name": "ensinantes-digitais",
  "version": "0.1.0",
  "private": true,
  "description": "Painel de estudo dos três cursos do combo Ensinantes Digitais.",
  "type": "module",
  "scripts": {
    "scan": "bun run src/cli.ts scan",
    "painel": "bun run src/cli.ts painel",
    "transcrever": "bun run src/cli.ts transcrever",
    "recortes": "bun run src/cli.ts recortes",
    "status": "bun run src/cli.ts status",
    "worker": "uv run python -m ensinantes.worker",
    "setup": "bun install && uv sync",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  }
}
```

Não há `dependencies`. É intencional: o projeto não fala com a rede.

- [ ] **Step 3: Escrever `tsconfig.json` e `.gitignore`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "types": ["bun-types"]
  },
  "include": ["src", "tests"]
}
```

`.gitignore`:

```
node_modules/
.venv/
__pycache__/
acervo
*.db
*.db-shm
*.db-wal
.env
relatorios/
scripts/apagar-recortes.sh
_prompts.ceo.md
```

`relatorios/` e o script são gerados a cada scan — versioná-los só produziria
diff de ruído.

- [ ] **Step 4: Escrever `.env.example` e copiar para `.env`**

```bash
ED_ACERVO=./acervo
ED_PAINEL_PORTA=17789
ED_PAINEL_HOST=127.0.0.1
ED_WHISPER_MODELO=large-v3
ED_WHISPER_COMPUTE=float16
ED_WHISPER_BATCH=16
ED_DIVERGENCIA_PALAVRAS=0.85
ED_DIVERGENCIA_SIMILARIDADE=0.75
```

```bash
cp .env.example .env
```

Não há credencial nenhuma neste arquivo. Se um dia houver, ele sai do git —
já está no `.gitignore`.

- [ ] **Step 5: Escrever o teste que falha**

`tests/config.test.ts`:

```ts
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";

import {
  ACERVO, DB_PATH, PAINEL_PORTA, USUARIOS, USUARIO_PADRAO,
  LIMIAR_PALAVRAS, LIMIAR_SIMILARIDADE,
} from "../src/config.ts";

test("o acervo aponta para uma pasta que existe", () => {
  expect(existsSync(ACERVO)).toBe(true);
});

test("a porta é a 17789 — a mesma do infra/remote/config.sh", () => {
  expect(PAINEL_PORTA).toBe(17789);
});

test("são exatamente dois usuários, e o padrão é o chico", () => {
  expect([...USUARIOS]).toEqual(["chico", "procopio"]);
  expect(USUARIO_PADRAO).toBe("chico");
});

test("o banco fica na raiz do projeto, não no acervo", () => {
  expect(DB_PATH.endsWith("ensinantes.db")).toBe(true);
  expect(DB_PATH.startsWith(ACERVO)).toBe(false);
});

test("os limiares de divergência têm os valores da spec", () => {
  expect(LIMIAR_PALAVRAS).toBe(0.85);
  expect(LIMIAR_SIMILARIDADE).toBe(0.75);
});
```

- [ ] **Step 6: Rodar o teste e ver falhar**

Run: `bun test tests/config.test.ts`
Expected: FAIL — `Cannot find module '../src/config.ts'`

- [ ] **Step 7: Escrever `src/config.ts`**

```ts
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
```

- [ ] **Step 8: Rodar o teste e ver passar**

Run: `bun test tests/config.test.ts`
Expected: PASS — 5 testes

- [ ] **Step 9: Conferir os tipos**

Run: `bun run typecheck`
Expected: sem saída (sucesso)

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example src/config.ts tests/config.test.ts
git commit -m "Fundação: config central, sem dependência de runtime"
```

---

### Task 2: `naming.ts` — as regras de nome

A parte que mais quebra em silêncio. Os nomes vêm de quem organizou o disco à
mão ao longo de dois anos, em três padrões diferentes. Toda regra abaixo saiu de
um nome real conferido no acervo.

**Files:**
- Create: `src/naming.ts`
- Test: `tests/naming.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `interface Nomeado { codigo: string | null; titulo: string }`
  - `lerModulo(pasta: string): Nomeado`
  - `lerItem(arquivo: string): Nomeado`
  - `lerLinhaLista(linha: string): Nomeado | null`
  - `ordenarPorCodigo<T extends { codigo: string | null; titulo: string }>(itens: T[]): T[]`

- [ ] **Step 1: Escrever o teste que falha**

`tests/naming.test.ts`:

```ts
import { expect, test } from "bun:test";
import { lerItem, lerLinhaLista, lerModulo, ordenarPorCodigo } from "../src/naming.ts";

test("módulo pontilhado vira título com espaços", () => {
  expect(lerModulo("01.A.Jornada.do.Ensinante.Digital"))
    .toEqual({ codigo: "01", titulo: "A Jornada do Ensinante Digital" });
});

test("módulo que já tem espaço fica literal", () => {
  expect(lerModulo("02-O Que Todo Ensinante Digital Deveria Saber"))
    .toEqual({ codigo: "02", titulo: "O Que Todo Ensinante Digital Deveria Saber" });
});

test("módulo curto e pontilhado também converte", () => {
  expect(lerModulo("00-Lives.de.Leads"))
    .toEqual({ codigo: "00", titulo: "Lives de Leads" });
});

test("módulo bônus mantém o B no código", () => {
  expect(lerModulo("B01-Direitos Autorais Sobre Curso On-line - Dr. Pedro Maia"))
    .toEqual({ codigo: "B01", titulo: "Direitos Autorais Sobre Curso On-line - Dr. Pedro Maia" });
});

test("hífen dentro do título não é confundido com o separador do código", () => {
  expect(lerModulo("B09-A missão do Explicador - Clóvis de Barros").titulo)
    .toBe("A missão do Explicador - Clóvis de Barros");
});

test("pasta sem código nenhum devolve codigo null", () => {
  expect(lerModulo("Repo")).toEqual({ codigo: null, titulo: "Repo" });
});

test("item de vídeo perde a extensão", () => {
  expect(lerItem("01.02-A Ordem do Ensinantes Digitais.mp4"))
    .toEqual({ codigo: "01.02", titulo: "A Ordem do Ensinantes Digitais" });
});

test("a extensão sai ANTES de ponto virar espaço", () => {
  expect(lerItem("01.03-Mapa+do+Curso+On-line+(Completo).xlsx"))
    .toEqual({ codigo: "01.03", titulo: "Mapa do Curso On-line (Completo)" });
});

test("mais vira espaço junto com ponto", () => {
  expect(lerItem("06.08-Dna+de+produto.pdf"))
    .toEqual({ codigo: "06.08", titulo: "Dna de produto" });
});

test("código de três níveis com letra é preservado inteiro", () => {
  expect(lerItem("B01.01.c-Apresentação Direitos autorais.pdf"))
    .toEqual({ codigo: "B01.01.c", titulo: "Apresentação Direitos autorais" });
});

test("código de três níveis com dígito também", () => {
  expect(lerItem("B01.01.0-Direitos Autorais Sobre Curso On-line - Dr. Pedro Maia.mp4").codigo)
    .toBe("B01.01.0");
});

test("nome sem código devolve null e mantém o título inteiro", () => {
  expect(lerItem("Aula 3 - Atraindo Alunos para o Seu Curso On-line.mp4"))
    .toEqual({ codigo: null, titulo: "Aula 3 - Atraindo Alunos para o Seu Curso On-line" });
});

test("aspas tipográficas atravessam intactas", () => {
  expect(lerItem("09.01-Ferramentas Próprias - A Chave Para o “Customer Success”.mp4").titulo)
    .toBe("Ferramentas Próprias - A Chave Para o “Customer Success”");
});

test("linha do lista.txt do curso 2 usa o padrão Módulo NN -", () => {
  expect(lerLinhaLista("Módulo 01 - O SAK(IA)\r"))
    .toEqual({ codigo: "01", titulo: "O SAK(IA)" });
});

test("linha do lista.txt com acento no título", () => {
  expect(lerLinhaLista("Módulo 05 - Pré-Produção\r"))
    .toEqual({ codigo: "05", titulo: "Pré-Produção" });
});

test("linha vazia do lista.txt é descartada", () => {
  expect(lerLinhaLista("   \r")).toBeNull();
});

test("os sem código vão para o fim, e os numerados antes dos bônus", () => {
  const entrada = [
    { codigo: null, titulo: "Zebra" },
    { codigo: "B01", titulo: "Bônus um" },
    { codigo: "02", titulo: "Dois" },
    { codigo: "01", titulo: "Um" },
    { codigo: "10", titulo: "Dez" },
  ];
  expect(ordenarPorCodigo(entrada).map((x) => x.titulo))
    .toEqual(["Um", "Dois", "Dez", "Bônus um", "Zebra"]);
});

test("ordenação é numérica, não alfabética: 10 vem depois de 2", () => {
  const entrada = [
    { codigo: "01.10", titulo: "dez" },
    { codigo: "01.02", titulo: "dois" },
  ];
  expect(ordenarPorCodigo(entrada).map((x) => x.titulo)).toEqual(["dois", "dez"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test tests/naming.test.ts`
Expected: FAIL — `Cannot find module '../src/naming.ts'`

- [ ] **Step 3: Escrever `src/naming.ts`**

```ts
/**
 * Nome no disco → `{ codigo, titulo }`.
 *
 * Três padrões convivem no acervo, porque três pessoas organizaram três cursos
 * em momentos diferentes:
 *
 *   pastas de módulo   `01.A.Jornada.do.Ensinante.Digital`  `02-O Que Todo…`  `B01-…`
 *   arquivos de aula   `01.02-A Ordem…mp4`  `B01.01.c-Apresentação….pdf`
 *   lista.txt (curso 2) `Módulo 01 - O SAK(IA)`
 *
 * A regra do ponto é a que mais confunde: ponto vira espaço APENAS quando o
 * resto do nome não tem espaço nenhum. É o que separa `A.Jornada.do.Ensinante`
 * (todo pontilhado, precisa converter) de `O Que Todo Ensinante Digital`
 * (já legível — converter só estragaria siglas e abreviações com ponto).
 *
 * Sem I/O de propósito: isto é função pura, e é o que permite testá-la contra
 * os nomes reais sem montar árvore de fixture.
 */

export interface Nomeado {
  /** `01`, `B01`, `01.02`, `B01.01.c` — ou null quando o nome não traz código. */
  codigo: string | null;
  titulo: string;
}

/** Extensões que o scanner reconhece — usadas aqui só para recortar o sufixo. */
const EXTENSOES = /\.(mp4|webm|mkv|pdf|xlsx|xls|docx|doc|pptx|md|txt|srt|sub|url|onepkg)$/i;

/**
 * Prefixo de código: `NN`, `BNN`, `NN.NN`, `BNN.NN.c`, seguido de `.` ou `-`.
 *
 * O `-` do separador é o PRIMEIRO depois do código. Hífen mais adiante é do
 * título (`B09-A missão do Explicador - Clóvis de Barros`) e fica onde está.
 */
const PREFIXO = /^(B?\d+(?:\.\w+)*?)[.-](?=\D|$)/;

/**
 * Ponto e mais viram espaço só quando não há espaço no texto.
 *
 * `Mapa+do+Curso+On-line+(Completo)` → `Mapa do Curso On-line (Completo)`
 * `O Que Todo Ensinante Digital`     → intacto
 */
function humanizar(texto: string): string {
  const temEspaco = /\s/.test(texto);
  const t = temEspaco ? texto : texto.replace(/[.+]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function separar(nome: string): Nomeado {
  const m = PREFIXO.exec(nome);
  if (!m) return { codigo: null, titulo: humanizar(nome) };
  return { codigo: m[1]!, titulo: humanizar(nome.slice(m[0].length)) };
}

/** Pasta de módulo → código e título. */
export function lerModulo(pasta: string): Nomeado {
  return separar(pasta);
}

/**
 * Arquivo de aula ou material → código e título.
 *
 * A extensão sai ANTES de humanizar. Se saísse depois,
 * `Mapa+do+Curso.xlsx` viraria `Mapa do Curso xlsx`.
 */
export function lerItem(arquivo: string): Nomeado {
  return separar(arquivo.replace(EXTENSOES, ""));
}

/** `Módulo 01 - O SAK(IA)` do lista.txt do curso 2. Tolera CRLF. */
export function lerLinhaLista(linha: string): Nomeado | null {
  const limpa = linha.replace(/\r/g, "").trim();
  if (!limpa) return null;
  const m = /^M[óo]dulo\s+(\d+)\s*-\s*(.+)$/i.exec(limpa);
  if (!m) return { codigo: null, titulo: limpa };
  return { codigo: m[1]!, titulo: m[2]!.trim() };
}

/**
 * Ordem de exibição: numerados, depois bônus, depois os sem código.
 *
 * A comparação é peça a peça e numérica quando dá — senão `01.10` viria antes
 * de `01.02`, que é o erro clássico de ordenar código como texto.
 */
export function ordenarPorCodigo<T extends Nomeado>(itens: T[]): T[] {
  const peso = (c: string | null): number => (c === null ? 2 : c.startsWith("B") ? 1 : 0);

  const partes = (c: string): (number | string)[] =>
    c.replace(/^B/, "").split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));

  return [...itens].sort((a, b) => {
    const pa = peso(a.codigo), pb = peso(b.codigo);
    if (pa !== pb) return pa - pb;
    if (a.codigo === null || b.codigo === null) return a.titulo.localeCompare(b.titulo, "pt-BR");

    const xa = partes(a.codigo), xb = partes(b.codigo);
    for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
      const va = xa[i], vb = xb[i];
      if (va === undefined) return -1;
      if (vb === undefined) return 1;
      if (typeof va === "number" && typeof vb === "number") {
        if (va !== vb) return va - vb;
      } else if (String(va) !== String(vb)) {
        return String(va).localeCompare(String(vb), "pt-BR");
      }
    }
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test tests/naming.test.ts`
Expected: PASS — 18 testes

Se `B01.01.c` falhar, o culpado é o lookahead `(?=\D|$)` do `PREFIXO`: ele
existe para que `01.02-A Ordem` case o código `01.02` e não `01`. Confira com
`console.log(PREFIXO.exec("B01.01.c-Apresentação"))` antes de mexer na regex.

- [ ] **Step 5: Conferir contra o disco de verdade**

```bash
bun -e '
import { lerItem, lerModulo } from "./src/naming.ts";
import { readdirSync } from "node:fs";
const raiz = "./acervo/1-Ensinantes";
for (const d of readdirSync(raiz, { withFileTypes: true }).slice(0, 40)) {
  const n = d.isDirectory() ? lerModulo(d.name) : lerItem(d.name);
  console.log(String(n.codigo).padEnd(9), n.titulo);
}'
```

Olhe a saída. Nenhum título deve conter extensão, `+`, ou começar com hífen.
Se algum estiver errado, é um padrão novo: **acrescente um teste com o nome
real** e só então ajuste a regex.

- [ ] **Step 6: Commit**

```bash
git add src/naming.ts tests/naming.test.ts
git commit -m "naming: extração de código e título dos três padrões do acervo"
```

---

### Task 3: `db.ts` — esquema e acesso

**Files:**
- Create: `src/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: `config.ts` (`DB_PATH`, `Usuario`)
- Produces:
  - `conectar(path?: string): Database`
  - `type Estado = "pendente" | "rodando" | "pronto" | "erro" | "sem-video"`
  - `interface Progresso { segundos: number; feito: boolean }`
  - `lerProgresso(db, usuario): Record<string, Progresso>`
  - `lerNotas(db, usuario): Record<string, string>`
  - `lerPrefs(db, usuario): Record<string, string>`
  - `type OpSync = { tipo: "progresso"; chave: string; segundos: number; feito: boolean } | { tipo: "nota"; chave: string; texto: string } | { tipo: "pref"; nome: string; valor: string }`
  - `aplicarSync(db, usuario, ops: OpSync[]): { aplicadas: number }`
  - `tocarSessao(db, usuario): void`
  - `outroOnline(db, usuario, minutos?): boolean`
  - `registrar(db, nivel: "info" | "erro", origem: string, mensagem: string): void`
  - `destravar(db): number`

- [ ] **Step 1: Escrever o teste que falha**

`tests/db.test.ts`:

```ts
import { expect, test } from "bun:test";
import { aplicarSync, conectar, lerNotas, lerPrefs, lerProgresso, outroOnline, tocarSessao } from "../src/db.ts";

const novo = () => conectar(":memory:");

test("o esquema sobe do zero sem erro", () => {
  const db = novo();
  const tabelas = db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  for (const t of ["cursos", "modulos", "itens", "recortes", "eventos",
                   "progresso", "notas", "prefs", "ui_estado", "sessoes"]) {
    expect(tabelas).toContain(t);
  }
});

test("progresso do procópio não aparece na leitura do chico", () => {
  const db = novo();
  aplicarSync(db, "procopio", [{ tipo: "progresso", chave: "i:1", segundos: 42, feito: true }]);
  expect(lerProgresso(db, "procopio")["i:1"]).toEqual({ segundos: 42, feito: true });
  expect(lerProgresso(db, "chico")["i:1"]).toBeUndefined();
});

test("os dois podem marcar a mesma aula sem se atropelar", () => {
  const db = novo();
  aplicarSync(db, "chico",    [{ tipo: "progresso", chave: "i:7", segundos: 10, feito: false }]);
  aplicarSync(db, "procopio", [{ tipo: "progresso", chave: "i:7", segundos: 99, feito: true }]);
  expect(lerProgresso(db, "chico")["i:7"]).toEqual({ segundos: 10, feito: false });
  expect(lerProgresso(db, "procopio")["i:7"]).toEqual({ segundos: 99, feito: true });
});

test("reenviar o mesmo lote é inofensivo", () => {
  const db = novo();
  const ops = [{ tipo: "progresso", chave: "i:3", segundos: 5, feito: false }] as const;
  aplicarSync(db, "chico", [...ops]);
  aplicarSync(db, "chico", [...ops]);
  expect(lerProgresso(db, "chico")["i:3"]).toEqual({ segundos: 5, feito: false });
  expect(db.query("SELECT COUNT(*) c FROM progresso").get()).toEqual({ c: 1 });
});

test("nota vazia apaga a linha em vez de guardar string vazia", () => {
  const db = novo();
  aplicarSync(db, "chico", [{ tipo: "nota", chave: "i:9", texto: "lembrar disso" }]);
  expect(lerNotas(db, "chico")["i:9"]).toBe("lembrar disso");
  aplicarSync(db, "chico", [{ tipo: "nota", chave: "i:9", texto: "   " }]);
  expect(lerNotas(db, "chico")["i:9"]).toBeUndefined();
});

test("preferência é por usuário", () => {
  const db = novo();
  aplicarSync(db, "chico", [{ tipo: "pref", nome: "velocidade", valor: "1.5" }]);
  expect(lerPrefs(db, "chico").velocidade).toBe("1.5");
  expect(lerPrefs(db, "procopio").velocidade).toBeUndefined();
});

test("presença: o chico vê o procópio recém-visto", () => {
  const db = novo();
  tocarSessao(db, "procopio");
  expect(outroOnline(db, "chico")).toBe(true);
});

test("presença: ninguém está online quando ninguém abriu", () => {
  const db = novo();
  tocarSessao(db, "chico");
  expect(outroOnline(db, "chico")).toBe(false);
});

test("presença expira depois da janela", () => {
  const db = novo();
  db.run("INSERT INTO sessoes (usuario, ultimo_acesso) VALUES ('procopio', datetime('now','-30 minutes'))");
  expect(outroOnline(db, "chico", 5)).toBe(false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test tests/db.test.ts`
Expected: FAIL — `Cannot find module '../src/db.ts'`

- [ ] **Step 3: Escrever `src/db.ts`**

```ts
/**
 * Esquema e acesso. Sem regra de negócio: quem decide o que é divergência ou
 * o que é recorte são outros módulos.
 *
 * O catálogo (`cursos`/`modulos`/`itens`) é DERIVADO do disco — o scan pode
 * refazê-lo a qualquer momento. O estado de quem estuda (`progresso`, `notas`,
 * `prefs`) é o único dado que só existe aqui, e por isso é o que a cópia de
 * backup precisa preservar.
 */
import { Database } from "bun:sqlite";

import { DB_PATH, type Usuario } from "./config.ts";

export type Estado = "pendente" | "rodando" | "pronto" | "erro" | "sem-video";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS cursos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  pasta         TEXT NOT NULL,
  posicao       INTEGER NOT NULL,
  titulo        TEXT NOT NULL,
  estado        TEXT NOT NULL,            -- completo | esqueleto | materiais
  escaneado_em  TEXT
);

CREATE TABLE IF NOT EXISTS modulos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id  INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,
  pasta     TEXT,
  titulo    TEXT NOT NULL,
  posicao   INTEGER NOT NULL,
  UNIQUE(curso_id, codigo)
);

CREATE TABLE IF NOT EXISTS itens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id           INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL,       -- video|pdf|planilha|doc|link|markdown
  codigo              TEXT,
  titulo              TEXT NOT NULL,
  rel_path            TEXT NOT NULL UNIQUE,
  posicao             INTEGER NOT NULL,
  bytes               INTEGER NOT NULL DEFAULT 0,
  duracao             REAL,
  srt_path            TEXT,
  alvo                TEXT,                -- URL, para tipo 'link'
  transcricao_estado  TEXT NOT NULL DEFAULT 'pendente',
  transcricao_erro    TEXT,
  tentativas          INTEGER NOT NULL DEFAULT 0,
  transcrito_em       TEXT,
  comparacao          TEXT                 -- JSON {palavras_nova, palavras_antiga, similaridade}
);

CREATE INDEX IF NOT EXISTS idx_itens_modulo ON itens(modulo_id);
CREATE INDEX IF NOT EXISTS idx_itens_transc ON itens(transcricao_estado);

CREATE TABLE IF NOT EXISTS recortes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path  TEXT NOT NULL UNIQUE,
  item_id   INTEGER REFERENCES itens(id) ON DELETE SET NULL,
  arquivos  INTEGER NOT NULL,
  bytes     INTEGER NOT NULL,
  visto_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eventos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  nivel     TEXT NOT NULL,
  origem    TEXT NOT NULL,
  mensagem  TEXT NOT NULL
);

-- Daqui para baixo, o estado de quem estuda. 'usuario' na chave primária em
-- todas: é o que impede o procópio de sobrescrever o que o chico marcou.
CREATE TABLE IF NOT EXISTS progresso (
  usuario    TEXT    NOT NULL,
  chave      TEXT    NOT NULL,
  segundos   REAL    NOT NULL DEFAULT 0,
  feito      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario, chave)
);

CREATE TABLE IF NOT EXISTS notas (
  usuario    TEXT NOT NULL,
  chave      TEXT NOT NULL,
  texto      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario, chave)
);

CREATE TABLE IF NOT EXISTS prefs (
  usuario    TEXT NOT NULL,
  nome       TEXT NOT NULL,
  valor      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario, nome)
);

CREATE TABLE IF NOT EXISTS ui_estado (
  usuario TEXT NOT NULL,
  nome    TEXT NOT NULL,
  valor   TEXT NOT NULL,
  PRIMARY KEY (usuario, nome)
);

CREATE TABLE IF NOT EXISTS sessoes (
  usuario       TEXT PRIMARY KEY,
  ultimo_acesso TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function conectar(path: string = DB_PATH): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(ESQUEMA);
  return db;
}

export interface Progresso { segundos: number; feito: boolean }

export function lerProgresso(db: Database, usuario: Usuario): Record<string, Progresso> {
  const linhas = db.query<{ chave: string; segundos: number; feito: number }, [string]>(
    "SELECT chave, segundos, feito FROM progresso WHERE usuario = ?").all(usuario);
  return Object.fromEntries(linhas.map((l) => [l.chave, { segundos: l.segundos, feito: !!l.feito }]));
}

export function lerNotas(db: Database, usuario: Usuario): Record<string, string> {
  const linhas = db.query<{ chave: string; texto: string }, [string]>(
    "SELECT chave, texto FROM notas WHERE usuario = ?").all(usuario);
  return Object.fromEntries(linhas.map((l) => [l.chave, l.texto]));
}

export function lerPrefs(db: Database, usuario: Usuario): Record<string, string> {
  const linhas = db.query<{ nome: string; valor: string }, [string]>(
    "SELECT nome, valor FROM prefs WHERE usuario = ?").all(usuario);
  return Object.fromEntries(linhas.map((l) => [l.nome, l.valor]));
}

export type OpSync =
  | { tipo: "progresso"; chave: string; segundos: number; feito: boolean }
  | { tipo: "nota"; chave: string; texto: string }
  | { tipo: "pref"; nome: string; valor: string };

/**
 * Aplica um lote de escritas do painel.
 *
 * Toda operação é "deixe assim", nunca "some mais um" — por isso reenviar o
 * mesmo lote é inofensivo, e por isso o navegador pode tentar de novo depois de
 * uma piscada do túnel sem medo de duplicar.
 */
export function aplicarSync(db: Database, usuario: Usuario, ops: OpSync[]): { aplicadas: number } {
  const prog = db.prepare(`INSERT INTO progresso (usuario, chave, segundos, feito, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(usuario, chave) DO UPDATE SET
      segundos = excluded.segundos, feito = excluded.feito, updated_at = excluded.updated_at`);
  const nota = db.prepare(`INSERT INTO notas (usuario, chave, texto, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(usuario, chave) DO UPDATE SET
      texto = excluded.texto, updated_at = excluded.updated_at`);
  // Texto em branco não vira linha vazia: apagar o texto apaga a anotação.
  const semNota = db.prepare("DELETE FROM notas WHERE usuario = ? AND chave = ?");
  const pref = db.prepare(`INSERT INTO prefs (usuario, nome, valor, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(usuario, nome) DO UPDATE SET
      valor = excluded.valor, updated_at = excluded.updated_at`);

  const lote = db.transaction((lista: OpSync[]) => {
    for (const op of lista) {
      if (op.tipo === "progresso") prog.run(usuario, op.chave, op.segundos, op.feito ? 1 : 0);
      else if (op.tipo === "nota") {
        if (op.texto.trim()) nota.run(usuario, op.chave, op.texto);
        else semNota.run(usuario, op.chave);
      } else pref.run(usuario, op.nome, op.valor);
    }
  });
  lote(ops);
  return { aplicadas: ops.length };
}

export function tocarSessao(db: Database, usuario: Usuario): void {
  db.run(`INSERT INTO sessoes (usuario, ultimo_acesso) VALUES (?, datetime('now'))
    ON CONFLICT(usuario) DO UPDATE SET ultimo_acesso = datetime('now')`, [usuario]);
}

/** Alguém que não seja `usuario` deu sinal de vida nos últimos `minutos`. */
export function outroOnline(db: Database, usuario: Usuario, minutos = 5): boolean {
  const r = db.query<{ n: number }, [string, string]>(
    `SELECT COUNT(*) n FROM sessoes
      WHERE usuario <> ? AND ultimo_acesso > datetime('now', ?)`
  ).get(usuario, `-${minutos} minutes`);
  return (r?.n ?? 0) > 0;
}

export function registrar(db: Database, nivel: "info" | "erro", origem: string, mensagem: string): void {
  db.run("INSERT INTO eventos (nivel, origem, mensagem) VALUES (?, ?, ?)", [nivel, origem, mensagem]);
}

/** `rodando` depois de um reinício é processo morto, não trabalho em curso. */
export function destravar(db: Database): number {
  return db.run("UPDATE itens SET transcricao_estado = 'pendente' WHERE transcricao_estado = 'rodando'").changes;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test tests/db.test.ts`
Expected: PASS — 9 testes

- [ ] **Step 5: Commit**

```bash
git add src/db.ts tests/db.test.ts
git commit -m "db: esquema com estado do usuário isolado por usuario"
```

---

### Task 4: `scan.ts` — a varredura e o prune

O coração do projeto. Se o prune estiver errado, o scan toca 172 mil arquivos
sobre drvfs e o projeto inteiro fica insuportável de usar.

**Files:**
- Create: `src/scan.ts`
- Test: `tests/scan.test.ts`

**Interfaces:**
- Consumes: `config.ts`, `naming.ts` (`lerItem`, `lerModulo`, `ordenarPorCodigo`), `db.ts` (`conectar`, `registrar`)
- Produces:
  - `type Tipo = "video" | "pdf" | "planilha" | "doc" | "link" | "markdown"`
  - `tipoDe(arquivo: string): Tipo | null`
  - `interface Achado { itens: ItemBruto[]; recortes: RecorteBruto[]; ignorados: string[] }`
  - `interface ItemBruto { tipo: Tipo; codigo: string | null; titulo: string; relPath: string; bytes: number; srtPath: string | null; alvo: string | null }`
  - `interface RecorteBruto { relPath: string; arquivos: number; bytes: number }`
  - `ehRecorte(entradas: Dirent[]): boolean`
  - `varrerPasta(absoluto: string, relativo: string): Achado`

- [ ] **Step 1: Escrever o teste que falha**

`tests/scan.test.ts`:

```ts
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tipoDe, varrerPasta } from "../src/scan.ts";

const RAIZ = join(import.meta.dir, "__fixture-scan");

/** Reproduz em miniatura a bagunça real do acervo. */
function montarFixture(): void {
  rmSync(RAIZ, { recursive: true, force: true });
  const mod = join(RAIZ, "01-Modulo Um");
  mkdirSync(mod, { recursive: true });

  // Uma aula completa: vídeo + os três sidecars + a pasta de recortes.
  writeFileSync(join(mod, "01.01-Aula Um.mp4"), "video");
  writeFileSync(join(mod, "01.01-Aula Um.srt"), "1\n00:00:00,000 --> 00:00:01,000\noi\n");
  writeFileSync(join(mod, "01.01-Aula Um-Fala.Cronometrada.txt"), "[00:00:00.000] oi");
  writeFileSync(join(mod, "01.01-Aula Um.txt"), "oi");
  const recorte = join(mod, "01.01-Aula Um");
  mkdirSync(recorte);
  for (let i = 0; i < 5; i++) writeFileSync(join(recorte, `f${i}.png`), "png");

  // Aula sem legenda nenhuma.
  writeFileSync(join(mod, "01.02-Aula Dois.mp4"), "video");

  // Materiais de tipos variados.
  writeFileSync(join(mod, "01.03-Apostila.pdf"), "pdf");
  writeFileSync(join(mod, "01.04-Planilha+de+Custos.xlsx"), "xlsx");
  writeFileSync(join(mod, "01.05-Atalho.url"), "[InternetShortcut]\r\nURL=https://exemplo.com/x\r\n");

  // PNG solto no meio do módulo: NÃO é recorte (a pasta tem mp4) e NÃO é item.
  writeFileSync(join(mod, "icons8-ms-excel-48.png"), "png");

  // Pasta de recorte com sufixo de resolução — não casa com nome de vídeo.
  const solta = join(mod, "Aula 3 - Atraindo Alunos 720 x 1280");
  mkdirSync(solta);
  for (let i = 0; i < 3; i++) writeFileSync(join(solta, `g${i}.png`), "png");

  // Pastas que o scanner ignora.
  mkdirSync(join(mod, "_antigo"));
  writeFileSync(join(mod, "_antigo", "01.01-Aula Um.srt"), "velha");
  mkdirSync(join(mod, "_transcricoes.antigas"));
  writeFileSync(join(mod, "_transcricoes.antigas", "01.02-Aula Dois.srt"), "velha");
}

montarFixture();
afterAll(() => rmSync(RAIZ, { recursive: true, force: true }));

test("tipoDe reconhece os tipos do acervo e recusa imagem", () => {
  expect(tipoDe("a.mp4")).toBe("video");
  expect(tipoDe("a.pdf")).toBe("pdf");
  expect(tipoDe("a.xlsx")).toBe("planilha");
  expect(tipoDe("a.docx")).toBe("doc");
  expect(tipoDe("a.onepkg")).toBe("doc");
  expect(tipoDe("a.url")).toBe("link");
  expect(tipoDe("a.md")).toBe("markdown");
  expect(tipoDe("a.png")).toBeNull();
  expect(tipoDe("a.srt")).toBeNull();
  expect(tipoDe("a.txt")).toBeNull();
});

test("a pasta de recortes é contada e NÃO é descida", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  const nomes = r.recortes.map((x) => x.relPath).sort();
  expect(nomes).toEqual([
    "01-Modulo Um/01.01-Aula Um",
    "01-Modulo Um/Aula 3 - Atraindo Alunos 720 x 1280",
  ]);
  expect(r.recortes.find((x) => x.relPath.endsWith("01.01-Aula Um"))!.arquivos).toBe(5);
  // Nenhum PNG virou item — nem os de dentro do recorte, nem o solto.
  expect(r.itens.some((i) => i.relPath.endsWith(".png"))).toBe(false);
});

test("o vídeo é amarrado ao seu .srt irmão", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  const um = r.itens.find((i) => i.codigo === "01.01")!;
  expect(um.tipo).toBe("video");
  expect(um.srtPath).toBe("01-Modulo Um/01.01-Aula Um.srt");
});

test("vídeo sem legenda fica com srtPath null", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  expect(r.itens.find((i) => i.codigo === "01.02")!.srtPath).toBeNull();
});

test("o .url vira link com a URL extraída do INI", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  const atalho = r.itens.find((i) => i.tipo === "link")!;
  expect(atalho.alvo).toBe("https://exemplo.com/x");
});

test("o título da planilha passa pela regra do mais", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  expect(r.itens.find((i) => i.tipo === "planilha")!.titulo).toBe("Planilha de Custos");
});

test("_antigo e _transcricoes.antigas ficam fora do catálogo e viram ignorados", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  expect(r.itens.some((i) => i.relPath.includes("_antigo"))).toBe(false);
  expect(r.itens.some((i) => i.relPath.includes("_transcricoes.antigas"))).toBe(false);
  expect(r.ignorados).toContain("01-Modulo Um/_antigo");
});

test("os sidecars não viram itens por conta própria", () => {
  const r = varrerPasta(join(RAIZ, "01-Modulo Um"), "01-Modulo Um");
  expect(r.itens).toHaveLength(4); // 2 vídeos + pdf + planilha + link = 5? não: ver abaixo
});
```

O último teste está deliberadamente errado — a contagem certa é **5** (dois
vídeos, um pdf, uma planilha, um link). Corrija para `toHaveLength(5)` ao
implementar; ele existe para você conferir a conta em vez de aceitar o número
que a implementação devolver.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test tests/scan.test.ts`
Expected: FAIL — `Cannot find module '../src/scan.ts'`

- [ ] **Step 3: Escrever `src/scan.ts` (parte 1: varredura)**

```ts
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

/** Conta e soma sem descer em subpasta: recorte é plano por construção. */
function medirRecorte(absoluto: string, entradas: Dirent[]): { arquivos: number; bytes: number } {
  let arquivos = 0, bytes = 0;
  for (const e of entradas) {
    if (!e.isFile()) continue;
    arquivos++;
    bytes += statSync(join(absoluto, e.name)).size;
  }
  return { arquivos, bytes };
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
        recortes.push({ relPath: rel, ...medirRecorte(join(absoluto, e.name), dentro) });
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
```

- [ ] **Step 4: Corrigir a contagem do último teste e rodar**

Troque `expect(r.itens).toHaveLength(4)` por `toHaveLength(5)` e explique na
própria linha:

```ts
  // 01.01 e 01.02 (vídeos) + apostila + planilha + atalho. Os sidecars .srt,
  // .txt e -Fala.Cronometrada.txt não contam: aparecem amarrados ao vídeo.
  expect(r.itens).toHaveLength(5);
```

Run: `bun test tests/scan.test.ts`
Expected: PASS — 8 testes

- [ ] **Step 5: Medir o prune contra o acervo de verdade**

```bash
time bun -e '
import { varrerPasta } from "./src/scan.ts";
import { readdirSync } from "node:fs";
import { join } from "node:path";
const raiz = "./acervo/1-Ensinantes";
let itens = 0, rec = 0, png = 0;
for (const d of readdirSync(raiz, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const r = varrerPasta(join(raiz, d.name), d.name);
  itens += r.itens.length; rec += r.recortes.length;
  png += r.recortes.reduce((s, x) => s + x.arquivos, 0);
}
console.log({ itens, pastasDeRecorte: rec, pngsContados: png });'
```

Expected: algo próximo de `{ itens: ~250, pastasDeRecorte: ~60, pngsContados: ~172000 }`
em **menos de 30 segundos**.

Se passar de dois minutos, o prune não está funcionando — quase sempre é
`ehRecorte` devolvendo `false` porque a pasta tem um arquivo não-imagem junto
dos PNGs. Investigue com:

```bash
bun -e 'import{readdirSync}from"node:fs";
console.log(readdirSync("./acervo/1-Ensinantes/05-Pesquisa de Mercado/05.07-Pesquisa da Concorrência",{withFileTypes:true}).filter(e=>!e.name.endsWith(".png")).map(e=>e.name))'
```

- [ ] **Step 6: Commit**

```bash
git add src/scan.ts tests/scan.test.ts
git commit -m "scan: varredura de módulo com prune por conteúdo nos recortes"
```

---

### Task 5: Materializar o catálogo

Pega o que a Tarefa 4 acha e escreve no banco — com os quatro casos especiais do
acervo real: o curso esqueleto, a pasta `Repo/`, os arquivos soltos na raiz do
curso, e a duração dos vídeos.

**Files:**
- Modify: `src/scan.ts` (acrescenta ao que a Tarefa 4 criou)
- Test: `tests/catalogo.test.ts`

**Interfaces:**
- Consumes: tudo da Tarefa 4, `db.ts`, `naming.ts` (`lerLinhaLista`, `lerModulo`, `ordenarPorCodigo`)
- Produces:
  - `duracaoDe(absoluto: string): number | null`
  - `escanearCurso(db, absoluto: string, posicao: number): { itens: number; recortes: number }`
  - `escanearTudo(db): { cursos: number; itens: number; recortes: number; ignorados: string[] }`
  - Constantes exportadas: `CURSOS_ESPERADOS`, `PESSOAIS`, `LIXO_DE_ORGANIZACAO`

- [ ] **Step 1: Escrever o teste que falha**

`tests/catalogo.test.ts`:

```ts
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { conectar } from "../src/db.ts";
import { escanearCurso, ehPessoal, ehLixoDeOrganizacao } from "../src/scan.ts";

const RAIZ = join(import.meta.dir, "__fixture-catalogo");

function montar(): void {
  rmSync(RAIZ, { recursive: true, force: true });

  // Curso completo, com um módulo e arquivos soltos na raiz.
  const c1 = join(RAIZ, "1-Curso");
  mkdirSync(join(c1, "01-Modulo Um"), { recursive: true });
  writeFileSync(join(c1, "01-Modulo Um", "01.01-Aula.mp4"), "v");
  writeFileSync(join(c1, "Mapa.do.Curso.xlsx"), "x");                 // avulso legítimo
  writeFileSync(join(c1, "Boleto_Francisco_Lima_Figueiredo.pdf"), "p"); // pessoal
  writeFileSync(join(c1, "Certificado-Ensinantes-abc.pdf"), "p");       // pessoal
  writeFileSync(join(c1, "gera_pastas.sh"), "s");                       // lixo
  writeFileSync(join(c1, "Lista.txt"), "l");                            // lixo
  writeFileSync(join(c1, "_l.txt"), "l");                               // lixo

  // Curso esqueleto: só lista.txt em CRLF.
  const c2 = join(RAIZ, "2-Vazio");
  mkdirSync(c2, { recursive: true });
  writeFileSync(join(c2, "lista.txt"),
    "Módulo 01 - O SAK(IA)\r\nMódulo 02 - Deep-Dive IA\r\n\r\n");
  writeFileSync(join(c2, "gera_pastas.bash"), "#!/bin/bash");

  // Pasta de materiais escritos.
  const rp = join(RAIZ, "Repo");
  mkdirSync(join(rp, "versoes_anteriores"), { recursive: true });
  writeFileSync(join(rp, "Mapa.Completo.md"), "# mapa");
  writeFileSync(join(rp, "CHANGELOG.md"), "# log");
  writeFileSync(join(rp, "Mapa.do.Curso.On-line.(Completo).xlsx"), "x");
  writeFileSync(join(rp, "~$Mapa.do.Curso.On-line.(Completo).xlsx"), "lock");
  writeFileSync(join(rp, "excel2md_complete.py"), "py");
  writeFileSync(join(rp, "conversion.log"), "log");
  writeFileSync(join(rp, "versoes_anteriores", "velho.md"), "# velho");
}

montar();
afterAll(() => rmSync(RAIZ, { recursive: true, force: true }));

const modulosDe = (db: any, slug: string) =>
  db.query(`SELECT m.codigo, m.titulo FROM modulos m
            JOIN cursos c ON c.id = m.curso_id WHERE c.slug = ? ORDER BY m.posicao`).all(slug);

const itensDe = (db: any, slug: string) =>
  db.query(`SELECT i.tipo, i.titulo, i.rel_path FROM itens i
            JOIN modulos m ON m.id = i.modulo_id
            JOIN cursos c ON c.id = m.curso_id WHERE c.slug = ? ORDER BY i.posicao`).all(slug);

test("classificadores de arquivo de raiz", () => {
  expect(ehPessoal("Boleto_Francisco_Lima_Figueiredo.pdf")).toBe(true);
  expect(ehPessoal("Certificado-Ensinantes-Digitais-abc.pdf")).toBe(true);
  expect(ehPessoal("Mapa.do.Curso.xlsx")).toBe(false);
  expect(ehLixoDeOrganizacao("gera_pastas.sh")).toBe(true);
  expect(ehLixoDeOrganizacao("Lista.txt")).toBe(true);
  expect(ehLixoDeOrganizacao("_l.txt")).toBe(true);
  expect(ehLixoDeOrganizacao("~$Mapa.xlsx")).toBe(true);
  expect(ehLixoDeOrganizacao("Mapa.Completo.md")).toBe(false);
});

test("curso completo: módulo e aula entram", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  expect(modulosDe(db, "1-curso").map((m: any) => m.codigo)).toContain("01");
  expect(itensDe(db, "1-curso").some((i: any) => i.titulo === "Aula")).toBe(true);
});

test("arquivo solto na raiz vai para o módulo Avulsos", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const avulsos = modulosDe(db, "1-curso").find((m: any) => m.titulo === "Avulsos");
  expect(avulsos).toBeDefined();
  const titulos = itensDe(db, "1-curso").map((i: any) => i.titulo);
  expect(titulos).toContain("Mapa do Curso");
});

test("documento pessoal NÃO entra no catálogo", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const caminhos = itensDe(db, "1-curso").map((i: any) => i.rel_path).join("|");
  expect(caminhos).not.toContain("Boleto");
  expect(caminhos).not.toContain("Certificado");
});

test("script e lista de organização também ficam de fora", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const caminhos = itensDe(db, "1-curso").map((i: any) => i.rel_path).join("|");
  expect(caminhos).not.toContain("gera_pastas");
  expect(caminhos).not.toContain("_l.txt");
});

test("curso sem pasta nenhuma vira esqueleto a partir do lista.txt", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "2-Vazio"), 2);
  const curso = db.query("SELECT estado FROM cursos WHERE slug = '2-vazio'").get() as any;
  expect(curso.estado).toBe("esqueleto");
  const mods = modulosDe(db, "2-vazio");
  expect(mods).toHaveLength(2);
  expect(mods[0]).toEqual({ codigo: "01", titulo: "O SAK(IA)" });
  expect(itensDe(db, "2-vazio")).toHaveLength(0);
});

test("Repo vira curso de materiais com os markdowns e a planilha", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "Repo"), 9);
  const curso = db.query("SELECT estado, titulo FROM cursos WHERE slug = 'repo'").get() as any;
  expect(curso.estado).toBe("materiais");
  expect(curso.titulo).toBe("Materiais");
  const tipos = itensDe(db, "repo").map((i: any) => i.tipo);
  expect(tipos.filter((t: string) => t === "markdown")).toHaveLength(2);
  expect(tipos).toContain("planilha");
});

test("Repo: lock do Excel, .py, .log e versoes_anteriores ficam de fora", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "Repo"), 9);
  const caminhos = itensDe(db, "repo").map((i: any) => i.rel_path).join("|");
  expect(caminhos).not.toContain("~$");
  expect(caminhos).not.toContain("excel2md");
  expect(caminhos).not.toContain("conversion.log");
  expect(caminhos).not.toContain("versoes_anteriores");
});

test("rodar duas vezes não duplica nada", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  const antes = itensDe(db, "1-curso").length;
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  expect(itensDe(db, "1-curso")).toHaveLength(antes);
});

test("aula removida do disco some do catálogo no scan seguinte", () => {
  const db = conectar(":memory:");
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  rmSync(join(RAIZ, "1-Curso", "01-Modulo Um", "01.01-Aula.mp4"));
  escanearCurso(db, join(RAIZ, "1-Curso"), 1);
  expect(itensDe(db, "1-curso").some((i: any) => i.titulo === "Aula")).toBe(false);
  writeFileSync(join(RAIZ, "1-Curso", "01-Modulo Um", "01.01-Aula.mp4"), "v"); // repõe
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test tests/catalogo.test.ts`
Expected: FAIL — `escanearCurso is not a function`

- [ ] **Step 3: Acrescentar a `src/scan.ts`**

```ts
import { existsSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { basename } from "node:path";

import { ACERVO } from "./config.ts";
import { lerLinhaLista, lerModulo, ordenarPorCodigo } from "./naming.ts";
import { registrar } from "./db.ts";

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
  pasta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
       .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Título do curso a partir da pasta: tira o prefixo numérico, humaniza. */
const tituloDoCurso = (pasta: string): string =>
  pasta === "Repo" ? "Materiais" : lerModulo(pasta).titulo;

/**
 * Escaneia um curso inteiro e escreve no banco.
 *
 * Idempotente por SUBSTITUIÇÃO: apaga os módulos do curso e reconstrói. É o
 * `ON DELETE CASCADE` que limpa os itens junto, e é o que faz uma aula apagada
 * do disco sumir do catálogo no scan seguinte. O estado de quem estuda NÃO é
 * tocado: ele vive em `progresso`/`notas`, com chave textual, e sobrevive à
 * reconstrução.
 */
export function escanearCurso(db: Database, absoluto: string, posicao: number):
  { itens: number; recortes: number } {
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

  // Reconstrução: o catálogo é derivado, então apagar e refazer é mais simples
  // e mais correto do que reconciliar diferença a diferença.
  db.run("DELETE FROM modulos WHERE curso_id = ?", [cursoId]);

  const novoModulo = db.prepare(
    "INSERT INTO modulos (curso_id, codigo, pasta, titulo, posicao) VALUES (?, ?, ?, ?, ?)");
  const novoItem = db.prepare(
    `INSERT INTO itens (modulo_id, tipo, codigo, titulo, rel_path, posicao, bytes,
                        duracao, srt_path, alvo, transcricao_estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rel_path) DO UPDATE SET
       modulo_id = excluded.modulo_id, tipo = excluded.tipo, codigo = excluded.codigo,
       titulo = excluded.titulo, posicao = excluded.posicao, bytes = excluded.bytes,
       duracao = COALESCE(excluded.duracao, itens.duracao),
       srt_path = excluded.srt_path, alvo = excluded.alvo`);
  const novoRecorte = db.prepare(
    `INSERT INTO recortes (rel_path, arquivos, bytes, visto_em)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(rel_path) DO UPDATE SET
       arquivos = excluded.arquivos, bytes = excluded.bytes, visto_em = excluded.visto_em`);

  let nItens = 0, nRecortes = 0;

  const gravarItens = (moduloId: number, achados: ItemBruto[]): void => {
    ordenarPorCodigo(achados).forEach((it, i) => {
      const abs = join(ACERVO, it.relPath);
      // ffprobe só no que ainda não tem duração: 232 chamadas na primeira vez,
      // zero nas seguintes. É o COALESCE do UPSERT que preserva a medida.
      const jaTem = db.query<{ duracao: number | null }, [string]>(
        "SELECT duracao FROM itens WHERE rel_path = ?").get(it.relPath)?.duracao ?? null;
      const dur = it.tipo === "video" ? (jaTem ?? duracaoDe(abs)) : null;

      novoItem.run(moduloId, it.tipo, it.codigo, it.titulo, it.relPath, i, it.bytes,
        dur, it.srtPath, it.alvo,
        it.tipo === "video" ? (it.srtPath ? "pronto" : "pendente") : "sem-video");
      nItens++;
    });
  };

  if (esqueleto) {
    // Sem pasta nenhuma: os módulos vêm do lista.txt, que é CRLF.
    const linhas = readFileSync(join(absoluto, listaTxt!.name), "utf-8").split("\n");
    let pos = 0;
    for (const linha of linhas) {
      const n = lerLinhaLista(linha);
      if (!n) continue;
      novoModulo.run(cursoId, n.codigo ?? String(pos + 1).padStart(2, "0"), null, n.titulo, pos++);
    }
    return { itens: 0, recortes: 0 };
  }

  if (materiais) {
    // Um módulo implícito. Os markdowns e a planilha entram; script, log,
    // lock do Excel e versoes_anteriores ficam fora.
    const modId = Number(novoModulo.run(cursoId, "00", null, "Documentos", 0).lastInsertRowid);
    const achado = varrerPasta(absoluto, pasta);
    gravarItens(modId, achado.itens.filter((i) => !ehLixoDeOrganizacao(basename(i.relPath))));
    return { itens: nItens, recortes: 0 };
  }

  // Curso completo: um módulo por subpasta, na ordem do código.
  const ordenados = ordenarPorCodigo(subpastas.map((d) => ({ ...lerModulo(d.name), pasta: d.name })));
  ordenados.forEach((m, pos) => {
    const modId = Number(
      novoModulo.run(cursoId, m.codigo ?? m.pasta, m.pasta, m.titulo, pos).lastInsertRowid);
    const achado = varrerPasta(join(absoluto, m.pasta), `${pasta}/${m.pasta}`);
    gravarItens(modId, achado.itens);
    for (const r of achado.recortes) { novoRecorte.run(r.relPath, r.arquivos, r.bytes); nRecortes++; }
  });

  // Arquivos soltos na raiz do curso — existem no curso 1.
  const soltos = varrerPasta(absoluto, pasta).itens.filter(
    (i) => !ehPessoal(basename(i.relPath)) && !ehLixoDeOrganizacao(basename(i.relPath)));
  if (soltos.length) {
    const modId = Number(
      novoModulo.run(cursoId, "ZZ", null, "Avulsos", ordenados.length).lastInsertRowid);
    gravarItens(modId, soltos);
  }

  registrar(db, "info", "scan", `${pasta}: ${nItens} itens, ${nRecortes} pastas de recorte`);
  return { itens: nItens, recortes: nRecortes };
}

/** Roda os quatro cursos na ordem da home. */
export function escanearTudo(db: Database): { cursos: number; itens: number; recortes: number } {
  let cursos = 0, itens = 0, recortes = 0;
  CURSOS_ESPERADOS.forEach((pasta, i) => {
    const abs = join(ACERVO, pasta);
    if (!existsSync(abs)) { registrar(db, "erro", "scan", `pasta ausente: ${pasta}`); return; }
    const r = escanearCurso(db, abs, i);
    cursos++; itens += r.itens; recortes += r.recortes;
  });
  return { cursos, itens, recortes };
}
```

Acrescente `readdirSync` e `readFileSync` ao import de `node:fs` que já existe
no topo do arquivo, e `join` ao de `node:path`.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test tests/catalogo.test.ts`
Expected: PASS — 10 testes

- [ ] **Step 5: Escanear o acervo de verdade**

```bash
time bun run scan
```

Este é o primeiro scan: ele roda `ffprobe` em 231 vídeos. Espere **3 a 8
minutos**. Os scans seguintes reaproveitam a duração e caem para segundos.

Confira o resultado:

```bash
bun -e '
import { conectar } from "./src/db.ts";
const db = conectar();
console.table(db.query(`
  SELECT c.slug, c.estado, COUNT(DISTINCT m.id) modulos, COUNT(i.id) itens,
         ROUND(SUM(i.duracao)/3600.0, 1) horas
  FROM cursos c LEFT JOIN modulos m ON m.curso_id = c.id
                LEFT JOIN itens i ON i.modulo_id = m.id
  GROUP BY c.id ORDER BY c.posicao`).all());
console.log(db.query("SELECT COUNT(*) pastas, SUM(arquivos) pngs, ROUND(SUM(bytes)/1073741824.0,2) gb FROM recortes").get());'
```

Expected, conferido no acervo em 2026-08-22:

- `1-ensinantes` · completo · ~27 módulos · ~230 itens · **~40 horas**
- `2-acelerador-conteudo-ia` · esqueleto · 10 módulos · 0 itens
- `3-criadores-videos` · completo · 16 módulos · ~22 itens · **~2 horas**
- `repo` · materiais · 1 módulo · 10 itens
- recortes: **~60 pastas · ~172.000 PNGs · ~127 GB**

Se o total de horas não ficar perto de **42,1**, o `ffprobe` falhou em algum
vídeo. Ache quais:

```bash
bun -e 'import{conectar}from"./src/db.ts";
console.log(conectar().query("SELECT rel_path FROM itens WHERE tipo=\"video\" AND duracao IS NULL").all())'
```

- [ ] **Step 6: Commit**

```bash
git add src/scan.ts tests/catalogo.test.ts
git commit -m "scan: catálogo no banco, com curso esqueleto, materiais e avulsos"
```

---

### Task 6: `recortes.ts` — relatório e script de limpeza

127 GB, 87% do acervo. O script é **gerado e entregue**, nunca disparado.

**Files:**
- Create: `src/recortes.ts`
- Test: `tests/recortes.test.ts`

**Interfaces:**
- Consumes: `db.ts`, `config.ts` (`RELATORIOS`, `SCRIPTS`, `ACERVO`)
- Produces:
  - `interface LinhaRecorte { relPath: string; arquivos: number; bytes: number; aula: string | null }`
  - `listar(db): LinhaRecorte[]`
  - `relatorio(linhas: LinhaRecorte[]): string`
  - `script(linhas: LinhaRecorte[], acervo: string): string`
  - `gerar(db): { relatorio: string; script: string; total: number; bytes: number }`

- [ ] **Step 1: Escrever o teste que falha**

`tests/recortes.test.ts`:

```ts
import { expect, test } from "bun:test";
import { relatorio, script, type LinhaRecorte } from "../src/recortes.ts";

const AMOSTRA: LinhaRecorte[] = [
  { relPath: "1-Ensinantes/00-Lives.de.Leads/00.01-Descobrindo 720 x 1280",
    arquivos: 15862, bytes: 12_000_000_000, aula: null },
  { relPath: "1-Ensinantes/01.A.Jornada/01.01-Pacto de Ulisses",
    arquivos: 1661, bytes: 1_200_000_000, aula: "Pacto de Ulisses" },
];

test("o relatório traz total, contagem e a aula de origem", () => {
  const md = relatorio(AMOSTRA);
  expect(md).toContain("17.523");            // total de arquivos, separador pt-BR
  expect(md).toContain("12,29 GB");          // maior pasta
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test tests/recortes.test.ts`
Expected: FAIL — `Cannot find module '../src/recortes.ts'`

- [ ] **Step 3: Escrever `src/recortes.ts`**

```ts
/**
 * As pastas de recorte: relatório para ler e script para rodar quando quiser.
 *
 * São 127,25 GB em 172.004 PNGs — 87% do acervo, contra 18,43 GB de vídeo.
 * Apagá-las é a maior economia de disco disponível, e por isso mesmo o script
 * é ENTREGUE, não disparado: uma limpeza automática de 127 GB é o tipo de
 * conveniência que se lamenta uma vez só.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";

import { ACERVO, RELATORIOS, SCRIPTS } from "./config.ts";

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

export function gerar(db: Database): { relatorio: string; script: string; total: number; bytes: number } {
  const linhas = listar(db);
  mkdirSync(RELATORIOS, { recursive: true });
  mkdirSync(SCRIPTS, { recursive: true });

  const md = join(RELATORIOS, "recortes.md");
  const sh = join(SCRIPTS, "apagar-recortes.sh");
  writeFileSync(md, relatorio(linhas), "utf-8");
  writeFileSync(sh, script(linhas, ACERVO), { encoding: "utf-8", mode: 0o755 });

  return {
    relatorio: md, script: sh,
    total: linhas.length,
    bytes: linhas.reduce((s, l) => s + l.bytes, 0),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test tests/recortes.test.ts`
Expected: PASS — 5 testes

- [ ] **Step 5: Gerar contra o acervo e CONFERIR sem executar**

```bash
bun run recortes
head -40 relatorios/recortes.md
head -20 scripts/apagar-recortes.sh
bash scripts/apagar-recortes.sh          # tem de RECUSAR e sair com 1
echo "código de saída: $?"               # espera 1
```

Expected: o relatório mostra ~60 pastas e ~127 GB; o script sem `--confirmar`
imprime o aviso e sai com 1.

**Não rode com `--confirmar`.** A entrega é o script; a decisão é do Chico.

- [ ] **Step 6: Commit**

```bash
git add src/recortes.ts tests/recortes.test.ts
git commit -m "recortes: relatório dos 127 GB e script de limpeza gerado"
```

---

### Task 7: `legenda.ts` e `arquivos.ts` — leitura do acervo

Dois módulos pequenos e sem estado. `legenda.ts` é cópia literal do focus-scrap
(já testada em produção); `arquivos.ts` isola o `Range`, que é o que permite
arrastar a linha do tempo do vídeo.

**Files:**
- Create: `src/legenda.ts`, `src/arquivos.ts`
- Test: `tests/legenda.test.ts`, `tests/arquivos.test.ts`

**Interfaces:**
- Consumes: `config.ts` (`ACERVO`)
- Produces:
  - `interface Trecho { inicio: number; fim: number; texto: string }`
  - `paraSegundos(tempo: string): number`
  - `lerTrechos(conteudo: string): Trecho[]`
  - `srtParaVtt(srt: string): string`
  - `comoRelogio(segundos: number): string`
  - `mime(caminho: string): string`
  - `dentroDoAcervo(relPath: string): string | null`
  - `servirArquivo(relPath: string, req: Request): Response`

- [ ] **Step 1: Copiar `legenda.ts` do focus-scrap**

```bash
cp /mnt/d/Chico/focus-scrap/src/legenda.ts src/legenda.ts
cp /mnt/d/Chico/focus-scrap/tests/legenda.test.ts tests/legenda.test.ts
```

O arquivo não importa nada do projeto de origem — é função pura sobre texto.
Ajuste apenas o caminho do import no teste, se houver.

- [ ] **Step 2: Rodar o teste copiado**

Run: `bun test tests/legenda.test.ts`
Expected: PASS

Se falhar, é caminho de import. Não mexa na lógica: esse SRT→VTT já roda há
meses no focus-scrap, e a única razão de ele existir é que `<track>` não lê SRT
— carrega sem erro e simplesmente não mostra legenda nenhuma.

- [ ] **Step 3: Escrever o teste de `arquivos.ts`**

`tests/arquivos.test.ts`:

```ts
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ACERVO } from "../src/config.ts";
import { dentroDoAcervo, mime, servirArquivo } from "../src/arquivos.ts";

const PASTA = join(ACERVO, "__teste-arquivos");
mkdirSync(PASTA, { recursive: true });
writeFileSync(join(PASTA, "amostra.mp4"), "0123456789");
afterAll(() => rmSync(PASTA, { recursive: true, force: true }));

const REL = "__teste-arquivos/amostra.mp4";

test("mime cobre os tipos do acervo", () => {
  expect(mime("a.mp4")).toBe("video/mp4");
  expect(mime("a.pdf")).toBe("application/pdf");
  expect(mime("a.vtt")).toBe("text/vtt; charset=utf-8");
  expect(mime("a.xlsx")).toContain("spreadsheet");
  expect(mime("a.zzz")).toBe("application/octet-stream");
});

test("caminho com .. não escapa do acervo", () => {
  expect(dentroDoAcervo("../../etc/passwd")).toBeNull();
  expect(dentroDoAcervo("1-Ensinantes/../../etc/passwd")).toBeNull();
  expect(dentroDoAcervo(REL)).not.toBeNull();
});

test("sem Range devolve 200 com Accept-Ranges", async () => {
  const r = servirArquivo(REL, new Request("http://x/"));
  expect(r.status).toBe(200);
  expect(r.headers.get("Accept-Ranges")).toBe("bytes");
  expect(await r.text()).toBe("0123456789");
});

test("com Range devolve 206 e só o pedaço pedido", async () => {
  const r = servirArquivo(REL, new Request("http://x/", { headers: { range: "bytes=2-5" } }));
  expect(r.status).toBe(206);
  expect(r.headers.get("Content-Range")).toBe("bytes 2-5/10");
  expect(r.headers.get("Content-Length")).toBe("4");
  expect(await r.text()).toBe("2345");
});

test("Range aberto no fim vai até o último byte", async () => {
  const r = servirArquivo(REL, new Request("http://x/", { headers: { range: "bytes=7-" } }));
  expect(r.status).toBe(206);
  expect(await r.text()).toBe("789");
});

test("Range além do arquivo devolve 416", () => {
  const r = servirArquivo(REL, new Request("http://x/", { headers: { range: "bytes=50-60" } }));
  expect(r.status).toBe(416);
  expect(r.headers.get("Content-Range")).toBe("bytes */10");
});

test("arquivo inexistente devolve 404", () => {
  expect(servirArquivo("__teste-arquivos/nao-existe.mp4", new Request("http://x/")).status).toBe(404);
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `bun test tests/arquivos.test.ts`
Expected: FAIL — `Cannot find module '../src/arquivos.ts'`

- [ ] **Step 5: Escrever `src/arquivos.ts`**

```ts
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
```

- [ ] **Step 6: Rodar e ver passar**

Run: `bun test tests/arquivos.test.ts tests/legenda.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/legenda.ts src/arquivos.ts tests/legenda.test.ts tests/arquivos.test.ts
git commit -m "leitura do acervo: legenda srt→vtt e streaming com Range"
```

---

### Task 8: `usuario.ts` — identidade e permissões

O requisito mais específico do projeto. Um erro aqui não quebra nada
visivelmente — só deixa o Procópio ver o que não devia.

**Files:**
- Create: `src/usuario.ts`
- Test: `tests/usuario.test.ts`

**Interfaces:**
- Consumes: `config.ts` (`USUARIOS`, `USUARIO_PADRAO`, `Usuario`), `db.ts` (`outroOnline`, `tocarSessao`)
- Produces:
  - `HEADER_USUARIO = "x-painel-usuario"`
  - `quemE(req: Request): Usuario`
  - `interface Permissoes { admin: boolean; verDisco: boolean; verFila: boolean; verCaminhos: boolean; verDivergencias: boolean }`
  - `permissoesDe(usuario: Usuario): Permissoes`
  - `ROTAS_ADMIN: readonly string[]`
  - `ehRotaAdmin(rota: string): boolean`
  - `indicadores(db, usuario): { eu: "c" | "p"; outro: "p" | null }`

- [ ] **Step 1: Escrever o teste que falha**

`tests/usuario.test.ts`:

```ts
import { expect, test } from "bun:test";

import { conectar, tocarSessao } from "../src/db.ts";
import { ehRotaAdmin, indicadores, permissoesDe, quemE, ROTAS_ADMIN } from "../src/usuario.ts";

const comHeader = (v?: string) =>
  new Request("http://x/", { headers: v ? { "X-Painel-Usuario": v } : {} });

test("sem header o usuário é o chico — é o acesso local", () => {
  expect(quemE(comHeader())).toBe("chico");
});

test("o header do nginx identifica cada um", () => {
  expect(quemE(comHeader("chico"))).toBe("chico");
  expect(quemE(comHeader("procopio"))).toBe("procopio");
});

test("header desconhecido NÃO vira chico — cai no menos privilegiado", () => {
  expect(quemE(comHeader("ninguem"))).toBe("procopio");
  expect(quemE(comHeader("admin"))).toBe("procopio");
  expect(quemE(comHeader(""))).toBe("procopio");
});

test("o chico tem tudo", () => {
  expect(permissoesDe("chico")).toEqual({
    admin: true, verDisco: true, verFila: true, verCaminhos: true, verDivergencias: true,
  });
});

test("o procópio não tem nada além do conteúdo", () => {
  expect(permissoesDe("procopio")).toEqual({
    admin: false, verDisco: false, verFila: false, verCaminhos: false, verDivergencias: false,
  });
});

test("as rotas administrativas são exatamente as cinco da spec", () => {
  expect([...ROTAS_ADMIN].sort()).toEqual(
    ["/api/abrir", "/api/limpeza", "/api/requeue", "/api/revelar", "/api/run"]);
});

test("ehRotaAdmin não é enganado por prefixo nem por query", () => {
  expect(ehRotaAdmin("/api/run")).toBe(true);
  expect(ehRotaAdmin("/api/runner")).toBe(false);
  expect(ehRotaAdmin("/api/sync")).toBe(false);
  expect(ehRotaAdmin("/api/tudo")).toBe(false);
});

test("indicador do chico: (c), e (p) quando o procópio está online", () => {
  const db = conectar(":memory:");
  expect(indicadores(db, "chico")).toEqual({ eu: "c", outro: null });
  tocarSessao(db, "procopio");
  expect(indicadores(db, "chico")).toEqual({ eu: "c", outro: "p" });
});

test("o procópio vê (p) e NUNCA sabe que o chico está online", () => {
  const db = conectar(":memory:");
  tocarSessao(db, "chico");
  expect(indicadores(db, "procopio")).toEqual({ eu: "p", outro: null });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test tests/usuario.test.ts`
Expected: FAIL — `Cannot find module '../src/usuario.ts'`

- [ ] **Step 3: Escrever `src/usuario.ts`**

```ts
/**
 * Quem está do outro lado, e o que essa pessoa pode.
 *
 * A autenticação é do nginx: o htpasswd tem duas entradas e o site repassa o
 * usuário autenticado em `X-Painel-Usuario`. O app não tem tela de login e não
 * guarda senha — ele só lê o resultado.
 *
 * Sem header, o usuário é `chico`: é o caso do acesso local em 127.0.0.1, onde
 * a máquina já é dele. Mas header PRESENTE e desconhecido cai em `procopio`, o
 * menos privilegiado — porque um header estranho significa configuração errada
 * do nginx, e nesse caso errar para menos poder é a única direção segura.
 */
import type { Database } from "bun:sqlite";

import { USUARIO_PADRAO, USUARIOS, type Usuario } from "./config.ts";
import { outroOnline } from "./db.ts";

export const HEADER_USUARIO = "x-painel-usuario";

const MENOS_PRIVILEGIADO: Usuario = "procopio";

export function quemE(req: Request): Usuario {
  const bruto = req.headers.get(HEADER_USUARIO);
  if (bruto === null) return USUARIO_PADRAO;
  const nome = bruto.trim().toLowerCase();
  return (USUARIOS as readonly string[]).includes(nome) ? (nome as Usuario) : MENOS_PRIVILEGIADO;
}

export interface Permissoes {
  /** Pode disparar processo nesta máquina. */
  admin: boolean;
  /** Vê espaço em disco, bytes e contagem de recortes. */
  verDisco: boolean;
  /** Vê fila de transcrição, eventos e erros. */
  verFila: boolean;
  /** Vê caminho absoluto e o botão de revelar no Explorer. */
  verCaminhos: boolean;
  /** Vê o card de transcrições divergentes. */
  verDivergencias: boolean;
}

export function permissoesDe(usuario: Usuario): Permissoes {
  const dono = usuario === "chico";
  return {
    admin: dono, verDisco: dono, verFila: dono, verCaminhos: dono, verDivergencias: dono,
  };
}

/**
 * Rotas que rodam processo na máquina de casa.
 *
 * Estão em 403 no nginx E conferidas aqui. As duas tranças existem porque
 * fazem coisas diferentes: o nginx protege o acesso remoto, e esta lista
 * protege contra o nginx mal configurado.
 */
export const ROTAS_ADMIN = [
  "/api/run", "/api/requeue", "/api/revelar", "/api/abrir", "/api/limpeza",
] as const;

/** Igualdade exata: `/api/runner` não é `/api/run`. */
export function ehRotaAdmin(rota: string): boolean {
  return (ROTAS_ADMIN as readonly string[]).includes(rota);
}

/**
 * As letrinhas do canto superior direito.
 *
 * O `(p)` acende para o chico quando o procópio está online. O contrário NÃO
 * acontece: o procópio nunca fica sabendo quando o chico está no painel. É
 * assimétrico de propósito.
 */
export function indicadores(db: Database, usuario: Usuario): { eu: "c" | "p"; outro: "p" | null } {
  const eu = usuario === "chico" ? "c" : "p";
  const outro = usuario === "chico" && outroOnline(db, "chico") ? "p" : null;
  return { eu, outro };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test tests/usuario.test.ts`
Expected: PASS — 9 testes

- [ ] **Step 5: Commit**

```bash
git add src/usuario.ts tests/usuario.test.ts
git commit -m "usuario: identidade pelo header do nginx e matriz de permissões"
```

---

### Task 9: `painel.ts` — servidor e rotas de leitura

**Files:**
- Create: `src/painel.ts`
- Test: `tests/painel.test.ts`

**Interfaces:**
- Consumes: todos os módulos anteriores
- Produces:
  - `montarResposta(db, req: Request): Promise<Response>` — o roteador puro, testável sem abrir porta
  - `servir(db, porta: number): void`
  - `arvore(db, usuario: Usuario, slug?: string): CursoArvore[]` — já filtrada pelas permissões
  - `interface CursoArvore { slug, titulo, estado, modulos: { codigo, titulo, itens: ItemArvore[] }[] }`
  - `interface ItemArvore { id, tipo, codigo, titulo, duracao, bytes, temLegenda, relPath }`

- [ ] **Step 1: Escrever o teste que falha**

`tests/painel.test.ts`:

```ts
import { beforeAll, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import { conectar } from "../src/db.ts";
import { montarResposta } from "../src/painel.ts";

let db: Database;

beforeAll(() => {
  db = conectar(":memory:");
  db.run(`INSERT INTO cursos (slug,pasta,posicao,titulo,estado) VALUES ('c1','1-Curso',0,'Curso Um','completo')`);
  db.run(`INSERT INTO modulos (curso_id,codigo,pasta,titulo,posicao) VALUES (1,'01','01-Mod','Módulo Um',0)`);
  db.run(`INSERT INTO itens (modulo_id,tipo,codigo,titulo,rel_path,posicao,bytes,duracao,srt_path,transcricao_estado)
          VALUES (1,'video','01.01','Aula Um','1-Curso/01-Mod/01.01-Aula Um.mp4',0,1000,600,'1-Curso/01-Mod/01.01-Aula Um.srt','pronto')`);
});

const pedir = (rota: string, usuario?: string, init: RequestInit = {}) =>
  montarResposta(db, new Request(`http://x${rota}`, {
    ...init, headers: { ...(init.headers ?? {}), ...(usuario ? { "X-Painel-Usuario": usuario } : {}) },
  }));

test("a home responde HTML", async () => {
  const r = await pedir("/");
  expect(r.status).toBe(200);
  expect(r.headers.get("Content-Type")).toContain("text/html");
});

test("/api/eu devolve chico sem header", async () => {
  const j = await (await pedir("/api/eu")).json();
  expect(j.usuario).toBe("chico");
  expect(j.permissoes.admin).toBe(true);
  expect(j.indicadores).toEqual({ eu: "c", outro: null });
});

test("/api/eu com o procópio devolve permissões vazias", async () => {
  const j = await (await pedir("/api/eu", "procopio")).json();
  expect(j.usuario).toBe("procopio");
  expect(j.permissoes.admin).toBe(false);
  expect(j.indicadores.eu).toBe("p");
});

test("TODA rota administrativa devolve 403 para o procópio", async () => {
  for (const rota of ["/api/run", "/api/requeue", "/api/revelar", "/api/abrir", "/api/limpeza"]) {
    const r = await pedir(rota, "procopio", { method: "POST", body: "{}" });
    expect([rota, r.status]).toEqual([rota, 403]);
  }
});

test("/api/sync NUNCA é bloqueada — nem para o procópio", async () => {
  const r = await pedir("/api/sync", "procopio", {
    method: "POST", body: JSON.stringify({ ops: [] }),
    headers: { "Content-Type": "application/json" },
  });
  expect(r.status).toBe(200);
});

test("/api/tudo esconde bytes e caminho do procópio", async () => {
  const chico = await (await pedir("/api/tudo?curso=c1", "chico")).json();
  const proc  = await (await pedir("/api/tudo?curso=c1", "procopio")).json();

  const itemChico = chico.arvore[0].modulos[0].itens[0];
  const itemProc  = proc.arvore[0].modulos[0].itens[0];

  expect(itemChico.bytes).toBe(1000);
  expect(itemChico.relPath).toContain("01.01-Aula Um.mp4");
  expect(itemProc.bytes).toBeUndefined();
  expect(itemProc.relPath).toBeUndefined();

  // Mas o conteúdo em si continua lá para os dois.
  expect(itemProc.titulo).toBe("Aula Um");
  expect(itemProc.duracao).toBe(600);
  expect(itemProc.temLegenda).toBe(true);
});

test("/api/tudo esconde fila e eventos do procópio", async () => {
  const proc = await (await pedir("/api/tudo?curso=c1", "procopio")).json();
  expect(proc.eventos).toBeUndefined();
  expect(proc.fila).toBeUndefined();
  expect(proc.disco).toBeUndefined();
});

test("o progresso que vem em /api/tudo é o do usuário que pediu", async () => {
  await pedir("/api/sync", "procopio", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops: [{ tipo: "progresso", chave: "i:1", segundos: 5, feito: true }] }),
  });
  const proc  = await (await pedir("/api/tudo?curso=c1", "procopio")).json();
  const chico = await (await pedir("/api/tudo?curso=c1", "chico")).json();
  expect(proc.progresso["i:1"]).toEqual({ segundos: 5, feito: true });
  expect(chico.progresso["i:1"]).toBeUndefined();
});

test("rota desconhecida devolve 404", async () => {
  expect((await pedir("/api/inexistente")).status).toBe(404);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test tests/painel.test.ts`
Expected: FAIL — `Cannot find module '../src/painel.ts'`

- [ ] **Step 3: Escrever `src/painel.ts`**

```ts
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
 */
import type { Database } from "bun:sqlite";

import { PAINEL_HOST, type Usuario } from "./config.ts";
import {
  aplicarSync, lerNotas, lerPrefs, lerProgresso, tocarSessao, type OpSync,
} from "./db.ts";
import { servirArquivo } from "./arquivos.ts";
import { lerTrechos, srtParaVtt } from "./legenda.ts";
import { ehRotaAdmin, indicadores, permissoesDe, quemE } from "./usuario.ts";
import { PAGINA } from "./ui/pagina.ts";

export interface ItemArvore {
  id: number; tipo: string; codigo: string | null; titulo: string;
  duracao: number | null; temLegenda: boolean;
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
  duracao: number | null; bytes: number | null; rel_path: string | null;
  srt_path: string | null; transcricao_estado: string | null; pos: number | null;
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
           i.id, i.tipo, i.codigo, i.titulo, i.duracao, i.bytes, i.rel_path,
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
    if (pode.verDisco) item.bytes = l.bytes ?? 0;
    if (pode.verCaminhos) item.relPath = l.rel_path ?? undefined;
    if (pode.verFila) item.estado = l.transcricao_estado ?? undefined;
    m.itens.push(item);
  }
  return [...cursos.values()];
}

/** Números do acervo — só para quem tem `verDisco`. */
function disco(db: Database) {
  return {
    ...db.query(`SELECT COUNT(*) itens, SUM(bytes) bytes, SUM(duracao) segundos FROM itens`).get(),
    recortes: db.query(`SELECT COUNT(*) pastas, SUM(arquivos) arquivos, SUM(bytes) bytes FROM recortes`).get(),
  };
}

/** Estado da transcrição — só para quem tem `verFila`. */
function fila(db: Database) {
  return db.query(`SELECT transcricao_estado estado, COUNT(*) n
                     FROM itens WHERE tipo = 'video' GROUP BY 1`).all();
}

function itemPorId(db: Database, id: number) {
  return db.query<{ rel_path: string; srt_path: string | null; titulo: string }, [number]>(
    "SELECT rel_path, srt_path, titulo FROM itens WHERE id = ?").get(id);
}

export async function montarResposta(db: Database, req: Request): Promise<Response> {
  const url = new URL(req.url);
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
    };
    // Nada de card de disco, fila ou evento para quem não pode vê-los: a chave
    // simplesmente não existe na resposta.
    if (pode.verDisco) corpo.disco = disco(db);
    if (pode.verFila) {
      corpo.fila = fila(db);
      corpo.eventos = db.query(
        "SELECT at, nivel, origem, mensagem FROM eventos ORDER BY id DESC LIMIT 120").all();
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
    const corpo = (await req.json().catch(() => null)) as { ops?: OpSync[] } | null;
    if (!corpo || !Array.isArray(corpo.ops)) {
      return Response.json({ ok: false, msg: "fila inválida" }, { status: 400 });
    }
    const r = aplicarSync(db, usuario, corpo.ops);
    return Response.json({
      ok: true, ...r,
      progresso: lerProgresso(db, usuario),
      notas: lerNotas(db, usuario),
      prefs: lerPrefs(db, usuario),
    });
  }

  if (rota === "/api/video" || rota === "/api/arquivo") {
    const item = itemPorId(db, Number(url.searchParams.get("id")));
    if (!item) return new Response("não encontrado", { status: 404 });
    return servirArquivo(item.rel_path, req);
  }

  if (rota === "/api/legenda") {
    const item = itemPorId(db, Number(url.searchParams.get("id")));
    if (!item?.srt_path) return new Response("sem legenda", { status: 404 });
    const srt = await Bun.file(`${process.env.ED_ACERVO ?? "./acervo"}/${item.srt_path}`).text();
    return new Response(srtParaVtt(srt), {
      headers: { "Content-Type": "text/vtt; charset=utf-8" },
    });
  }

  if (rota === "/api/transcricao") {
    const item = itemPorId(db, Number(url.searchParams.get("id")));
    if (!item?.srt_path) return Response.json({ trechos: [] });
    const srt = await Bun.file(`${process.env.ED_ACERVO ?? "./acervo"}/${item.srt_path}`).text();
    return Response.json({ titulo: item.titulo, trechos: lerTrechos(srt) });
  }

  return new Response("não encontrado", { status: 404 });
}

const TENTATIVAS_PORTA = 20;

export function servir(db: Database, porta: number): void {
  for (let p = porta; p < porta + TENTATIVAS_PORTA; p++) {
    try {
      if (p !== porta) console.log(`porta ${p - 1} em uso — tentando ${p}…`);
      Bun.serve({ hostname: PAINEL_HOST, port: p, fetch: (req) => montarResposta(db, req) });
      console.log(`painel em http://${PAINEL_HOST}:${p}`);
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
```

- [ ] **Step 4: Criar um `src/ui/pagina.ts` mínimo para o teste passar**

A UI de verdade vem nas Tarefas 10 a 12. Por ora, o esqueleto:

```ts
/** A página. Substituída pela UI completa nas tarefas 10 a 12. */
export const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Ensinantes Digitais</title></head>
<body><div id="app">carregando…</div></body></html>`;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test tests/painel.test.ts`
Expected: PASS — 9 testes

O teste que mais importa é `TODA rota administrativa devolve 403 para o
procópio`. Ele varre `ROTAS_ADMIN` inteira, então uma rota nova entra na
proteção e no teste ao mesmo tempo.

- [ ] **Step 6: Commit**

```bash
git add src/painel.ts src/ui/pagina.ts tests/painel.test.ts
git commit -m "painel: roteamento testável e permissões aplicadas no servidor"
```

---

### Task 10: UI — tema e home

Primeira tela visível. Ao fim desta tarefa `bun run painel` mostra os quatro
cards com progresso real.

**Files:**
- Create: `src/ui/tema.ts`, `src/ui/home.ts`
- Modify: `src/ui/pagina.ts` (substitui o esqueleto)
- Test: `tests/ui.test.ts`

**Interfaces:**
- Consumes: nada do backend — a UI conversa por `fetch`
- Produces: `CSS: string` (tema.ts), `HOME_JS: string` (home.ts), `PAGINA: string` (pagina.ts)

- [ ] **Step 1: Escrever `src/ui/tema.ts`**

```ts
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
```

- [ ] **Step 2: Escrever `src/ui/home.ts`**

```ts
/**
 * A home: um cartão por curso, mais "continuar de onde parou".
 *
 * O JS é vanilla e vive numa string. Não é preguiça: sem bundler o painel sobe
 * em ~200 ms, e é isso que faz ele ser aberto no meio do estudo em vez de ser
 * levantado.
 */
export const HOME_JS = `
function relogio(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  const dd = n => String(n).padStart(2, '0');
  return h ? h + ':' + dd(m) + ':' + dd(r) : m + ':' + dd(r);
}

function horas(seg) {
  if (!seg) return '';
  return (seg / 3600).toFixed(1).replace('.', ',') + ' h';
}

/** Quanto do curso o usuário já marcou como feito. */
function progressoDoCurso(curso, progresso) {
  let total = 0, feitos = 0;
  for (const m of curso.modulos) for (const i of m.itens) {
    total++;
    if (progresso['i:' + i.id］?.feito) feitos++;
  }
  return { total, feitos, pct: total ? Math.round(feitos * 100 / total) : 0 };
}

function cartaoDeCurso(curso, progresso) {
  const p = progressoDoCurso(curso, progresso);
  const aulas = curso.modulos.reduce((s, m) => s + m.itens.length, 0);
  const seg = curso.modulos.reduce((s, m) =>
    s + m.itens.reduce((t, i) => t + (i.duracao || 0), 0), 0);
  const vazio = curso.estado === 'esqueleto';

  return \`<a class="cartao \${vazio ? 'vazio' : ''}" href="/curso/\${curso.slug}">
    <h2>\${esc(curso.titulo)}</h2>
    <div class="meta num">\${curso.modulos.length} módulos ·
      \${vazio ? 'não baixado' : aulas + ' itens'}\${seg ? ' · ' + horas(seg) : ''}</div>
    <div class="barra \${p.pct === 100 ? 'pronta' : ''}"><i style="width:\${p.pct}%"></i></div>
    <div class="meta num" style="margin-top:6px">\${vazio ? '—' : p.feitos + ' de ' + p.total + ' · ' + p.pct + '%'}</div>
  </a>\`;
}

const esc = s => (s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** O item mais recentemente tocado que ainda não terminou. */
function ultimoAberto(arvore, progresso) {
  let melhor = null, quando = '';
  for (const c of arvore) for (const m of c.modulos) for (const i of m.itens) {
    const p = progresso['i:' + i.id］;
    if (!p || p.feito || !p.segundos) continue;
    if (!melhor || p.updated_at > quando) { melhor = { curso: c, item: i, p }; quando = p.updated_at || ''; }
  }
  return melhor;
}

function selos(ind) {
  const meu = '<span class="selo eu" title="você">' + ind.eu + '</span>';
  const outro = ind.outro ? '<span class="selo outro" title="procópio está online">' + ind.outro + '</span>' : '';
  return outro + meu;
}

async function pintarHome() {
  const d = await (await fetch('/api/tudo')).json();
  const retomar = ultimoAberto(d.arvore, d.progresso);

  document.getElementById('app').innerHTML = \`
    <header class="topo">
      <h1>Ensinantes Digitais</h1><div class="espaco"></div>\${selos(d.indicadores)}
    </header>
    <main>
      <div class="cartoes">\${d.arvore.map(c => cartaoDeCurso(c, d.progresso)).join('')}</div>
      \${retomar ? \`<div class="retomar">
        <h3>Continuar de onde parou</h3>
        <a class="cartao" href="/curso/\${retomar.curso.slug}#i\${retomar.item.id}">
          <h2>\${esc(retomar.item.titulo)}</h2>
          <div class="meta num">\${esc(retomar.curso.titulo)} · em \${relogio(retomar.p.segundos)}</div>
        </a></div>\` : ''}
    </main>\`;
}
`;
```

**Atenção ao escrever este arquivo:** os `］` no código acima são um artefato do
plano — troque os dois por `]` normal. Se escapar um, o navegador quebra com
`SyntaxError` e a página fica em branco sem nenhum aviso no terminal.

- [ ] **Step 3: Substituir `src/ui/pagina.ts`**

```ts
import { CSS } from "./tema.ts";
import { HOME_JS } from "./home.ts";

/**
 * A página inteira, servida tanto em `/` quanto em `/curso/<slug>`.
 *
 * O roteamento é do lado do cliente: o servidor devolve o mesmo HTML nas duas
 * rotas e o JS decide o que pintar pelo `location.pathname`. É o que permite
 * navegar entre curso e home sem recarregar e sem perder a posição do vídeo.
 */
export const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ensinantes Digitais</title>
<style>${CSS}</style>
</head>
<body>
<div id="app">carregando…</div>
<script>
${HOME_JS}
// A tela de curso entra na Tarefa 11, junto com o import de CURSO_JS e o
// desvio por location.pathname. Aqui a home é a única tela que existe.
const rota = () => pintarHome();
addEventListener('popstate', rota);
rota();
</script>
</body>
</html>`;
```

- [ ] **Step 4: Escrever o teste de fumaça da UI**

`tests/ui.test.ts`:

```ts
import { expect, test } from "bun:test";
import { PAGINA } from "../src/ui/pagina.ts";

test("a página traz os tokens do tema escuro", () => {
  expect(PAGINA).toContain("--fundo: #0e1013");
  expect(PAGINA).toContain("--ambar: #e8963c");
  expect(PAGINA).toContain("--verde: #4ea672");
});

test("números de tempo são tabulares", () => {
  expect(PAGINA).toContain("tabular-nums");
});

test("não sobrou o artefato de colchete do plano", () => {
  expect(PAGINA).not.toContain("］");
});

test("o HTML é válido o bastante para o parser não abortar", () => {
  // Aspas não fechadas em atributo são o erro mais comum ao editar template
  // string à mão, e deixam a página em branco sem log nenhum.
  const aspas = (PAGINA.match(/"/g) ?? []).length;
  expect(aspas % 2).toBe(0);
});
```

- [ ] **Step 5: Rodar os testes**

Run: `bun test tests/ui.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 6: Ver com os próprios olhos**

```bash
bun run painel
```

Abra `http://127.0.0.1:17789`. Deve aparecer: quatro cartões (Ensinantes,
Acelerador esmaecido, Criadores, Materiais), com contagem e barra de progresso,
e um `(c)` no canto superior direito.

Confira também com o console do navegador aberto — a página em branco quase
sempre é `SyntaxError` no JS inline, e o único lugar onde isso aparece é ali.

- [ ] **Step 7: Commit**

```bash
git add src/ui/ tests/ui.test.ts
git commit -m "ui: tema escuro e home com cartões de curso"
```

---

### Task 11: UI — curso, árvore e player

**Files:**
- Create: `src/ui/curso.ts`, `src/ui/player.ts`
- Modify: `src/ui/tema.ts` (acrescenta o CSS da tela de curso)

**Interfaces:**
- Consumes: `/api/tudo?curso=<slug>`, `/api/video?id=`, `/api/legenda?id=`
- Produces: `CURSO_JS: string`, `PLAYER_JS: string`

- [ ] **Step 1: Acrescentar o CSS da tela de curso a `src/ui/tema.ts`**

```ts
export const CSS_CURSO = `
.curso { display: grid; grid-template-columns: 320px 1fr; gap: 0; height: calc(100vh - 55px); }

.arvore { overflow-y: auto; border-right: 1px solid var(--borda); padding: 12px 0 40px; }
.arvore .modulo > summary {
  padding: 9px 18px; cursor: pointer; font-weight: 600; font-size: 14px;
  list-style: none; display: flex; gap: 8px; align-items: baseline;
}
.arvore .modulo > summary::-webkit-details-marker { display: none; }
.arvore .modulo > summary:hover { background: var(--superficie); }
.arvore .modulo > summary .cod { color: var(--secundario); font-size: 12px; }
.arvore .aula {
  display: flex; gap: 9px; align-items: baseline;
  padding: 7px 18px 7px 34px; font-size: 14px; cursor: pointer;
  border-left: 2px solid transparent; color: var(--secundario);
}
.arvore .aula:hover { background: var(--superficie); color: var(--texto); }
.arvore .aula.corrente { border-left-color: var(--ambar); color: var(--texto); background: var(--superficie); }
.arvore .aula .marca { width: 12px; flex: none; }
.arvore .aula.feita .marca { color: var(--verde); }
.arvore .aula .dur { margin-left: auto; font-size: 12px; }

.palco { overflow-y: auto; padding: 0 0 60px; }
.palco video { width: 100%; background: #000; display: block; aspect-ratio: 16/9; }
.palco .cabeca { padding: 16px 24px 8px; }
.palco .cabeca h2 { margin: 0; font-size: 19px; font-weight: 600; }
.palco .ferramentas { display: flex; gap: 10px; flex-wrap: wrap; padding: 8px 24px 16px; align-items: center; }

@media (max-width: 900px) {
  .curso { grid-template-columns: 1fr; height: auto; }
  .arvore { border-right: 0; border-bottom: 1px solid var(--borda); max-height: 42vh; }
}
`;
```

E no `PAGINA`, troque `<style>${CSS}</style>` por `<style>${CSS}${CSS_CURSO}</style>`.

- [ ] **Step 2: Escrever `src/ui/curso.ts`**

```ts
/**
 * A tela de curso: árvore à esquerda, palco à direita.
 *
 * O estado vive em `dados` e `atual`, dois módulos no escopo do script. Não há
 * framework e não precisa haver: são duas listas e um vídeo, e cada repintura
 * é uma atribuição de innerHTML sobre um nó pequeno.
 */
export const CURSO_JS = `
let dados = null, atual = null, slugAtual = null;

const CHAVE = id => 'i:' + id;
const feito = id => !!(dados?.progresso[CHAVE(id)]?.feito);

function linhaDeAula(item) {
  const marca = feito(item.id) ? '✓' : (item.tipo === 'video' ? '▸' : '·');
  const dur = item.duracao ? relogio(item.duracao) : '';
  return \`<div class="aula \${feito(item.id) ? 'feita' : ''} \${atual?.id === item.id ? 'corrente' : ''}"
               data-id="\${item.id}" id="i\${item.id}">
    <span class="marca">\${marca}</span>
    <span>\${esc(item.titulo)}</span>
    <span class="dur tempo">\${dur}</span>
  </div>\`;
}

function pintarArvore() {
  document.querySelector('.arvore').innerHTML = dados.arvore[0].modulos.map(m => \`
    <details class="modulo" \${m.itens.some(i => i.id === atual?.id) ? 'open' : ''}>
      <summary><span class="cod num">\${esc(m.codigo)}</span><span>\${esc(m.titulo)}</span></summary>
      \${m.itens.map(linhaDeAula).join('')}
    </details>\`).join('');

  document.querySelectorAll('.arvore .aula').forEach(el =>
    el.onclick = () => abrir(Number(el.dataset.id)));
}

function itemPorId(id) {
  for (const m of dados.arvore[0].modulos) for (const i of m.itens) if (i.id === id) return i;
  return null;
}

function abrir(id) {
  atual = itemPorId(id);
  if (!atual) return;
  history.replaceState(null, '', '#i' + id);
  pintarArvore();
  pintarPalco();
}

async function pintarCurso(slug) {
  slugAtual = slug;
  dados = await (await fetch('/api/tudo?curso=' + encodeURIComponent(slug))).json();
  const curso = dados.arvore[0];

  document.getElementById('app').innerHTML = \`
    <header class="topo">
      <a href="/" title="voltar">←</a>
      <h1>\${esc(curso.titulo)}</h1>
      <div class="espaco"></div>\${selos(dados.indicadores)}
    </header>
    <div class="curso"><div class="arvore"></div><div class="palco"></div></div>\`;

  // Retoma o que estava aberto, ou a primeira aula com vídeo.
  const alvo = Number((location.hash.match(/#i(\\d+)/) || [])[1]);
  const primeira = curso.modulos.flatMap(m => m.itens).find(i => i.tipo === 'video');
  atual = (alvo && itemPorId(alvo)) || primeira || null;

  pintarArvore();
  pintarPalco();
}
`;
```

- [ ] **Step 3: Escrever `src/ui/player.ts`**

```ts
/**
 * O palco: vídeo, marcação de visto, e a fila de escrita que sobrevive à
 * queda do túnel.
 *
 * A fila é o detalhe que mais importa aqui. Marcar aula como vista pelo tablet,
 * com o túnel piscando, tem de continuar valendo quando a conexão volta — por
 * isso toda escrita entra numa fila no localStorage e só sai de lá quando o
 * servidor confirma. Reenviar o mesmo lote é inofensivo: cada operação é
 * "deixe assim", nunca "some mais um".
 */
export const PLAYER_JS = `
const FILA = 'ed.fila';

function enfileirar(op) {
  const f = JSON.parse(localStorage.getItem(FILA) || '[]');
  f.push(op);
  localStorage.setItem(FILA, JSON.stringify(f));
  aplicarLocal(op);
  escoar();
}

/** Efeito imediato na tela, sem esperar a rede. */
function aplicarLocal(op) {
  if (op.tipo === 'progresso') dados.progresso[op.chave] = { segundos: op.segundos, feito: op.feito };
  if (op.tipo === 'nota') { if (op.texto.trim()) dados.notas[op.chave] = op.texto; else delete dados.notas[op.chave]; }
  if (op.tipo === 'pref') dados.prefs[op.nome] = op.valor;
}

let escoando = false;
async function escoar() {
  if (escoando) return;
  const ops = JSON.parse(localStorage.getItem(FILA) || '[]');
  if (!ops.length) return;
  escoando = true;
  try {
    const r = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (r.ok) {
      const d = await r.json();
      dados.progresso = d.progresso; dados.notas = d.notas; dados.prefs = d.prefs;
      // Só limpa o que este lote continha: o que entrou na fila durante a
      // viagem fica para a próxima rodada.
      const restante = JSON.parse(localStorage.getItem(FILA) || '[]').slice(ops.length);
      localStorage.setItem(FILA, JSON.stringify(restante));
      pintarArvore();
    }
  } catch (e) { /* sem rede: fica na fila e tenta de novo */ }
  escoando = false;
}
setInterval(escoar, 8000);
addEventListener('online', escoar);

function marcar(id, valor) {
  const p = dados.progresso[CHAVE(id)] || { segundos: 0, feito: false };
  enfileirar({ tipo: 'progresso', chave: CHAVE(id), segundos: p.segundos, feito: valor });
  pintarArvore();
}

const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];

function pintarPalco() {
  const palco = document.querySelector('.palco');
  if (!atual) { palco.innerHTML = '<div class="cabeca"><h2>Módulo sem material</h2></div>'; return; }

  const p = dados.progresso[CHAVE(atual.id)] || { segundos: 0, feito: false };
  const vel = Number(dados.prefs.velocidade || 1);

  const midia = atual.tipo === 'video'
    ? \`<video id="v" controls preload="metadata" src="/api/video?id=\${atual.id}"
              \${atual.temLegenda ? '' : 'data-sem-legenda'}>
         \${atual.temLegenda ? \`<track default kind="subtitles" srclang="pt" label="Português"
                                       src="/api/legenda?id=\${atual.id}">\` : ''}
       </video>\`
    : \`<div class="cabeca"><a class="cartao" href="/api/arquivo?id=\${atual.id}" target="_blank">
         Abrir \${esc(atual.titulo)}</a></div>\`;

  palco.innerHTML = midia + \`
    <div class="cabeca"><h2>\${esc(atual.titulo)}</h2></div>
    <div class="ferramentas">
      <button id="bFeito">\${p.feito ? '✓ visto' : 'marcar como visto'}</button>
      \${atual.tipo === 'video' ? '<button id="bVel" class="num">' + vel + '×</button>' : ''}
      \${dados.permissoes.verCaminhos && atual.relPath
        ? '<button id="bRevelar">mostrar na pasta</button>' : ''}
    </div>
    <div id="transcricao"></div>\`;

  document.getElementById('bFeito').onclick = () => { marcar(atual.id, !feito(atual.id)); pintarPalco(); };

  const v = document.getElementById('v');
  if (v) {
    v.playbackRate = vel;
    if (p.segundos > 5) v.currentTime = p.segundos;

    // A cada 5 s, e não a cada timeupdate: o evento dispara ~4x por segundo, e
    // gravar nessa frequência enche a fila sem ganhar precisão nenhuma.
    let ultimo = 0;
    v.ontimeupdate = () => {
      if (v.currentTime - ultimo < 5) return;
      ultimo = v.currentTime;
      enfileirar({ tipo: 'progresso', chave: CHAVE(atual.id), segundos: v.currentTime, feito: feito(atual.id) });
      destacarTrecho(v.currentTime);
    };
    v.onended = () => { marcar(atual.id, true); pintarPalco(); };

    const bVel = document.getElementById('bVel');
    if (bVel) bVel.onclick = () => {
      const prox = VELOCIDADES[(VELOCIDADES.indexOf(v.playbackRate) + 1) % VELOCIDADES.length];
      v.playbackRate = prox;
      bVel.textContent = prox + '×';
      enfileirar({ tipo: 'pref', nome: 'velocidade', valor: String(prox) });
    };

    const bRev = document.getElementById('bRevelar');
    if (bRev) bRev.onclick = () => fetch('/api/revelar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: atual.id }),
    });
  }

  carregarTranscricao();
}
`;
```

Acrescente `PLAYER_JS` ao `PAGINA`, entre `HOME_JS` e `CURSO_JS`.

- [ ] **Step 4: Conferir na tela**

```bash
bun run painel
```

Abra um curso. Confira, um a um:

1. A árvore lista os módulos, e o módulo da aula corrente já vem aberto.
2. O vídeo toca e **a linha do tempo arrasta** — se não arrastar, o `Range` da
   Tarefa 7 não está sendo usado; olhe a aba Network procurando `206`.
3. A legenda aparece nas aulas que têm `.srt`.
4. "Marcar como visto" pinta o ✓ verde na árvore na hora.
5. Recarregue a página: o vídeo volta de onde parou.

- [ ] **Step 5: Conferir a fila offline**

Com o vídeo tocando, no DevTools: Network → Offline. Marque uma aula como
vista, espere 10 segundos, volte para Online. Em até 8 segundos a marcação sobe.

```js
// No console, para ver a fila:
JSON.parse(localStorage.getItem('ed.fila'))
```

Expected: a fila enche enquanto offline e esvazia sozinha ao voltar.

- [ ] **Step 6: Commit**

```bash
git add src/ui/
git commit -m "ui: árvore do curso, player com Range e fila de escrita offline"
```

---

### Task 12: UI — transcrição e anotações

**Files:**
- Create: `src/ui/transcricao.ts`
- Modify: `src/ui/tema.ts`, `src/ui/pagina.ts`

**Interfaces:**
- Consumes: `/api/transcricao?id=`
- Produces: `TRANSCRICAO_JS: string`, `CSS_TRANSCRICAO: string`

- [ ] **Step 1: Acrescentar CSS a `src/ui/tema.ts`**

```ts
export const CSS_TRANSCRICAO = `
.transc { padding: 8px 24px 40px; max-width: 760px; }
.transc h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
             color: var(--secundario); margin: 22px 0 10px; font-weight: 600; }
.transc .trecho {
  display: flex; gap: 12px; padding: 3px 0; cursor: pointer;
  border-radius: 6px; align-items: baseline;
}
.transc .trecho:hover { background: var(--superficie); }
.transc .trecho.ativo { color: var(--ambar); }
.transc .trecho .t { color: var(--secundario); font-size: 12px; flex: none; width: 52px; }
.transc .trecho.ativo .t { color: var(--ambar); }

.nota textarea {
  width: 100%; min-height: 110px; resize: vertical;
  background: var(--superficie); color: var(--texto);
  border: 1px solid var(--borda); border-radius: 10px; padding: 12px;
  font: inherit; line-height: 1.5;
}
.nota textarea:focus { outline: none; border-color: var(--ambar); }
`;
```

- [ ] **Step 2: Escrever `src/ui/transcricao.ts`**

```ts
/**
 * A transcrição embaixo do vídeo, com trecho clicável.
 *
 * Clicar num trecho dá seek — é o que transforma a transcrição de "texto para
 * ler" em "índice do vídeo", que é o uso real: achar onde o professor falou
 * daquilo e voltar lá.
 */
export const TRANSCRICAO_JS = `
let trechos = [];

async function carregarTranscricao() {
  const alvo = document.getElementById('transcricao');
  if (!alvo || atual?.tipo !== 'video') { trechos = []; return; }

  const d = await (await fetch('/api/transcricao?id=' + atual.id)).json();
  trechos = d.trechos || [];
  const nota = dados.notas[CHAVE(atual.id)] || '';

  alvo.className = 'transc';
  alvo.innerHTML = \`
    <div class="nota"><h3>Anotações</h3>
      <textarea id="nota" placeholder="o que você quer lembrar desta aula">\${esc(nota)}</textarea></div>
    <h3>Transcrição\${trechos.length ? '' : ' — ainda não transcrita'}</h3>
    <div id="trechos">\${trechos.map((t, i) =>
      \`<div class="trecho" data-i="\${i}"><span class="t tempo">\${relogio(t.inicio)}</span>
        <span>\${esc(t.texto)}</span></div>\`).join('')}</div>\`;

  document.querySelectorAll('.trecho').forEach(el => el.onclick = () => {
    const v = document.getElementById('v');
    if (v) { v.currentTime = trechos[Number(el.dataset.i)].inicio; v.play(); }
  });

  // Grava 800 ms depois da última tecla: sem isso cada letra vira uma
  // operação na fila, e a fila cresce mais rápido do que escoa.
  let timer;
  document.getElementById('nota').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() =>
      enfileirar({ tipo: 'nota', chave: CHAVE(atual.id), texto: e.target.value }), 800);
  };
}

let ativoAtual = -1;
function destacarTrecho(segundos) {
  if (!trechos.length) return;
  let i = trechos.findIndex(t => segundos >= t.inicio && segundos < t.fim);
  if (i === ativoAtual) return;

  document.querySelector('.trecho.ativo')?.classList.remove('ativo');
  ativoAtual = i;
  if (i < 0) return;

  const el = document.querySelector('.trecho[data-i="' + i + '"]');
  if (el) { el.classList.add('ativo'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
`;
```

- [ ] **Step 3: Ligar em `pagina.ts`**

```ts
<style>${CSS}${CSS_CURSO}${CSS_TRANSCRICAO}</style>
...
${HOME_JS}
${PLAYER_JS}
${TRANSCRICAO_JS}
${CURSO_JS}
```

A ordem importa: `CURSO_JS` por último, porque `pintarCurso` chama
`pintarPalco` e `carregarTranscricao`, que precisam já estar declaradas.

- [ ] **Step 4: Conferir na tela**

Abra uma aula que tenha `.srt` (por exemplo `01.01-Pacto de Ulisses`):

1. A transcrição aparece embaixo, com tempo à esquerda.
2. Clicar num trecho pula o vídeo para lá.
3. Com o vídeo tocando, o trecho corrente fica âmbar e rola sozinho.
4. Escreva na anotação, recarregue: o texto voltou.
5. Abra uma aula **sem** `.srt`: aparece "ainda não transcrita" em vez de erro.

- [ ] **Step 5: Commit**

```bash
git add src/ui/
git commit -m "ui: transcrição clicável com seek e anotação por aula"
```

---

### Task 13: Rotas administrativas — revelar, tarefas, backup

**Files:**
- Create: `src/revelar.ts`, `src/backup.ts`, `src/tarefas.ts`
- Modify: `src/painel.ts`
- Test: `tests/admin.test.ts`

**Interfaces:**
- Consumes: `arquivos.ts` (`dentroDoAcervo`), `usuario.ts`, `db.ts`
- Produces:
  - `revelar(absoluto: string): Promise<Revelado>`, `abrirNoSistema(absoluto)`, `diario: Execucao[]`
  - `sincronizarCopia(db): { ok: boolean; msg: string }`
  - `TAREFAS: Record<string, { rotulo: string; dica: string; cmd: string[] }>`
  - `disparar(nome: string): { ok: boolean; msg: string }`, `estadoTarefas(): …`

- [ ] **Step 1: Copiar `revelar.ts` e `backup.ts` do focus-scrap e adaptar**

```bash
cp /mnt/d/Chico/focus-scrap/src/revelar.ts src/revelar.ts
cp /mnt/d/Chico/focus-scrap/src/backup.ts src/backup.ts
```

Duas trocas em cada:
- `import { REPOSITORY } from "./config.ts"` → `import { ACERVO } from "./config.ts"`, e todo uso de `REPOSITORY` vira `ACERVO`.
- Em `backup.ts`, o nome do arquivo copiado: `focus.db` → `ensinantes.db`.

A lógica de `wslpath -w` fica como está: é o que faz o Explorer do Windows
entender `/mnt/e/…`, e continua valendo aqui.

- [ ] **Step 2: Escrever `src/tarefas.ts`**

```ts
/**
 * O que o painel dispara como processo separado.
 *
 * São processos, e não chamadas em linha, porque o scan mede 231 vídeos com
 * ffprobe e a transcrição ocupa a GPU por horas — segurar isso dentro do
 * handler HTTP travaria o painel justamente enquanto há o que mostrar.
 * Cada tarefa escreve no mesmo SQLite, então o progresso aparece na próxima
 * atualização da tela.
 */
export interface Execucao { nome: string; iniciada: string; linhas: string[]; fim?: number }

export const TAREFAS: Record<string, { rotulo: string; dica: string; cmd: string[] }> = {
  scan: {
    rotulo: "Reescanear o acervo",
    dica: "Relê as pastas. Rápido depois da primeira vez — a duração dos vídeos fica no banco.",
    cmd: ["bun", "run", "src/cli.ts", "scan"],
  },
  transcrever: {
    rotulo: "Transcrever a fila",
    dica: "Roda o Whisper na GPU sobre os vídeos pendentes. 42 h de vídeo levam ~2 h.",
    cmd: ["uv", "run", "python", "-m", "ensinantes.worker"],
  },
  requeue: {
    rotulo: "Reenfileirar os com erro",
    dica: "Devolve para a fila o que falhou na transcrição.",
    cmd: ["bun", "run", "src/cli.ts", "requeue"],
  },
  recortes: {
    rotulo: "Refazer relatório de recortes",
    dica: "Regera relatorios/recortes.md e scripts/apagar-recortes.sh. Não apaga nada.",
    cmd: ["bun", "run", "src/cli.ts", "recortes"],
  },
};

const emCurso = new Map<string, Execucao>();

export function disparar(nome: string): { ok: boolean; msg: string } {
  const t = TAREFAS[nome];
  if (!t) return { ok: false, msg: `tarefa desconhecida: ${nome}` };
  if (emCurso.has(nome)) return { ok: false, msg: `${t.rotulo} já está rodando` };

  const exec: Execucao = { nome, iniciada: new Date().toISOString(), linhas: [] };
  emCurso.set(nome, exec);

  const p = Bun.spawn(t.cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });

  const consumir = async (fluxo: ReadableStream<Uint8Array>) => {
    for await (const pedaco of fluxo) {
      for (const linha of new TextDecoder().decode(pedaco).split("\n")) {
        if (linha.trim()) exec.linhas.push(linha.slice(0, 200));
      }
      // Uma tarefa de horas produz muita linha; guardar tudo é vazamento lento.
      if (exec.linhas.length > 400) exec.linhas.splice(0, exec.linhas.length - 400);
    }
  };
  consumir(p.stdout);
  consumir(p.stderr);
  p.exited.then((c) => { exec.fim = c; setTimeout(() => emCurso.delete(nome), 60_000); });

  return { ok: true, msg: `${t.rotulo} iniciada` };
}

export function estadoTarefas() {
  return Object.entries(TAREFAS).map(([nome, t]) => ({
    nome, rotulo: t.rotulo, dica: t.dica,
    rodando: emCurso.has(nome) && emCurso.get(nome)!.fim === undefined,
    linhas: emCurso.get(nome)?.linhas.slice(-12) ?? [],
  }));
}
```

- [ ] **Step 3: Escrever o teste**

`tests/admin.test.ts`:

```ts
import { expect, test } from "bun:test";

import { conectar } from "../src/db.ts";
import { montarResposta } from "../src/painel.ts";
import { disparar, TAREFAS } from "../src/tarefas.ts";

const db = conectar(":memory:");
const pedir = (rota: string, usuario: string, body: unknown = {}) =>
  montarResposta(db, new Request(`http://x${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Painel-Usuario": usuario },
    body: JSON.stringify(body),
  }));

test("tarefa desconhecida não dispara processo nenhum", () => {
  expect(disparar("rm-rf-tudo")).toEqual({ ok: false, msg: "tarefa desconhecida: rm-rf-tudo" });
});

test("as tarefas expostas são exatamente as quatro previstas", () => {
  expect(Object.keys(TAREFAS).sort()).toEqual(["recortes", "requeue", "scan", "transcrever"]);
});

test("o procópio não dispara tarefa", async () => {
  const r = await pedir("/api/run", "procopio", { nome: "scan" });
  expect(r.status).toBe(403);
});

test("o procópio não revela caminho", async () => {
  const r = await pedir("/api/revelar", "procopio", { id: 1 });
  expect(r.status).toBe(403);
});

test("o chico recebe erro de negócio, não 403", async () => {
  const r = await pedir("/api/run", "chico", { nome: "inexistente" });
  expect(r.status).toBe(400);
  expect((await r.json()).msg).toContain("desconhecida");
});

test("revelar recusa id que não existe no banco — o caminho vem de lá, não da URL", async () => {
  const r = await pedir("/api/revelar", "chico", { id: 999999 });
  expect(r.status).toBe(404);
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `bun test tests/admin.test.ts`
Expected: FAIL — as rotas administrativas ainda não estão em `montarResposta`

- [ ] **Step 5: Acrescentar as rotas a `src/painel.ts`**

Logo antes do `return new Response("não encontrado", { status: 404 })` final:

```ts
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
    const alvo = dentroDoAcervo(item.rel_path);
    if (!alvo) return Response.json({ ok: false, msg: "fora do acervo" }, { status: 400 });
    return Response.json(rota === "/api/revelar" ? await revelar(alvo) : await abrirNoSistema(alvo));
  }

  if (rota === "/api/limpeza" && req.method === "POST") {
    return Response.json({ ok: true, ...gerar(db) });
  }
```

E os imports no topo: `dentroDoAcervo` de `./arquivos.ts`, `revelar` e
`abrirNoSistema` de `./revelar.ts`, `gerar` de `./recortes.ts`, `disparar` e
`estadoTarefas` de `./tarefas.ts`.

Acrescente também `tarefas: estadoTarefas()` ao corpo de `/api/tudo`, dentro do
`if (pode.verFila)`.

- [ ] **Step 6: Rodar e ver passar**

Run: `bun test`
Expected: PASS — toda a suíte

- [ ] **Step 7: Commit**

```bash
git add src/revelar.ts src/backup.ts src/tarefas.ts src/painel.ts tests/admin.test.ts
git commit -m "admin: tarefas em processo separado, revelar com caminho vindo do banco"
```

---

### Task 14: Worker Python — transcrição com backup

42,1 horas de vídeo em 231 arquivos. Na RTX 4080 SUPER com `large-v3` batched,
espere **1,5 a 3 horas**.

**Files:**
- Create: `pyproject.toml`, `py/ensinantes/__init__.py`, `config.py`, `db.py`, `transcriber.py`, `worker.py`
- Test: `py/tests/test_transcriber.py`

**Interfaces:**
- Consumes: o mesmo `ensinantes.db`
- Produces:
  - `guardar_antigas(video: Path) -> list[Path]`
  - `escrever_saidas(trechos, destino_base: Path) -> None`
  - `hms(segundos: float, virgula: bool = True) -> str`
  - `processar(conn, item, pipeline) -> None`

- [ ] **Step 1: Escrever `pyproject.toml`**

```toml
[project]
name = "ensinantes-digitais"
version = "0.1.0"
description = "Worker de transcrição por GPU do painel Ensinantes Digitais."
requires-python = ">=3.12"
dependencies = []

[project.optional-dependencies]
# ~2,5 GB com CUDA. A máquina do Chico já tem torch + faster-whisper no Python
# do sistema; `uv sync --extra gpu` só é preciso para um venv autossuficiente.
gpu = ["faster-whisper>=1.0", "torch"]

[tool.uv]
# O cache do uv fica em ext4 e o projeto em /mnt/d (drvfs): hardlink não
# funciona entre os dois filesystems.
link-mode = "copy"

[tool.hatch.build.targets.wheel]
packages = ["py/ensinantes"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100
```

- [ ] **Step 2: Escrever `py/ensinantes/config.py`**

```python
"""Espelho Python do .env. Toda variável nova entra aqui E em src/config.ts."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]


def _ler_env() -> None:
    """Lê o .env na mão — o Bun faz isso sozinho, o Python não."""
    arq = BASE_DIR / ".env"
    if not arq.exists():
        return
    for linha in arq.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip())


_ler_env()

ACERVO = Path(os.environ.get("ED_ACERVO", "./acervo"))
if not ACERVO.is_absolute():
    ACERVO = (BASE_DIR / ACERVO).resolve()

DB_PATH = BASE_DIR / "ensinantes.db"
RELATORIOS = BASE_DIR / "relatorios"

WHISPER_MODELO = os.environ.get("ED_WHISPER_MODELO", "large-v3")
WHISPER_COMPUTE = os.environ.get("ED_WHISPER_COMPUTE", "float16")
WHISPER_BATCH = int(os.environ.get("ED_WHISPER_BATCH", "16"))
WHISPER_IDIOMA = "pt"
WHISPER_BEAM = 5

PASTA_ANTIGAS = "_transcricoes.antigas"

LIMIAR_PALAVRAS = float(os.environ.get("ED_DIVERGENCIA_PALAVRAS", "0.85"))
LIMIAR_SIMILARIDADE = float(os.environ.get("ED_DIVERGENCIA_SIMILARIDADE", "0.75"))

#: Os quatro sidecars que uma transcrição produz ou substitui.
SUFIXOS = (".srt", ".txt", ".sub", "-Fala.Cronometrada.txt")
```

- [ ] **Step 3: Escrever o teste que falha**

`py/tests/test_transcriber.py`:

```python
from pathlib import Path

import pytest

from ensinantes import config
from ensinantes.transcriber import escrever_saidas, guardar_antigas, hms


class Trecho:
    def __init__(self, start, end, text):
        self.start, self.end, self.text = start, end, text


def test_hms_formata_srt_e_cronometrada():
    assert hms(3661.5) == "01:01:01,500"
    assert hms(3661.5, virgula=False) == "01:01:01.500"
    assert hms(0) == "00:00:00,000"
    assert hms(-5) == "00:00:00,000"


def test_escrever_saidas_produz_os_tres_formatos(tmp_path: Path):
    base = tmp_path / "Aula"
    escrever_saidas([Trecho(0.0, 2.0, " oi "), Trecho(2.0, 4.0, "tudo bem")], base)

    srt = (tmp_path / "Aula.srt").read_text(encoding="utf-8")
    assert "1\n00:00:00,000 --> 00:00:02,000\noi" in srt
    assert "2\n00:00:02,000 --> 00:00:04,000\ntudo bem" in srt

    cron = (tmp_path / "Aula-Fala.Cronometrada.txt").read_text(encoding="utf-8")
    assert cron.startswith("[00:00:00.000] oi")

    assert (tmp_path / "Aula.txt").read_text(encoding="utf-8") == "oi tudo bem"


def test_guardar_antigas_move_os_quatro_sidecars(tmp_path: Path):
    video = tmp_path / "Aula.mp4"
    video.write_text("v")
    for nome in ("Aula.srt", "Aula.txt", "Aula.sub", "Aula-Fala.Cronometrada.txt"):
        (tmp_path / nome).write_text("velho")

    movidos = guardar_antigas(video)

    guardadas = tmp_path / config.PASTA_ANTIGAS
    assert len(movidos) == 4
    assert sorted(p.name for p in guardadas.iterdir()) == [
        "Aula-Fala.Cronometrada.txt", "Aula.srt", "Aula.sub", "Aula.txt"]
    assert not (tmp_path / "Aula.srt").exists()
    assert video.exists(), "o vídeo NÃO pode ser movido"


def test_guardar_antigas_nao_reclama_quando_nao_ha_nada(tmp_path: Path):
    video = tmp_path / "Sozinha.mp4"
    video.write_text("v")
    assert guardar_antigas(video) == []


def test_guardar_antigas_nao_sobrescreve_backup_anterior(tmp_path: Path):
    video = tmp_path / "Aula.mp4"
    video.write_text("v")
    guardadas = tmp_path / config.PASTA_ANTIGAS
    guardadas.mkdir()
    (guardadas / "Aula.srt").write_text("primeira geração")
    (tmp_path / "Aula.srt").write_text("segunda geração")

    guardar_antigas(video)

    # A primeira geração é a referência original — ela não pode ser perdida.
    assert (guardadas / "Aula.srt").read_text(encoding="utf-8") == "primeira geração"
    assert any(p.name.startswith("Aula.srt.") for p in guardadas.iterdir())
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `uv run pytest py/tests/test_transcriber.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ensinantes.transcriber'`

- [ ] **Step 5: Escrever `py/ensinantes/transcriber.py`**

```python
"""Transcrição por GPU.

Diferente do focus-scrap, aqui o Whisper é o caminho PADRÃO, não o fallback:
não há legenda de produtor para aproveitar. Dos 232 vídeos do acervo, 159 nunca
tiveram transcrição nenhuma, e os 73 que têm vieram de gerações diferentes ao
longo de dois anos. O objetivo é uma passada uniforme com large-v3.

Antes de escrever, a legenda vigente vai para `_transcricoes.antigas/`. A pasta
é nova de propósito: `_antigo/` já existe no acervo e guarda uma AULA aposentada
inteira, não legendas — misturar as duas coisas perderia as duas.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from . import config, db


def _carregar_modelo():
    """Importado em tempo de uso: sem o extra `gpu` isto falha, e falhar aqui é
    melhor do que impedir o resto do worker de rodar."""
    from faster_whisper import BatchedInferencePipeline, WhisperModel

    modelo = WhisperModel(
        config.WHISPER_MODELO, device="cuda", compute_type=config.WHISPER_COMPUTE)
    return BatchedInferencePipeline(model=modelo)


def hms(segundos: float, virgula: bool = True) -> str:
    h, resto = divmod(max(0.0, segundos), 3600)
    m, s = divmod(resto, 60)
    milis = int(round((s - int(s)) * 1000))
    sep = "," if virgula else "."
    return f"{int(h):02}:{int(m):02}:{int(s):02}{sep}{milis:03}"


def escrever_saidas(trechos: list, destino_base: Path) -> None:
    """Os três formatos que o acervo usa, a partir dos trechos do Whisper."""
    srt, cron, plano = [], [], []
    for i, t in enumerate(trechos, 1):
        texto = t.text.strip()
        srt.append(f"{i}\n{hms(t.start)} --> {hms(t.end)}\n{texto}\n")
        cron.append(f"[{hms(t.start, False)}] {texto}")
        plano.append(texto)

    destino_base.with_suffix(".srt").write_text("\n".join(srt), encoding="utf-8")
    destino_base.with_name(destino_base.stem + "-Fala.Cronometrada.txt").write_text(
        "\n".join(cron), encoding="utf-8")
    destino_base.with_suffix(".txt").write_text(" ".join(plano), encoding="utf-8")


def guardar_antigas(video: Path) -> list[Path]:
    """Move os sidecars existentes para `_transcricoes.antigas/`.

    O vídeo NUNCA é movido. E um backup que já exista não é sobrescrito: a
    primeira geração guardada é a referência original, e é contra ela que a
    comparação faz sentido. Uma segunda passada guarda como `.srt.2`, `.srt.3`.
    """
    pasta = video.parent / config.PASTA_ANTIGAS
    movidos: list[Path] = []

    for sufixo in config.SUFIXOS:
        origem = (video.with_name(video.stem + sufixo) if sufixo.startswith("-")
                  else video.with_suffix(sufixo))
        if not origem.exists():
            continue

        pasta.mkdir(exist_ok=True)
        destino = pasta / origem.name
        if destino.exists():
            n = 2
            while (pasta / f"{origem.name}.{n}").exists():
                n += 1
            destino = pasta / f"{origem.name}.{n}"

        origem.rename(destino)
        movidos.append(destino)

    return movidos


def texto_antigo(video: Path) -> str | None:
    """O `.txt` guardado no backup — insumo da comparação."""
    guardado = video.parent / config.PASTA_ANTIGAS / (video.stem + ".txt")
    return guardado.read_text(encoding="utf-8") if guardado.exists() else None


def processar(conn: sqlite3.Connection, item: sqlite3.Row, pipeline) -> None:
    video = config.ACERVO / item["rel_path"]
    if not video.exists():
        db.marcar(conn, item["id"], "erro", "vídeo não está no disco")
        return

    db.marcar(conn, item["id"], "rodando")
    try:
        guardar_antigas(video)
        antigo = texto_antigo(video)

        trechos, _info = pipeline.transcribe(
            str(video),
            language=config.WHISPER_IDIOMA,
            beam_size=config.WHISPER_BEAM,
            batch_size=config.WHISPER_BATCH,
            vad_filter=True,
        )
        trechos = list(trechos)
        escrever_saidas(trechos, video)

        from .comparar import comparar_e_gravar
        comparar_e_gravar(conn, item, " ".join(t.text.strip() for t in trechos), antigo)

        db.marcar(conn, item["id"], "pronto")
        db.registrar(conn, "info", "transcriber", f"transcreveu {video.name}")
    except Exception as e:  # noqa: BLE001 — o worker não pode morrer por um vídeo
        db.marcar(conn, item["id"], "erro", str(e)[:400])
        db.registrar(conn, "erro", "transcriber", f"{video.name}: {e}")
```

- [ ] **Step 6: Escrever `py/ensinantes/db.py` e `worker.py`**

`db.py`:

```python
"""Acesso ao mesmo SQLite do lado TypeScript. O esquema é criado lá."""
from __future__ import annotations

import sqlite3

from . import config


def conectar() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def marcar(conn: sqlite3.Connection, item_id: int, estado: str, erro: str | None = None) -> None:
    conn.execute(
        """UPDATE itens SET transcricao_estado = ?, transcricao_erro = ?,
                            tentativas = tentativas + ?,
                            transcrito_em = CASE WHEN ? = 'pronto' THEN datetime('now') ELSE transcrito_em END
            WHERE id = ?""",
        (estado, erro, 1 if estado == "erro" else 0, estado, item_id))
    conn.commit()


def registrar(conn: sqlite3.Connection, nivel: str, origem: str, mensagem: str) -> None:
    conn.execute("INSERT INTO eventos (nivel, origem, mensagem) VALUES (?, ?, ?)",
                 (nivel, origem, mensagem))
    conn.commit()


def pendentes(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT id, rel_path, titulo FROM itens
            WHERE tipo = 'video' AND transcricao_estado = 'pendente'
            ORDER BY id"""
    ).fetchall()
```

`worker.py`:

```python
"""O laço da fila. `uv run python -m ensinantes.worker`

O modelo é carregado UMA vez e reusado: são ~10 s de carga e 2,5 GB de VRAM.
Recarregar por vídeo dobraria o tempo total sem ganho nenhum.
"""
from __future__ import annotations

import sys
import time

from . import db
from .transcriber import _carregar_modelo, processar


def main() -> int:
    conn = db.conectar()

    # 'rodando' depois de um reinício é processo morto, não trabalho em curso.
    n = conn.execute(
        "UPDATE itens SET transcricao_estado = 'pendente' WHERE transcricao_estado = 'rodando'").rowcount
    conn.commit()
    if n:
        print(f"destravados {n} itens presos em 'rodando'")

    fila = db.pendentes(conn)
    if not fila:
        print("nada pendente")
        return 0

    print(f"{len(fila)} vídeos na fila — carregando o modelo…")
    try:
        pipeline = _carregar_modelo()
    except ImportError as e:
        print(f"faster-whisper indisponível: {e}", file=sys.stderr)
        print("instale com: uv sync --extra gpu", file=sys.stderr)
        return 1

    inicio = time.monotonic()
    for i, item in enumerate(fila, 1):
        print(f"[{i}/{len(fila)}] {item['titulo']}", flush=True)
        processar(conn, item, pipeline)

    print(f"fim: {len(fila)} vídeos em {(time.monotonic() - inicio) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`py/ensinantes/__init__.py` fica vazio.

- [ ] **Step 7: Rodar os testes**

```bash
uv sync
uv run pytest py/tests/ -v
```

Expected: PASS — 5 testes

Note que os testes **não carregam o Whisper**: `guardar_antigas`, `hms` e
`escrever_saidas` são puras sobre arquivo. Isso é de propósito — teste que
precisa de 2,5 GB de VRAM não é teste que se roda.

- [ ] **Step 8: Transcrever UM vídeo antes de soltar a fila inteira**

```bash
bun -e 'import{conectar}from"./src/db.ts";
const db=conectar();
db.run("UPDATE itens SET transcricao_estado=(CASE WHEN id=(SELECT MIN(id) FROM itens WHERE tipo=\"video\" AND srt_path IS NULL) THEN \"pendente\" ELSE transcricao_estado END)");
console.log(db.query("SELECT id,titulo FROM itens WHERE transcricao_estado=\"pendente\"").all())'

uv run python -m ensinantes.worker
```

Confira a saída no disco:

```bash
ls -la "acervo/1-Ensinantes/09-Desenvolvimento das Ferramentas Próprias/"
```

Expected: três arquivos novos (`.srt`, `.txt`, `-Fala.Cronometrada.txt`) junto
do `.mp4`. Abra o `.srt` e **leia trinta segundos dele** — a única verificação
que vale para transcrição é ler.

- [ ] **Step 9: Commit**

```bash
git add pyproject.toml py/
git commit -m "worker: transcrição large-v3 com backup em _transcricoes.antigas"
```

---

### Task 15: Comparação e relatório de divergências

O mecanismo do requisito "garantir que a transcrição esteja correta e completa".
Nenhuma transcrição é aceita em silêncio: cada uma é medida contra a anterior, e
o que destoa vai para conferência humana.

**Files:**
- Create: `py/ensinantes/comparar.py`
- Create: `py/tests/test_comparar.py`

**Interfaces:**
- Consumes: `config.py` (limiares), `db.py`
- Produces:
  - `normalizar(texto: str) -> list[str]`
  - `similaridade(a: str, b: str) -> float`
  - `avaliar(nova: str, antiga: str | None) -> dict | None`
  - `divergente(comp: dict) -> bool`
  - `comparar_e_gravar(conn, item, nova: str, antiga: str | None) -> None`
  - `relatorio_divergencias(conn) -> str`

- [ ] **Step 1: Escrever o teste que falha**

`py/tests/test_comparar.py`:

```python
from ensinantes.comparar import avaliar, divergente, normalizar, similaridade


def test_normalizar_tira_pontuacao_e_caixa():
    assert normalizar("Olá, mundo! Tudo BEM?") == ["olá", "mundo", "tudo", "bem"]


def test_normalizar_colapsa_espaco_e_quebra_de_linha():
    assert normalizar("um\n\n dois \t três") == ["um", "dois", "três"]


def test_similaridade_de_texto_identico_e_um():
    assert similaridade("a b c d", "a b c d") == 1.0


def test_similaridade_ignora_pontuacao():
    assert similaridade("Bom dia, turma.", "bom dia turma") == 1.0


def test_similaridade_de_textos_diferentes_e_baixa():
    assert similaridade("gato cachorro pássaro", "avião navio trem") < 0.3


def test_avaliar_sem_texto_antigo_devolve_none():
    # 159 dos 232 vídeos nunca tiveram legenda: não há com o que comparar.
    assert avaliar("qualquer coisa", None) is None
    assert avaliar("qualquer coisa", "   ") is None


def test_avaliar_conta_palavras_dos_dois_lados():
    c = avaliar("um dois três quatro", "um dois três")
    assert c["palavras_nova"] == 4
    assert c["palavras_antiga"] == 3
    assert 0.0 <= c["similaridade"] <= 1.0


def test_divergente_quando_a_nova_encolheu_demais():
    # 80 palavras contra 100 = 0,80, abaixo do limiar de 0,85.
    c = {"palavras_nova": 80, "palavras_antiga": 100, "similaridade": 0.99}
    assert divergente(c) is True


def test_nao_divergente_quando_encolheu_pouco():
    c = {"palavras_nova": 95, "palavras_antiga": 100, "similaridade": 0.99}
    assert divergente(c) is False


def test_divergente_quando_a_similaridade_cai():
    c = {"palavras_nova": 100, "palavras_antiga": 100, "similaridade": 0.60}
    assert divergente(c) is True


def test_transcricao_que_CRESCEU_nao_e_divergente_por_tamanho():
    # A nova pegar mais fala que a antiga é o resultado desejado, não um defeito.
    c = {"palavras_nova": 300, "palavras_antiga": 100, "similaridade": 0.80}
    assert divergente(c) is True   # ainda divergente pela similaridade
    c2 = {"palavras_nova": 300, "palavras_antiga": 100, "similaridade": 0.95}
    assert divergente(c2) is False


def test_avaliar_detecta_o_caso_que_mais_importa():
    """O modo de falha real: o Whisper corta no meio e devolve um pedaço."""
    antiga = " ".join(f"palavra{i}" for i in range(1000))
    nova = " ".join(f"palavra{i}" for i in range(200))
    c = avaliar(nova, antiga)
    assert divergente(c) is True
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `uv run pytest py/tests/test_comparar.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ensinantes.comparar'`

- [ ] **Step 3: Escrever `py/ensinantes/comparar.py`**

```python
"""A transcrição nova, medida contra a que existia.

Existe porque "reprocessar para garantir que esteja correto e completo" só
significa alguma coisa se houver medida. O modo de falha real do Whisper não é
errar palavra — é PARAR no meio e devolver um pedaço convincente. Uma
transcrição truncada parece perfeita: as frases que sobraram estão certas.

Por isso a checagem principal é de TAMANHO, e não de conteúdo.
"""
from __future__ import annotations

import json
import re
import sqlite3
from difflib import SequenceMatcher

from . import config

_NAO_PALAVRA = re.compile(r"[^\w\s]", re.UNICODE)


def normalizar(texto: str) -> list[str]:
    """Minúsculas, sem pontuação, espaço colapsado."""
    return _NAO_PALAVRA.sub(" ", texto.lower()).split()


def similaridade(a: str, b: str) -> float:
    """0 a 1 sobre a sequência de palavras normalizadas."""
    pa, pb = normalizar(a), normalizar(b)
    if not pa and not pb:
        return 1.0
    if not pa or not pb:
        return 0.0
    return SequenceMatcher(None, pa, pb, autojunk=False).ratio()


def avaliar(nova: str, antiga: str | None) -> dict | None:
    """None quando não há transcrição anterior — 159 vídeos estão nesse caso."""
    if not antiga or not antiga.strip():
        return None
    return {
        "palavras_nova": len(normalizar(nova)),
        "palavras_antiga": len(normalizar(antiga)),
        "similaridade": round(similaridade(nova, antiga), 4),
    }


def divergente(comp: dict) -> bool:
    """Encolheu demais, ou mudou demais.

    Crescer NÃO é motivo de alarme por si: a passada nova com large-v3 pegando
    mais fala que uma transcrição velha é exatamente o resultado desejado. Só
    a similaridade baixa denuncia que o conteúdo mudou de verdade.
    """
    antiga = comp["palavras_antiga"]
    encolheu = antiga > 0 and comp["palavras_nova"] < antiga * config.LIMIAR_PALAVRAS
    mudou = comp["similaridade"] < config.LIMIAR_SIMILARIDADE
    return bool(encolheu or mudou)


def comparar_e_gravar(conn: sqlite3.Connection, item: sqlite3.Row,
                      nova: str, antiga: str | None) -> None:
    comp = avaliar(nova, antiga)
    conn.execute("UPDATE itens SET comparacao = ? WHERE id = ?",
                 (json.dumps(comp, ensure_ascii=False) if comp else None, item["id"]))
    conn.commit()

    if comp and divergente(comp):
        conn.execute(
            "INSERT INTO eventos (nivel, origem, mensagem) VALUES ('erro', 'comparar', ?)",
            (f"{item['titulo']}: {comp['palavras_nova']} palavras contra "
             f"{comp['palavras_antiga']}, similaridade {comp['similaridade']}",))
        conn.commit()


def relatorio_divergencias(conn: sqlite3.Connection) -> str:
    linhas = conn.execute(
        "SELECT titulo, rel_path, comparacao FROM itens WHERE comparacao IS NOT NULL"
    ).fetchall()

    suspeitas = []
    for linha in linhas:
        comp = json.loads(linha["comparacao"])
        if divergente(comp):
            suspeitas.append((linha, comp))

    suspeitas.sort(key=lambda x: x[1]["similaridade"])

    corpo = "\n".join(
        f"| {l['titulo']} | {c['palavras_nova']} | {c['palavras_antiga']} | "
        f"{c['similaridade']:.2f} | `{l['rel_path']}` |"
        for l, c in suspeitas)

    return f"""# Transcrições divergentes

Comparação da transcrição nova contra a guardada em `{config.PASTA_ANTIGAS}/`.
Uma linha aqui **não** significa que a nova está errada — significa que vale
abrir as duas e olhar.

Critério: menos de {config.LIMIAR_PALAVRAS:.0%} das palavras da anterior, **ou**
similaridade abaixo de {config.LIMIAR_SIMILARIDADE:.2f}.

- {len(linhas)} vídeos comparados
- **{len(suspeitas)} divergentes**

| Aula | Palavras (nova) | Palavras (antiga) | Similaridade | Arquivo |
|---|---:|---:|---:|---|
{corpo}
"""
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest py/tests/ -v`
Expected: PASS — 17 testes

- [ ] **Step 5: Soltar a fila inteira**

Este é o passo longo. **Não fique olhando.**

```bash
bun -e 'import{conectar}from"./src/db.ts";
const db=conectar();
// Retranscreve TUDO — a decisão da spec: passada uniforme com large-v3.
console.log("enfileirados:", db.run("UPDATE itens SET transcricao_estado=\"pendente\" WHERE tipo=\"video\"").changes);'

nohup uv run python -m ensinantes.worker > relatorios/transcricao.log 2>&1 &
```

Acompanhe:

```bash
tail -f relatorios/transcricao.log
watch -n 60 'bun -e "import{conectar}from\"./src/db.ts\";
console.table(conectar().query(\"SELECT transcricao_estado, COUNT(*) n FROM itens WHERE tipo=\\\"video\\\" GROUP BY 1\").all())"'
```

Expected: 42,1 horas de vídeo em **1,5 a 3 horas** na RTX 4080 SUPER. Se o
`nvidia-smi` mostrar a GPU ociosa, o `faster-whisper` caiu para CPU — pare e
confira `python -c "import torch; print(torch.cuda.is_available())"`.

- [ ] **Step 6: Gerar e LER o relatório de divergências**

```bash
uv run python -c "
from ensinantes import db, comparar, config
config.RELATORIOS.mkdir(exist_ok=True)
(config.RELATORIOS / 'divergencias.md').write_text(
    comparar.relatorio_divergencias(db.conectar()), encoding='utf-8')
print('escrito')"

cat relatorios/divergencias.md
```

**Leia o relatório e abra três das divergências**, comparando o `.srt` novo com
o de `_transcricoes.antigas/`. É aqui que se descobre se os limiares de 0,85 e
0,75 fazem sentido para este acervo — foram chute informado, e este é o momento
previsto de ajustá-los em `.env`.

- [ ] **Step 7: Commit**

```bash
git add py/ensinantes/comparar.py py/tests/test_comparar.py
git commit -m "comparar: mede a transcrição nova contra a antiga e relata divergências"
```

---

### Task 16: Painel — os cards que só o chico vê

**Files:**
- Create: `src/ui/admin.ts`
- Modify: `src/ui/home.ts`, `src/ui/tema.ts`, `src/ui/pagina.ts`, `src/painel.ts`
- Test: `tests/painel.test.ts` (acrescenta)

**Interfaces:**
- Consumes: `/api/tudo` (campos `disco`, `fila`, `eventos`, `tarefas`, `divergencias`)
- Produces: `ADMIN_JS: string`, `CSS_ADMIN: string`

- [ ] **Step 1: Acrescentar `divergencias` a `/api/tudo` em `src/painel.ts`**

Dentro do `if (pode.verFila)`:

```ts
      corpo.divergencias = db.query(`
        SELECT id, titulo, comparacao FROM itens
         WHERE comparacao IS NOT NULL ORDER BY id`).all()
        .map((l: any) => ({ ...l, comparacao: JSON.parse(l.comparacao) }))
        // O critério é o mesmo do lado Python. Duplicado de propósito: são dois
        // processos, e um import cruzado entre eles custaria mais do que ganha.
        .filter((l: any) =>
          l.comparacao.palavras_nova < l.comparacao.palavras_antiga * LIMIAR_PALAVRAS ||
          l.comparacao.similaridade < LIMIAR_SIMILARIDADE);
      corpo.recortes = db.query(
        "SELECT COUNT(*) pastas, SUM(arquivos) arquivos, SUM(bytes) bytes FROM recortes").get();
```

Importe `LIMIAR_PALAVRAS` e `LIMIAR_SIMILARIDADE` de `./config.ts`.

- [ ] **Step 2: Acrescentar o teste de vazamento**

Em `tests/painel.test.ts`:

```ts
test("nenhum campo administrativo vaza para o procópio", async () => {
  const proc = await (await pedir("/api/tudo?curso=c1", "procopio")).json();
  for (const campo of ["disco", "fila", "eventos", "tarefas", "divergencias", "recortes"]) {
    expect([campo, proc[campo]]).toEqual([campo, undefined]);
  }
});

test("o texto da resposta ao procópio não contém caminho de disco", async () => {
  const bruto = await (await pedir("/api/tudo?curso=c1", "procopio")).text();
  expect(bruto).not.toContain("/mnt/");
  expect(bruto).not.toContain(".mp4");
});
```

O segundo teste é o que pega o vazamento por descuido: um campo novo com
caminho dentro passa despercebido pela lista de nomes, mas não pelo texto.

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test tests/painel.test.ts`
Expected: FAIL no teste de `divergencias` (o campo ainda não existe para o chico)

- [ ] **Step 4: Escrever `src/ui/admin.ts`**

```ts
/**
 * Os cards de dono: disco, fila, divergências, recortes e botões de tarefa.
 *
 * Todo este arquivo só é chamado quando `permissoes.verDisco` é verdadeiro. E
 * mesmo assim ele não é a proteção: o servidor já não mandou os dados. Isto
 * aqui é apresentação, não controle de acesso.
 */
export const ADMIN_JS = `
const gb = b => !b ? '—' : (b / 1073741824).toFixed(2).replace('.', ',') + ' GB';
const milhar = n => (n ?? 0).toLocaleString('pt-BR');

function cardsDeDono(d) {
  if (!d.permissoes.verDisco) return '';

  const fila = Object.fromEntries((d.fila || []).map(f => [f.estado, f.n]));
  const div = d.divergencias || [];

  return \`<section class="dono">
    <h3>Acervo</h3>
    <div class="cartoes">
      <div class="cartao"><h2 class="num">\${gb(d.disco?.bytes)}</h2>
        <div class="meta num">\${milhar(d.disco?.itens)} itens ·
          \${((d.disco?.segundos || 0) / 3600).toFixed(1).replace('.', ',')} h de vídeo</div></div>

      <div class="cartao"><h2 class="num">\${gb(d.recortes?.bytes)}</h2>
        <div class="meta num">\${milhar(d.recortes?.arquivos)} recortes em
          \${milhar(d.recortes?.pastas)} pastas</div>
        <div class="meta">gere o script com "Refazer relatório"</div></div>

      <div class="cartao"><h2 class="num">\${milhar(fila.pronto || 0)} / \${milhar(
          (fila.pronto || 0) + (fila.pendente || 0) + (fila.rodando || 0) + (fila.erro || 0))}</h2>
        <div class="meta">transcritos\${fila.erro ? ' · ' + fila.erro + ' com erro' : ''}</div></div>

      <a class="cartao \${div.length ? 'alerta' : ''}" href="#divergencias">
        <h2 class="num">\${div.length}</h2>
        <div class="meta">transcrições divergentes</div>
        <div class="meta">\${div.length ? 'vale abrir e comparar' : 'nada destoando'}</div></a>
    </div>

    <h3>Tarefas</h3>
    <div class="ferramentas">
      \${(d.tarefas || []).map(t =>
        \`<button data-tarefa="\${t.nome}" title="\${esc(t.dica)}" \${t.rodando ? 'disabled' : ''}>
          \${t.rodando ? '⋯ ' : ''}\${esc(t.rotulo)}</button>\`).join('')}
    </div>

    \${div.length ? \`<h3 id="divergencias">Divergentes</h3>
      <table class="divs"><thead><tr><th>Aula</th><th>nova</th><th>antiga</th><th>sim.</th></tr></thead>
      <tbody>\${div.map(x => \`<tr><td>\${esc(x.titulo)}</td>
        <td class="num">\${x.comparacao.palavras_nova}</td>
        <td class="num">\${x.comparacao.palavras_antiga}</td>
        <td class="num">\${x.comparacao.similaridade.toFixed(2)}</td></tr>\`).join('')}
      </tbody></table>\` : ''}
  </section>\`;
}

function ligarBotoesDeTarefa() {
  document.querySelectorAll('[data-tarefa]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const r = await (await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: b.dataset.tarefa }),
    })).json();
    b.textContent = r.msg;
    setTimeout(pintarHome, 3000);
  });
}
`;
```

E o CSS em `tema.ts` — **lembrando de ligá-lo em `pagina.ts`**, que passa a
ter `<style>${CSS}${CSS_CURSO}${CSS_TRANSCRICAO}${CSS_ADMIN}</style>` e
`${ADMIN_JS}` no bloco de scripts, antes de `${CURSO_JS}`:

```ts
export const CSS_ADMIN = `
.dono { margin-top: 44px; }
.dono h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
           color: var(--secundario); font-weight: 600; margin: 26px 0 12px; }
.dono .cartao h2 { font-size: 22px; }
.dono .cartao.alerta { border-color: var(--ambar); }
.dono .ferramentas { display: flex; gap: 10px; flex-wrap: wrap; }

table.divs { width: 100%; border-collapse: collapse; font-size: 14px; }
table.divs th { text-align: left; color: var(--secundario); font-weight: 600;
                font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
                padding: 8px 10px; border-bottom: 1px solid var(--borda); }
table.divs td { padding: 8px 10px; border-bottom: 1px solid var(--borda); }
table.divs td.num, table.divs th:not(:first-child) { text-align: right; }
`;
```

- [ ] **Step 5: Chamar em `home.ts`**

Em `pintarHome`, dentro do `<main>`, depois do bloco `retomar`:

```js
      ${cardsDeDono(d)}
```

E logo depois de atribuir o `innerHTML`:

```js
  ligarBotoesDeTarefa();
```

- [ ] **Step 6: Rodar tudo**

Run: `bun test && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Conferir com os dois olhos**

```bash
bun run painel
```

Como chico (`http://127.0.0.1:17789`): os quatro cards de dono aparecem embaixo,
com GB, contagem de recortes, fila e divergências.

Como procópio — simule o header do nginx:

```bash
curl -s -H 'X-Painel-Usuario: procopio' http://127.0.0.1:17789/api/tudo | head -c 600
curl -s -H 'X-Painel-Usuario: procopio' -X POST http://127.0.0.1:17789/api/run \
     -H 'Content-Type: application/json' -d '{"nome":"scan"}' -w '\n%{http_code}\n'
```

Expected: a primeira resposta não traz `disco`, `fila` nem `/mnt/`; a segunda
devolve **403**.

- [ ] **Step 8: Commit**

```bash
git add src/ui/ src/painel.ts tests/painel.test.ts
git commit -m "painel: cards de dono com disco, fila, recortes e divergências"
```

---

### Task 17: Acesso remoto com dois usuários

**Files:**
- Create: `infra/remote/` (cópia adaptada do focus-scrap)
- Modify: `infra/remote/config.sh`, `3-droplet-nginx.sh`, `ensinantes-nginx.conf`

**Interfaces:**
- Consumes: painel na porta 17789
- Produces: `https://ensinantesdigitais.chicofigueiredo.com.br` com dois logins

- [ ] **Step 1: Copiar e renomear**

```bash
mkdir -p infra
cp -r /mnt/d/Chico/focus-scrap/infra/remote infra/remote
cd infra/remote
mv focus-nginx.conf ensinantes-nginx.conf
mv focus-painel.service ensinantes-painel.service
grep -rl 'focus' . | xargs sed -i 's/focus_tunel/ensinantes_tunel/g; s/focus-tunel/ensinantes-tunel/g; s/focus\.htpasswd/ensinantes.htpasswd/g; s/focus-painel/ensinantes-painel/g'
cd ../..
```

- [ ] **Step 2: Reescrever `infra/remote/config.sh`**

```bash
#!/bin/bash
# Um lugar só para as decisões. Trocar de domínio ou de servidor é mexer aqui,
# e em nada mais.

DOMINIO=ensinantesdigitais.chicofigueiredo.com.br

# Acesso administrativo ao droplet — usado só na instalação (passos 2 e 3).
DROPLET=root@ssh.lojapopcorn.com.br

# Para onde o túnel disca no dia a dia. Mesmo servidor, usuário sem shell.
TUNEL_HOST=ssh.lojapopcorn.com.br
TUNEL_USER=tunel-ensinantes

# A PORTA. Vale dos dois lados do túnel e TEM de bater com ED_PAINEL_PORTA
# do .env.
#
# É 17789, e não 17788, porque o túnel do focus-scrap já usa a 17788 nesta
# máquina e neste droplet. Repetir derruba um dos dois de forma intermitente:
# o sintoma é 502 esporádico, que parece PC suspenso e não é.
PORTA=17789

# Dois usuários, duas senhas. O passo 3 imprime cada uma UMA vez.
USUARIOS_PAINEL=(chico procopio)
EMAIL_CERT=fran.fig@gmail.com

CHAVE="$HOME/.ssh/ensinantes_tunel"

# Rotas que rodam processo na máquina de casa. Do tablet se assiste e se marca
# aula como vista; não se dispara processo daqui.
#
# /api/sync NÃO está aqui, e não pode entrar: é por ela que o tablet grava o
# que foi marcado e anotado. Bloqueá-la não deixa o painel somente-leitura,
# deixa quebrado, com a fila de escrita enchendo para sempre.
ROTAS_BLOQUEADAS='run|requeue|revelar|abrir|limpeza'
```

- [ ] **Step 3: Ajustar `3-droplet-nginx.sh` para dois usuários**

Troque o bloco que cria o htpasswd por:

```bash
# Duas entradas: a primeira cria o arquivo (-c), as seguintes acrescentam.
primeiro=1
for usuario in "${USUARIOS_PAINEL[@]}"; do
  senha="$(openssl rand -base64 15)"
  if [[ $primeiro == 1 ]]; then
    ssh "$DROPLET" "htpasswd -bcB /etc/nginx/ensinantes.htpasswd '$usuario' '$senha'"
    primeiro=0
  else
    ssh "$DROPLET" "htpasswd -bB /etc/nginx/ensinantes.htpasswd '$usuario' '$senha'"
  fi
  echo "  $usuario : $senha"
done
echo
echo "Anote agora — daqui em diante só existe o bcrypt no droplet."
```

- [ ] **Step 4: Acrescentar o repasse do usuário em `ensinantes-nginx.conf`**

Dentro do `location /`, junto do `proxy_pass`:

```nginx
    auth_basic           "Ensinantes Digitais";
    auth_basic_user_file /etc/nginx/ensinantes.htpasswd;

    # É ISTO que o painel lê para saber quem está do outro lado. Sem esta
    # linha, todo acesso remoto chega como 'chico' — e o Procópio passa a ver
    # os cards de disco, a fila e os caminhos do sistema de arquivos.
    proxy_set_header X-Painel-Usuario $remote_user;

    proxy_pass http://127.0.0.1:17789;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Vídeo sai do disco de casa em tempo real: buffering aqui só atrasa o
    # primeiro frame, e Range precisa passar inteiro.
    proxy_buffering off;
    proxy_read_timeout 3600s;
```

E, logo antes desse bloco, a recusa das rotas administrativas:

```nginx
    location ~ ^/api/(run|requeue|revelar|abrir|limpeza)$ { return 403; }
```

**Um cabeçalho que o cliente mande é substituído pelo `proxy_set_header`** — o
nginx sobrescreve, não acrescenta. Confira isso no passo 6; é a diferença entre
o controle valer e ser decorativo.

- [ ] **Step 5: Rodar a instalação**

```bash
cd infra/remote
./1-chave-local.sh
./2-droplet-usuario.sh
./3-droplet-nginx.sh    # imprime as duas senhas — anote
./4-servico-local.sh
./verificar.sh
```

Antes do passo 3, o DNS já tem de resolver: o Let's Encrypt confirma o domínio
batendo na porta 80.

```bash
dig +short ensinantesdigitais.chicofigueiredo.com.br
```

- [ ] **Step 6: Conferir a corrente inteira, de fora**

```bash
# 401 sem senha
curl -s -o /dev/null -w '%{http_code}\n' https://ensinantesdigitais.chicofigueiredo.com.br/

# 200 com senha, e o painel reconhece quem entrou
curl -s -u procopio:SENHA https://ensinantesdigitais.chicofigueiredo.com.br/api/eu

# 403 na rota administrativa
curl -s -o /dev/null -w '%{http_code}\n' -u chico:SENHA -X POST \
  https://ensinantesdigitais.chicofigueiredo.com.br/api/run

# O TESTE QUE IMPORTA: o header forjado pelo cliente é ignorado
curl -s -u procopio:SENHA -H 'X-Painel-Usuario: chico' \
  https://ensinantesdigitais.chicofigueiredo.com.br/api/eu
```

Expected na última: `"usuario":"procopio"`. Se vier `chico`, o
`proxy_set_header` não está sobrescrevendo e o controle de acesso remoto é
decorativo — pare e conserte antes de passar a senha ao Procópio.

- [ ] **Step 7: Commit**

```bash
git add infra/
git commit -m "infra: túnel na 17789 com dois usuários e repasse de identidade"
```

---

### Task 18: CLI, README e verificação fim a fim

**Files:**
- Create: `src/cli.ts`, `README.md`
- Test: manual, guiado

- [ ] **Step 1: Escrever `src/cli.ts`**

```ts
/**
 * `bun run <comando>`. Um despacho fino: a lógica mora nos módulos.
 */
import { PAINEL_PORTA } from "./config.ts";
import { conectar, destravar } from "./db.ts";
import { escanearTudo } from "./scan.ts";
import { gerar } from "./recortes.ts";
import { servir } from "./painel.ts";

const comando = process.argv[2];
const db = conectar();

switch (comando) {
  case "scan": {
    const r = escanearTudo(db);
    console.log(`${r.cursos} cursos · ${r.itens} itens · ${r.recortes} pastas de recorte`);
    break;
  }

  case "painel":
    destravar(db);
    servir(db, PAINEL_PORTA);
    break;

  case "transcrever": {
    const n = db.run(
      "UPDATE itens SET transcricao_estado = 'pendente' WHERE tipo = 'video'").changes;
    console.log(`${n} vídeos na fila. Agora rode:  bun run worker`);
    break;
  }

  case "requeue": {
    const n = db.run(
      "UPDATE itens SET transcricao_estado = 'pendente', transcricao_erro = NULL WHERE transcricao_estado = 'erro'").changes;
    console.log(`${n} reenfileirados`);
    break;
  }

  case "recortes": {
    const r = gerar(db);
    console.log(`${r.total} pastas · ${(r.bytes / 1073741824).toFixed(2)} GB`);
    console.log(`  ${r.relatorio}\n  ${r.script}  (não executado)`);
    break;
  }

  case "status":
    console.table(db.query(`
      SELECT c.titulo, c.estado, COUNT(DISTINCT m.id) modulos, COUNT(i.id) itens
        FROM cursos c LEFT JOIN modulos m ON m.curso_id = c.id
                      LEFT JOIN itens i ON i.modulo_id = m.id
       GROUP BY c.id ORDER BY c.posicao`).all());
    console.table(db.query(
      "SELECT transcricao_estado estado, COUNT(*) n FROM itens WHERE tipo='video' GROUP BY 1").all());
    break;

  default:
    console.log(`comandos:
  scan         relê o acervo e refaz o catálogo
  painel       sobe o painel na porta ${PAINEL_PORTA}
  transcrever  enfileira todos os vídeos (depois: bun run worker)
  requeue      devolve à fila o que deu erro
  recortes     gera relatório e script de limpeza (não apaga nada)
  status       resumo do catálogo e da fila`);
    process.exit(comando ? 1 : 0);
}
```

- [ ] **Step 2: Rodar cada comando**

```bash
bun run src/cli.ts            # ajuda, sai com 0
bun run src/cli.ts inexistente; echo "saída: $?"   # ajuda, sai com 1
bun run status
bun run scan
bun run recortes
```

- [ ] **Step 3: Escrever o `README.md`**

Cubra, nesta ordem: o que é e o que não é (não raspa nada, o disco é a fonte);
como rodar (`bun run setup`, `bun run scan`, `bun run painel`); os dois usuários
e de onde vem a identidade; a fila de transcrição e quanto demora (42,1 h de
vídeo, 1,5–3 h de GPU); os 127 GB de recortes e por que o script não roda
sozinho; a porta 17789 e o pareamento com o `infra/remote/config.sh`; e a
tabela de diagnóstico:

| Sintoma | Quase sempre é |
|---|---|
| 502 de fora | PC suspenso, painel parado, ou painel que pulou de porta |
| 401 que não passa | senha errada — `htpasswd -B /etc/nginx/ensinantes.htpasswd <usuario>` |
| Procópio vendo card de disco | `proxy_set_header X-Painel-Usuario` faltando no nginx |
| Vídeo não deixa arrastar | `Range` não está chegando — `proxy_buffering off` no nginx |
| Legenda não aparece | o `<track>` não lê SRT; confira se `/api/legenda` devolve VTT |
| Scan demorando minutos | o prune não está pegando — veja `ehRecorte` |
| Transcrição lenta demais | caiu para CPU — `python -c "import torch;print(torch.cuda.is_available())"` |

- [ ] **Step 4: Verificação fim a fim**

Do zero, como se fosse outra máquina:

```bash
rm -f ensinantes.db*
bun run setup
bun run scan
bun test
bun run typecheck
uv run pytest py/tests/ -v
bun run recortes
bun run painel
```

Confira, um a um:

1. `bun test` e `pytest` passam inteiros.
2. A home mostra quatro cartões, `2-Acelerador` esmaecido como "não baixado".
3. Entrar num curso, tocar um vídeo, **arrastar a linha do tempo**.
4. Clicar num trecho da transcrição pula o vídeo.
5. Marcar visto, recarregar: continua marcado.
6. `curl -H 'X-Painel-Usuario: procopio' …/api/tudo` não traz `disco` nem `/mnt/`.
7. `curl -X POST -H 'X-Painel-Usuario: procopio' …/api/run` devolve 403.
8. `bash scripts/apagar-recortes.sh` recusa e sai com 1.
9. De fora, pelo domínio, com a senha do Procópio: vê o conteúdo, não vê os cards.

- [ ] **Step 5: Commit final**

```bash
git add src/cli.ts README.md
git commit -m "cli e README: comandos, diagnóstico e verificação fim a fim"
```

---

### Task 19: Materiais — markdown renderizado

A spec põe `Repo/` como quarta seção da home, com os nove `.md` **renderizados**.
Servi-los como texto puro entrega um `Mapa.Completo.md` de 51 KB em fonte
monoespaçada com `##` visível — pior do que não ter.

Sem dependência de runtime (restrição global), o renderizador é nosso. Não
precisa ser completo: precisa dar conta do que **esses nove arquivos** usam.

**Files:**
- Create: `src/markdown.ts`, `src/ui/materiais.ts`
- Modify: `src/painel.ts`, `src/ui/tema.ts`, `src/ui/pagina.ts`, `src/ui/player.ts`
- Test: `tests/markdown.test.ts`

**Interfaces:**
- Consumes: `arquivos.ts` (`dentroDoAcervo`), `db.ts`
- Produces:
  - `paraHtml(md: string): string`
  - `MATERIAIS_JS: string`, `CSS_MARKDOWN: string`
  - Rota `GET /api/markdown?id=<item>` → `{ titulo, html }`

- [ ] **Step 1: Conferir o que os arquivos reais usam**

```bash
grep -ohE '^(#{1,6} |[-*] |[0-9]+\. |\||```|> )' acervo/Repo/*.md | sort | uniq -c | sort -rn
```

Isso diz quais construções precisam existir. Se aparecer algo além de título,
lista, tabela, bloco de código, citação e ênfase, **acrescente um teste com o
trecho real antes de implementar**.

- [ ] **Step 2: Escrever o teste que falha**

`tests/markdown.test.ts`:

```ts
import { expect, test } from "bun:test";
import { paraHtml } from "../src/markdown.ts";

test("títulos de todos os níveis", () => {
  expect(paraHtml("# Um")).toContain("<h1>Um</h1>");
  expect(paraHtml("### Três")).toContain("<h3>Três</h3>");
});

test("ênfase e código em linha", () => {
  expect(paraHtml("**forte** e *fraco* e `cod`"))
    .toContain("<strong>forte</strong> e <em>fraco</em> e <code>cod</code>");
});

test("lista com marcador vira ul", () => {
  const h = paraHtml("- um\n- dois");
  expect(h).toContain("<ul>");
  expect(h).toContain("<li>um</li>");
  expect((h.match(/<li>/g) ?? []).length).toBe(2);
});

test("lista numerada vira ol", () => {
  expect(paraHtml("1. um\n2. dois")).toContain("<ol>");
});

test("tabela com cabeçalho", () => {
  const h = paraHtml("| A | B |\n|---|---:|\n| 1 | 2 |");
  expect(h).toContain("<table>");
  expect(h).toContain("<th>A</th>");
  expect(h).toContain("<td>1</td>");
});

test("bloco de código não interpreta o que está dentro", () => {
  const h = paraHtml("```\n# não é título\n**nem forte**\n```");
  expect(h).toContain("<pre><code>");
  expect(h).not.toContain("<h1>");
  expect(h).not.toContain("<strong>");
});

test("link vira âncora que abre fora", () => {
  expect(paraHtml("[Focus](https://exemplo.com)"))
    .toContain('<a href="https://exemplo.com" target="_blank" rel="noopener">Focus</a>');
});

test("HTML no markdown é escapado", () => {
  const h = paraHtml("texto <script>alert(1)</script> fim");
  expect(h).not.toContain("<script>");
  expect(h).toContain("&lt;script&gt;");
});

test("javascript: em link não vira href", () => {
  expect(paraHtml("[x](javascript:alert(1))")).not.toContain('href="javascript:');
});

test("parágrafos separados por linha em branco", () => {
  const h = paraHtml("um\n\ndois");
  expect((h.match(/<p>/g) ?? []).length).toBe(2);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test tests/markdown.test.ts`
Expected: FAIL — `Cannot find module '../src/markdown.ts'`

- [ ] **Step 4: Escrever `src/markdown.ts`**

```ts
/**
 * Markdown → HTML, o suficiente para os nove arquivos de `Repo/`.
 *
 * Não é um renderizador geral e não deve virar um: a restrição de "sem
 * dependência de runtime" vale, e markdown completo é biblioteca, não função.
 * O escopo é o que esses arquivos usam — título, ênfase, lista, tabela, bloco
 * de código, citação e link.
 *
 * Escapar vem PRIMEIRO, então HTML embutido no arquivo aparece como texto. O
 * conteúdo vem do disco, não de formulário, mas escapar é barato e a
 * alternativa é confiar num arquivo que ninguém releu.
 */

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Só http(s). `javascript:` num href é o buraco clássico. */
const hrefSeguro = (u: string): string | null =>
  /^https?:\/\//i.test(u.trim()) ? escapar(u.trim()) : null;

function emLinha(texto: string): string {
  let t = escapar(texto);
  // Código antes de ênfase: `**` dentro de crase é literal.
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_todo, rotulo, url) => {
    const h = hrefSeguro(url);
    return h ? `<a href="${h}" target="_blank" rel="noopener">${rotulo}</a>` : rotulo;
  });
  return t;
}

const celulas = (linha: string): string[] =>
  linha.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function paraHtml(md: string): string {
  const linhas = md.replace(/\r/g, "").split("\n");
  const saida: string[] = [];
  const paragrafo: string[] = [];
  let i = 0;

  const fecharParagrafo = () => {
    if (paragrafo.length) {
      saida.push(`<p>${emLinha(paragrafo.join(" "))}</p>`);
      paragrafo.length = 0;
    }
  };

  while (i < linhas.length) {
    const l = linhas[i]!;

    if (/^```/.test(l)) {
      fecharParagrafo();
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^```/.test(linhas[i]!)) corpo.push(linhas[i++]!);
      i++;
      saida.push(`<pre><code>${escapar(corpo.join("\n"))}</code></pre>`);
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(l);
    if (titulo) {
      fecharParagrafo();
      const n = titulo[1]!.length;
      saida.push(`<h${n}>${emLinha(titulo[2]!)}</h${n}>`);
      i++;
      continue;
    }

    // Tabela: a linha seguinte TEM de ser a de separação, senão é parágrafo
    // que por acaso começa com barra vertical.
    if (/^\|/.test(l) && /^\|[\s:|-]+\|?$/.test(linhas[i + 1] ?? "")) {
      fecharParagrafo();
      const cab = celulas(l);
      i += 2;
      const corpo: string[] = [];
      while (i < linhas.length && /^\|/.test(linhas[i]!)) {
        corpo.push(`<tr>${celulas(linhas[i++]!).map((c) => `<td>${emLinha(c)}</td>`).join("")}</tr>`);
      }
      saida.push(`<table><thead><tr>${cab.map((c) => `<th>${emLinha(c)}</th>`).join("")}` +
                 `</tr></thead><tbody>${corpo.join("")}</tbody></table>`);
      continue;
    }

    const marcador = /^\s*[-*]\s+/.test(l);
    const numero = /^\s*\d+\.\s+/.test(l);
    if (marcador || numero) {
      fecharParagrafo();
      const tag = marcador ? "ul" : "ol";
      const padrao = marcador ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/;
      const itens: string[] = [];
      while (i < linhas.length && padrao.test(linhas[i]!)) {
        itens.push(`<li>${emLinha(padrao.exec(linhas[i++]!)![1]!)}</li>`);
      }
      saida.push(`<${tag}>${itens.join("")}</${tag}>`);
      continue;
    }

    const citacao = /^>\s?(.*)$/.exec(l);
    if (citacao) {
      fecharParagrafo();
      saida.push(`<blockquote>${emLinha(citacao[1]!)}</blockquote>`);
      i++;
      continue;
    }

    if (!l.trim()) { fecharParagrafo(); i++; continue; }

    paragrafo.push(l);
    i++;
  }

  fecharParagrafo();
  return saida.join("\n");
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test tests/markdown.test.ts`
Expected: PASS — 10 testes

- [ ] **Step 6: Acrescentar a rota em `src/painel.ts`**

Junto das outras rotas de leitura (livres no nginx), e importando `paraHtml` de
`./markdown.ts`:

```ts
  if (rota === "/api/markdown") {
    const item = itemPorId(db, Number(url.searchParams.get("id")));
    if (!item) return new Response("não encontrado", { status: 404 });
    const alvo = dentroDoAcervo(item.rel_path);
    if (!alvo) return new Response("fora do acervo", { status: 400 });
    return Response.json({ titulo: item.titulo, html: paraHtml(await Bun.file(alvo).text()) });
  }
```

- [ ] **Step 7: Escrever `src/ui/materiais.ts`**

Sem template literal aninhado aqui — concatenação simples evita uma camada de
escape que já causou página em branco em projeto parecido:

```ts
/**
 * O markdown de `Repo/` no palco, no lugar do vídeo.
 *
 * Reusa a árvore e a marcação: material escrito é item como qualquer outro, e
 * a chave `i:<id>` já serve para "li isto".
 */
export const MATERIAIS_JS = `
async function pintarMarkdown() {
  const palco = document.querySelector('.palco');
  const d = await (await fetch('/api/markdown?id=' + atual.id)).json();
  const p = dados.progresso[CHAVE(atual.id)] || { segundos: 0, feito: false };

  palco.innerHTML =
    '<div class="cabeca"><h2>' + esc(atual.titulo) + '</h2></div>' +
    '<div class="ferramentas"><button id="bFeito">' +
      (p.feito ? '✓ lido' : 'marcar como lido') + '</button></div>' +
    '<article class="md">' + d.html + '</article>';

  document.getElementById('bFeito').onclick = () => {
    marcar(atual.id, !feito(atual.id));
    pintarPalco();
  };
}
`;
```

E no `pintarPalco` de `player.ts`, como primeira linha depois da guarda de
`atual`:

```js
  if (atual.tipo === 'markdown') { pintarMarkdown(); return; }
```

- [ ] **Step 8: CSS em `tema.ts`**

```ts
export const CSS_MARKDOWN = `
.md { padding: 4px 24px 60px; max-width: 760px; line-height: 1.7; }
.md h1, .md h2, .md h3 { margin: 28px 0 10px; line-height: 1.3; }
.md h1 { font-size: 24px; } .md h2 { font-size: 20px; } .md h3 { font-size: 17px; }
.md p { margin: 0 0 14px; }
.md ul, .md ol { margin: 0 0 14px; padding-left: 22px; }
.md li { margin: 4px 0; }
.md a { color: var(--ambar); border-bottom: 1px solid transparent; }
.md a:hover { border-bottom-color: var(--ambar); }
.md code { background: var(--elevada); padding: 1px 5px; border-radius: 5px; font-size: 13px; }
.md pre { background: var(--superficie); border: 1px solid var(--borda);
          border-radius: 10px; padding: 14px; overflow-x: auto; }
.md pre code { background: none; padding: 0; }
.md blockquote { margin: 0 0 14px; padding: 2px 0 2px 16px;
                 border-left: 3px solid var(--borda); color: var(--secundario); }
/* Tabela larga rola sozinha em vez de esticar a página inteira. */
.md table { width: 100%; border-collapse: collapse; margin: 0 0 18px;
            display: block; overflow-x: auto; }
.md th, .md td { padding: 7px 10px; border-bottom: 1px solid var(--borda); text-align: left; }
.md th { color: var(--secundario); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
`;
```

Ligue `CSS_MARKDOWN` e `MATERIAIS_JS` em `pagina.ts`.

- [ ] **Step 9: Conferir na tela**

Abra o card **Materiais** e então `Mapa.Completo.md` — são 51 KB, a prova real.
Confira: hierarquia de títulos visível, tabelas rolando na horizontal sem
esticar a página, e nenhum `##` aparecendo como texto.

- [ ] **Step 10: Commit**

```bash
git add src/markdown.ts src/ui/ src/painel.ts tests/markdown.test.ts
git commit -m "materiais: markdown renderizado sem dependência de runtime"
```

---

## Ordem de execução

As tarefas 1 a 9 são sequenciais — cada uma importa a anterior. A partir daí:

```
1 → 2 → 3 → 4 → 5 → 6 ─┐
                        ├→ 9 → 10 → 11 → 12 → 19 → 13 → 16 → 18
        7 ──────────────┤                              ↑
        8 ──────────────┘                              │
                        14 → 15 ───────────────────────┘
                        17 (independente, a qualquer momento depois da 9)
```

A 19 vem depois da 12 porque reusa `pintarPalco`, `marcar` e a árvore já prontas.

A Tarefa 15 depende da 14 (precisa de transcrição para comparar) e a 16 depende
da 15 (precisa de divergência para mostrar). A 17 (infra) só precisa que o
painel suba, então pode ser feita em paralelo com a UI.

## Riscos e o que fazer

| Risco | Sinal | O que fazer |
|---|---|---|
| Prune falhando | `bun run scan` passa de 2 min | Conferir `ehRecorte` na pasta que travou |
| Whisper na CPU | fila andando a ~1 vídeo por 10 min | `torch.cuda.is_available()`; reinstalar com `--extra gpu` |
| Whisper truncando | divergência com `palavras_nova` muito menor | O relatório já pega; retranscrever o item isolado |
| Identidade não repassada | Procópio vê card de disco | `proxy_set_header X-Painel-Usuario` no nginx |
| Colisão de porta | 502 intermitente | `ss -lntp 'sport = :17789'`; conferir os dois lados |
| Limiares mal calibrados | dezenas de divergências falsas | Ajustar `ED_DIVERGENCIA_*` depois de ler 3 casos |
