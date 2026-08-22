# Ensinantes Digitais — painel de estudo

Data: 2026-08-22
Estado: aprovado, pronto para virar plano de implementação

## O que é

Um painel web local para navegar os três cursos do combo Ensinantes Digitais
que estão em `/mnt/e/Marketing/Ensinantes.Digitais/`, com vídeo, transcrição,
PDFs e marcação de progresso — acessível de fora por túnel SSH, com dois
usuários: **chico** (dono, vê tudo) e **procopio** (convidado, vê só o
conteúdo).

É um irmão do [focus-scrap](https://github.com/ChicoFigueiredo/Focus-Scrap),
não um sucessor. Reusa o painel, o player, a legenda, o banco de progresso, o
worker de transcrição por GPU e a infra de acesso remoto. Descarta tudo que era
raspagem de portal — aqui **o disco é o catálogo**.

## O acervo, medido

Levantamento de 2026-08-22 sobre `/mnt/e/Marketing/Ensinantes.Digitais/`:

| Curso | Módulos | Vídeos | Com `.srt` | PDFs | Tamanho |
|---|---|---|---|---|---|
| `1-Ensinantes` | 26 | 212 | 65 | 18 | 145 GB |
| `2-Acelerador.Conteudo.IA` | 10 (só nomes) | 0 | 0 | 0 | 0 |
| `3-Criadores.Videos` | 16 | 20 | 12 | 1 | 1,7 GB |

- **159 dos 232 vídeos não têm transcrição nenhuma.**
- **172.004 PNGs de recorte, somando 127,25 GB** — 87% do acervo. Contra
  18,43 GB de vídeo. A pasta campeã tem 15.862 arquivos.
- `2-Acelerador.Conteudo.IA` tem só `lista.txt` (10 módulos) e um
  `gera_pastas.bash`. Nenhum material.
- `Repo/` existe fora dos três cursos: `Mapa.Completo.md` (51K), a planilha
  `Mapa do Curso On-line (Completo).xlsx`, e documentação de conversão.

Máquina: **RTX 4080 SUPER 16 GB**, CUDA disponível, `faster-whisper` já
instalado no Python do sistema. `bun 1.3.11`, `uv 0.9.9`.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Curso 2 vazio | Aparece como **esqueleto**: os 10 módulos do `lista.txt`, marcados como não baixados |
| Escopo da transcrição | **Todos os 232**, com backup das legendas atuais e comparação texto a texto |
| Progresso e anotações | **Separados por usuário** — `usuario` entra na chave primária |
| Login local | **Sem header = chico.** O app nunca tem senha própria |
| Navegação | **Cards na home**, árvore lateral + player dentro do curso |
| Visual | **Escuro sóbrio**, foco no vídeo |
| Pasta `Repo/` | Entra como quarta seção, **Materiais** |
| Recortes PNG | Script **gerado e nunca executado** |

## Arquitetura

Fork adaptado do focus-scrap: mesmo formato (Bun + SQLite + HTML servido
inline, sem bundler), com `scan.ts` no lugar da raspagem.

O painel sobe em ~200 ms e não tem passo de build. Isso é uma propriedade a
preservar, não um acidente: é o que faz o painel ser aberto no meio do estudo
em vez de ser "levantado".

### Estrutura

```
ensinantes-digitais/
├── acervo → /mnt/e/Marketing/Ensinantes.Digitais   (symlink, fora do git)
├── ensinantes.db                                    (SQLite, fora do git)
├── src/
│   ├── config.ts        caminhos, porta, usuários válidos
│   ├── db.ts            esquema + acesso
│   ├── scan.ts          disco → catálogo
│   ├── naming.ts        regras de extração de código e título
│   ├── legenda.ts       srt→vtt + trechos          (cópia do focus-scrap)
│   ├── revelar.ts       abrir no Explorer          (cópia, caminho ajustado)
│   ├── backup.ts        cópia do .db para o acervo (cópia do focus-scrap)
│   ├── recortes.ts      relatório + gerador do script de limpeza
│   ├── painel.ts        Bun.serve, rotas, permissões
│   ├── ui/              tema.ts · home.ts · curso.ts · player.ts · transcricao.ts
│   └── cli.ts           scan · painel · transcrever · recortes · status
├── py/ensinantes/       config · db · transcriber · comparar · worker
├── infra/remote/        cópia do focus-scrap, com dois usuários
├── relatorios/          recortes.md · divergencias.md   (gerados)
├── scripts/             apagar-recortes.sh              (gerado)
└── tests/
```

### O que NÃO vem do focus-scrap

`scrape.ts`, `auth.ts`, `agent.ts`, `cdn.ts`, `iesde.ts`, `escritos.ts`,
`livro.ts`, `assistir.ts` e `py/focus/downloader.py`. Todos eram do portal
raspado. Some junto a dependência de **Playwright** e a chave do **OpenRouter**
— o projeto novo não faz rede nenhuma para fora.

### O que vem quase intacto

`legenda.ts` (65 linhas, cópia literal), `revelar.ts`, `backup.ts`, a mecânica
de `Range` do streaming de vídeo em `panel.ts`, a fila de transcrição do
`db.ts`, e `infra/remote/` inteiro.

### O que é reescrito

`panel-ui.ts` — 1.054 linhas de HTML/CSS/JS inline num arquivo só. É o
redesenho, então seria reescrito de qualquer forma; a mudança é quebrá-lo em
`src/ui/` para que nenhum arquivo volte a crescer até ficar ineditável.
Continua sem bundler.

## Modelo de dados

```sql
CREATE TABLE cursos (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,     -- '1-ensinantes'
  pasta         TEXT NOT NULL,            -- '1-Ensinantes'
  posicao       INTEGER NOT NULL,
  titulo        TEXT NOT NULL,
  estado        TEXT NOT NULL,            -- 'completo' | 'esqueleto'
  escaneado_em  TEXT
);

CREATE TABLE modulos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id  INTEGER NOT NULL REFERENCES cursos(id),
  codigo    TEXT NOT NULL,                -- '00' '01' 'B01'
  pasta     TEXT,                         -- NULL quando esqueleto
  titulo    TEXT NOT NULL,
  posicao   INTEGER NOT NULL,
  UNIQUE(curso_id, codigo)
);

CREATE TABLE itens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id           INTEGER NOT NULL REFERENCES modulos(id),
  tipo                TEXT NOT NULL,      -- video|pdf|planilha|doc|link|markdown
  codigo              TEXT,               -- '01.02'; NULL quando o nome não traz
  titulo              TEXT NOT NULL,
  rel_path            TEXT NOT NULL,      -- relativo à raiz do acervo
  posicao             INTEGER NOT NULL,
  bytes               INTEGER NOT NULL DEFAULT 0,
  duracao             REAL,               -- ffprobe; só vídeo
  srt_path            TEXT,
  transcricao_estado  TEXT NOT NULL DEFAULT 'pending',
  transcricao_erro    TEXT,
  tentativas          INTEGER NOT NULL DEFAULT 0,
  transcrito_em       TEXT,
  comparacao          TEXT,               -- JSON, ver "Transcrição"
  UNIQUE(modulo_id, tipo, rel_path)
);

CREATE TABLE recortes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path  TEXT NOT NULL UNIQUE,
  item_id   INTEGER REFERENCES itens(id), -- NULL quando não casa com aula
  arquivos  INTEGER NOT NULL,
  bytes     INTEGER NOT NULL,
  visto_em  TEXT NOT NULL
);

CREATE TABLE eventos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  nivel     TEXT NOT NULL,                -- info | error
  origem    TEXT NOT NULL,
  mensagem  TEXT NOT NULL
);
```

Estado de quem estuda — `usuario` na chave primária em todas:

```sql
CREATE TABLE progresso (
  usuario    TEXT NOT NULL,
  chave      TEXT NOT NULL,               -- 'i:317' | 'md:Repo/Mapa.Completo.md'
  segundos   REAL    NOT NULL DEFAULT 0,
  feito      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario, chave)
);

CREATE TABLE notas     (usuario TEXT, chave TEXT, texto TEXT NOT NULL,
                        updated_at TEXT, PRIMARY KEY (usuario, chave));
CREATE TABLE prefs     (usuario TEXT, nome  TEXT, valor TEXT NOT NULL,
                        updated_at TEXT, PRIMARY KEY (usuario, nome));
CREATE TABLE ui_estado (usuario TEXT, nome  TEXT, valor TEXT NOT NULL,
                        PRIMARY KEY (usuario, nome));
CREATE TABLE sessoes   (usuario TEXT PRIMARY KEY, ultimo_acesso TEXT NOT NULL);
```

`chave` é texto, e não `item_id`, porque nem tudo que se marca como lido é linha
de `itens` — os markdowns de `Repo/` são arquivos soltos. `sessoes` existe só
para o indicador de presença.

## O scanner

`bun run scan`. Idempotente: rodar de novo atualiza, não duplica.

### Prune nos recortes

Ao entrar numa pasta, se ela contém `.png` e **nenhum** `.mp4`, o scanner conta
os arquivos, soma os bytes, grava a linha em `recortes` e **não desce**.

Sem isso a varredura toca 172 mil arquivos sobre drvfs — que é o filesystem
lento do WSL sobre `/mnt/e`. Com o prune, o scanner vê ~350 entradas. A
diferença é entre segundos e dezenas de minutos, e é o que permite rodar o scan
como operação corriqueira em vez de ritual.

A regra é **por conteúdo, não por nome**. Os recortes de
`00-Lives.de.Leads/` têm sufixo de resolução (`… 720 x 1280`) e não casam com o
nome do vídeo; casar por nome perderia essas.

### Regras de nome

Derivadas dos nomes reais do disco, não de um padrão idealizado:

| No disco | Vira |
|---|---|
| `01.A.Jornada.do.Ensinante.Digital` | módulo `01` · "A Jornada do Ensinante Digital" |
| `02-O Que Todo Ensinante Digital Deveria Saber` | módulo `02` · título literal |
| `00-Lives.de.Leads` | módulo `00` · "Lives de Leads" |
| `B01-Direitos Autorais Sobre Curso On-line - Dr. Pedro Maia` | módulo `B01` · bônus |
| `01.02-A Ordem do Ensinantes Digitais.mp4` | aula `01.02` · "A Ordem do Ensinantes Digitais" |
| `01.03-Mapa+do+Curso+On-line+(Completo).xlsx` | aula `01.03` · "Mapa do Curso On-line (Completo)" |
| `Aula 3 - Atraindo Alunos para o Seu Curso On-line 720 x 1280` | sem código · ordena por nome, depois dos numerados |

O prefixo é `\d+` ou `B\d+` seguido de `.` ou `-`; o resto é o título.

No título, `.` e `+` viram espaço **apenas quando o restante do nome não contém
espaço nenhum**. É o que separa `01.A.Jornada.do.Ensinante.Digital` (todo
pontilhado, precisa da conversão) de `02-O Que Todo Ensinante Digital Deveria
Saber` (já tem espaços — mexer nele só estragaria abreviações e siglas com ponto).
A extensão sai antes da conversão, senão `.xlsx` viraria parte do título.

Onde a regra não alcança, preservar o que está no disco. Quem organizou o acervo
tomou decisões que o scanner não tem como reconstruir, e um título feio é melhor
que um título errado.

### Sidecars

Para cada `X.mp4`, o scanner amarra ao mesmo item: `X.srt`,
`X-Fala.Cronometrada.txt`, `X.txt`, `X.sub`, e a pasta `X/` como recorte.
`ffprobe` mede a duração uma vez e cacheia em `itens.duracao`.

### Pastas ignoradas

- `_antigo/` — **não entra no catálogo.** No curso 1 ela guarda uma aula
  aposentada inteira (`01.04-Como Tirar as Suas Dúvidas.mp4`), não só legendas.
  O scan lista seu conteúdo em `relatorios/fora-do-catalogo.md` para decisão
  manual — o material não some, só não entra na navegação sem você mandar.
- `_transcricoes.antigas/` — backup criado por este projeto; lido só como
  referência de comparação, nunca como conteúdo.

### Materiais (`Repo/`)

`Repo/` não é curso: é um curso-irmão de materiais escritos. O scanner a trata
como uma quarta linha na tabela `cursos`, com `estado = 'materiais'`, um único
módulo implícito e um item por arquivo:

- `.md` → tipo `markdown`, renderizado no painel (`Mapa.Completo.md`, `INDEX.md`,
  `SUMARIO.md`, `EXEMPLOS.md`, `COMPARACAO.md`, `CHANGELOG.md`, `README.md`,
  `CORRECOES.md`, `AJUSTES_V3.0.2.md`)
- `.xlsx` → tipo `planilha`, oferecida para download
- `.py`, `.log`, `versoes_anteriores/` e arquivos começados em `~$` (lock do
  Excel) ficam de fora

O progresso desses usa a chave `md:<rel_path>`, então marcar lido e anotar
funciona igual ao dos vídeos, sem esquema separado.

### O curso esqueleto

`2-Acelerador.Conteudo.IA` não tem pastas. O scanner lê `lista.txt`, cria os 10
módulos com `pasta = NULL`, marca `cursos.estado = 'esqueleto'`. No dia em que a
pasta tiver arquivos, o scan normal assume — sem código especial nem migração.

## Transcrição

`bun run transcrever` enfileira; `uv run python -m ensinantes.worker` consome.

**Modelo:** `large-v3`, `float16`, `BatchedInferencePipeline`, `batch_size=16`,
`language="pt"`, VAD ligado. Mesma configuração do focus-scrap, que já rodou
nesta GPU.

**Antes de escrever**, o worker move a legenda vigente do item para
`_transcricoes.antigas/` na própria pasta da aula: `.srt`,
`-Fala.Cronometrada.txt`, `.txt`, `.sub`.

**Escreve** os três formatos do acervo: `.srt`, `-Fala.Cronometrada.txt`, `.txt`.

**Depois**, compara o texto plano novo com o antigo e grava em
`itens.comparacao`:

```json
{"palavras_nova": 2841, "palavras_antiga": 2903, "similaridade": 0.94}
```

Similaridade por `difflib.SequenceMatcher` sobre os tokens normalizados
(minúsculas, sem pontuação).

### Divergências

Um item é **divergente** quando `palavras_nova < palavras_antiga * 0.85` ou
`similaridade < 0.75`. Esses viram `relatorios/divergencias.md` e um card no
painel visível só para chico, onde cada linha abre as duas versões lado a lado.

Esse é o mecanismo concreto do requisito "garantir que esteja correto e
completo": a transcrição não é aceita em silêncio, ela é medida contra a
anterior e o que destoa é apresentado para conferência humana. Os limiares são
um chute informado — a revisão da primeira leva de resultados deve ajustá-los.

Vídeos sem legenda anterior (159 dos 232) não têm com o que comparar;
`comparacao` fica `NULL` e eles não aparecem no relatório.

## Painel

`bun run painel` → `http://127.0.0.1:17789`.

### Rotas

| Rota | O quê | nginx |
|---|---|---|
| `GET /` | home: cards dos 3 cursos + Materiais | livre |
| `GET /curso/<slug>` | árvore lateral + player | livre |
| `GET /api/eu` | `{usuario, permissoes, outro_online}` | livre |
| `GET /api/tudo` | catálogo + progresso do usuário | livre |
| `POST /api/sync` | escrita de progresso, nota e preferência | **livre — obrigatório** |
| `GET /api/video` | stream com `Range` | livre |
| `GET /api/legenda` | SRT convertido em VTT | livre |
| `GET /api/transcricao` | `?versao=nova\|antiga` | livre |
| `GET /api/arquivo` | PDF, planilha, doc | livre |
| `GET /api/markdown` | markdowns de `Repo/` | livre |
| `POST /api/run` | scan, transcrever, requeue | **403** |
| `POST /api/revelar` · `abrir` | abre no Explorer da máquina | **403** |
| `POST /api/limpeza` | gera o script de recortes | **403** |

`/api/sync` **tem de continuar liberada**. Bloqueá-la não deixa o painel "só
leitura" — deixa quebrado, com a fila de escrita do navegador enchendo para
sempre. É o mesmo aprendizado registrado no focus-scrap.

### Duas tranças, não uma

O 403 do nginx protege o acesso remoto. Mas `painel.ts` **também** verifica:
rota administrativa com `usuario !== 'chico'` responde 403 antes de qualquer
efeito. Esconder card no CSS é cosmético e não conta como controle de acesso.

## Identidade e visibilidade

O nginx repassa `X-Painel-Usuario $remote_user` — o usuário autenticado pelo
htpasswd. O painel lê o header, valida contra `['chico', 'procopio']`, e
**sem header assume `chico`**, que é o caso do acesso local em `127.0.0.1`.

Não existe tela de login no app. A autenticação é do nginx; o app só lê o
resultado.

| | chico | procópio |
|---|---|---|
| Cursos, player, transcrição, PDF, anotações | sim | sim |
| Marcar visto, retomar de onde parou | sim, próprio | sim, próprio |
| Espaço em disco, bytes, contagem de recortes | sim | não |
| Botões de scan / transcrever / requeue / limpeza | sim | não |
| Fila, eventos, erros, divergências | sim | não |
| Revelar no Explorer, caminho absoluto do arquivo | sim | não |
| Indicador no canto superior direito | `(c)`, e `(p)` quando ele está online | só `(p)` |

**Presença** = `sessoes.ultimo_acesso` nos últimos 5 minutos, atualizado a cada
requisição. O `(p)` acende no canto do chico quando o procópio abre o painel. O
`(c)` nunca aparece para o procópio — ele não sabe quando o chico está lá.

## Visual

Escuro sóbrio, com o vídeo e o texto dominando e a interface recuando.

```
fundo      #0e1013      texto       #e8eaed
superfície #16191f      secundário  #9aa3af
elevada    #1e222a      borda       #2a2f3a
âmbar      #e8963c   → progresso, trecho corrente, aula em curso
verde      #4ea672   → concluído
```

`Inter`, com queda para `system-ui`. **Números tabulares** (`font-variant-numeric:
tabular-nums`) nos tempos — sem isso a coluna de timestamps dança a cada
segundo de reprodução.

Cards com raio 16 e borda de 1px, **sem sombra**: em fundo escuro, sombra
não separa planos, só suja.

**Home:** três cards de curso (título, contagem de módulos e aulas, barra de
progresso do usuário) mais o card Materiais, e abaixo uma faixa "Continuar de
onde parou".

**Dentro do curso:** árvore de módulos e aulas à esquerda com marca de visto e
de aula corrente; player em largura cheia à direita; transcrição rolando
embaixo com o trecho corrente destacado em âmbar e clicável para dar seek.

Responsivo: abaixo de 900px a árvore vira gaveta e o player ocupa a tela.

## Acesso remoto

`infra/remote/` copiado do focus-scrap, com três mudanças no `config.sh`:

```bash
DOMINIO=ensinantesdigitais.chicofigueiredo.com.br
PORTA=17789                       # ≠ 17788 do focus
USUARIOS_PAINEL=(chico procopio)  # duas entradas no htpasswd
```

**A porta diferente não é detalhe.** Os dois túneis rodam na mesma máquina e
discam para o mesmo droplet. Repetir a 17788 derruba um dos dois de forma
intermitente e difícil de diagnosticar — o sintoma é 502 esporádico, que parece
PC suspenso.

Rotas bloqueadas no nginx:
`ROTAS_BLOQUEADAS='run|requeue|revelar|abrir|limpeza'`

O passo 3 (`3-droplet-nginx.sh`) cria as duas entradas do htpasswd e imprime
cada senha **uma única vez**. A do procópio é repassada a ele por fora.

Nada do acervo sobe para servidor nenhum: o vídeo sai do disco de casa no
instante em que alguém aperta play. PC desligado = 502, sem contorno.

## Recortes PNG

`bun run recortes` gera dois arquivos e **não apaga nada**:

- `relatorios/recortes.md` — tabela ordenada por tamanho, com a aula de origem
  de cada pasta e o total acumulado
- `scripts/apagar-recortes.sh` — uma linha `rm -rf` por pasta, cada uma
  comentada com tamanho e contagem, `set -euo pipefail`, e recusa executar sem
  `--confirmar`

São 127,25 GB em 172.004 arquivos: 87% do acervo. Rodar o script libera o disco;
por isso ele é gerado e entregue, não disparado.

## Configuração

Um `.env` na raiz, lido pelo Bun automaticamente e pelo lado Python via
`py/ensinantes/config.py`. Toda variável nova entra nos dois e no `.env.example`.

```bash
ED_ACERVO=./acervo              # symlink → /mnt/e/Marketing/Ensinantes.Digitais
ED_PAINEL_PORTA=17789           # TEM de bater com PORTA do infra/remote/config.sh
ED_WHISPER_MODELO=large-v3
ED_WHISPER_COMPUTE=float16
ED_WHISPER_BATCH=16
ED_DIVERGENCIA_PALAVRAS=0.85    # limiar de encolhimento
ED_DIVERGENCIA_SIMILARIDADE=0.75
```

Não há credencial nenhuma: o projeto não faz requisição para fora.

`ED_PAINEL_PORTA` e `PORTA` do `infra/remote/config.sh` são o mesmo número
escrito em dois lugares. Divergir os dois é o modo mais rápido de produzir um
502 que parece problema de rede.

## Testes

`bun test` — o que quebra em silêncio:

- `naming.test.ts` — extração de código e título sobre os nomes reais do disco,
  incluindo `01.A.Jornada…`, `B01-…`, `Aula 3 - …` e `01.03-Mapa+do+Curso…`
- `legenda.test.ts` — `srt→vtt` e `lerTrechos` (cópia do focus-scrap)
- `scan.test.ts` — o prune sobre uma árvore de fixture: pasta com PNG e sem MP4
  é contada e não descida
- `permissoes.test.ts` — matriz completa: procópio recebe 403 em toda rota
  administrativa, e 200 em toda rota de leitura
- `sync.test.ts` — isolamento: escrita do procópio não aparece na leitura do chico

Python:

- `comparar_test.py` — o score de similaridade e a classificação de divergência
  nos limiares de corte

## Fora de escopo

- Baixar material novo de qualquer portal. Não há raspagem neste projeto.
- Editar transcrição pela interface. Ela é lida, não escrita.
- Apagar os recortes automaticamente.
- Terceiro usuário, papéis configuráveis, cadastro. São dois usuários fixos.

## Riscos conhecidos

| Risco | Mitigação |
|---|---|
| drvfs lento derruba a experiência do scan | prune obrigatório; `ffprobe` cacheado em banco |
| Whisper produzir transcrição pior que a existente em algum vídeo | comparação automática + relatório de divergências + backup em `_transcricoes.antigas/` |
| Colisão de porta com o túnel do focus-scrap | porta 17789 fixada nos dois lados, e verificada por `verificar.sh` |
| Nomes de pasta fora dos padrões observados | itens sem código não são descartados: ordenam por nome, depois dos numerados |
| Ocultar cards do procópio virar só CSS | verificação server-side em `painel.ts`, independente do nginx |
