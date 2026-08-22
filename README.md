# ensinantes-digitais

Painel local para estudar, em vídeo, o combo **Ensinantes Digitais** — três
cursos comprados mais a pasta de materiais, tudo já baixado no disco `E:`.
São 231 vídeos, cerca de 42 h de aula, transcritos com Whisper na GPU desta
máquina. Duas pessoas usam: o dono (`chico`) e um convidado (`procopio`).

Roda em Bun + TypeScript, com um lado Python só para a transcrição.
**Zero dependência de runtime**: o `package.json` só tem `devDependencies`,
não há bundler, não há framework de front, e nada aqui faz chamada de rede
para fora.

## O que é, e o que não é

- **É** um índice navegável do que já está no disco: cursos → módulos → aulas,
  com player, legenda clicável, marcação de visto, notas e retomada de onde
  parou.
- **Não é** raspador. O painel nunca baixa nada de plataforma nenhuma. A fonte
  da verdade é o disco; o banco `ensinantes.db` é só um catálogo derivado dele,
  refeito a qualquer momento por `bun run scan`.
- **Não apaga nada** do acervo. Nem os 127 GB de recortes em PNG (veja abaixo).
  O único arquivo que este projeto escreve dentro do acervo são as legendas que
  ele mesmo gera, e a pasta `_transcricoes.antigas/` onde guarda as antigas.

## Rodar do zero nesta máquina

```bash
git clone <repo> ensinantes-digitais && cd ensinantes-digitais

# 1. O acervo. O código só conhece o caminho `./acervo`.
ln -s /mnt/e/Marketing/Ensinantes.Digitais acervo

# 2. As variáveis. O padrão do exemplo já é o que esta máquina usa.
cp .env.example .env

# 3. Bun + o venv Python.
bun run setup          # = bun install && uv venv --system-site-packages && uv sync

# 4. O catálogo, lido do disco.
bun run scan

# 5. O painel.
bun run painel         # http://127.0.0.1:17789
```

O `--system-site-packages` no `uv venv` **não é enfeite**: o PyTorch com CUDA
está instalado no Python do sistema, e um venv isolado passaria horas
reinstalando — ou, pior, cairia numa build só de CPU e a transcrição levaria
dias em vez de horas. Se algum dia a transcrição parecer lenta demais, o
primeiro teste é justamente esse:

```bash
uv run python -c "import torch; print(torch.cuda.is_available())"   # tem de ser True
```

O `.env` é lido em **um** lugar de cada lado: `src/config.ts` no TypeScript
(o Bun carrega o arquivo sozinho) e `py/ensinantes/config.py` no Python (que o
lê à mão). Variável nova entra nos dois e no `.env.example`, sempre.

## Os comandos

Todos são `bun run src/cli.ts <comando>`; os mais usados têm atalho no
`package.json`. Sem argumento, o CLI imprime a ajuda e sai com 0; com comando
desconhecido, imprime a mesma ajuda e sai com 1.

| Comando | Atalho | O que faz |
|---|---|---|
| `scan` | `bun run scan` | Relê o acervo inteiro e refaz o catálogo. Também regrava `relatorios/recortes.md`, `scripts/apagar-recortes.sh` e `relatorios/fora-do-catalogo.md`. |
| `painel` | `bun run painel` | Destrava tarefas presas em `rodando` e sobe o servidor na porta 17789. |
| `transcrever` | `bun run transcrever` | Marca **todos** os vídeos como pendentes. Não transcreve nada — quem transcreve é o worker. |
| `requeue` | — | Devolve à fila só o que terminou em `erro`. |
| `recortes` | `bun run recortes` | Refaz o relatório de recortes e o script de limpeza, a partir do banco. Não apaga nada e não varre o disco. |
| `divergencias` | `bun run divergencias` | Regrava `relatorios/divergencias.md` e imprime quantos vídeos foram comparados e quantos divergiram. |
| `status` | `bun run status` | Duas tabelas: catálogo por curso e fila de transcrição. |
| `backup` | `bun run backup` | Copia o `ensinantes.db` para dentro do acervo. O painel já faz isso sozinho ao subir e a cada 30 min; este comando é para forçar na hora. |
| — | `bun run worker` | O laço da transcrição (`uv run python -m ensinantes.worker`). Horas de GPU. |
| — | `bun test` / `bun run typecheck` | Testes e checagem de tipos. |

O `divergencias` é o único que dispara Python: o critério de divergência mora
em `py/ensinantes/comparar.py`, e reimplementá-lo em TypeScript daria duas
verdades. O worker também escreve esse relatório ao terminar a fila, para que
ele reflita sempre a última passada.

O que o `scan` deve encontrar hoje:

```
Ensinantes              completo    35 módulos   244 itens
Acelerador Conteudo IA  esqueleto   10 módulos     0 itens   (curso não baixado)
Criadores Videos        completo    16 módulos    27 itens
Materiais               materiais    1 módulo     10 itens   (a pasta Repo/)
```

O `2-Acelerador.Conteudo.IA` aparece de propósito, esmaecido e marcado como
**não baixado**: a pasta existe com os módulos, mas sem as aulas. Some do
painel seria pior — daria a impressão de que o curso não foi comprado.

## Transcrição

```bash
bun run transcrever     # enfileira os 231 vídeos
bun run worker          # roda o Whisper na GPU — 42 h de vídeo em ~1,5 a 3 h
```

- Modelo `large-v3` em `float16`, idioma `pt`, batch 16, `vad_filter=True`.
  O filtro de voz **não é enfeite**: sem ele, trecho silencioso vira alucinação
  (o acervo tem uma vinheta muda que saía como "Terima kasih telah menonton",
  oito blocos seguidos).
- O modelo é carregado uma vez por execução do worker: são ~10 s e 2,5 GB de
  VRAM. Recarregar por vídeo dobraria o tempo total sem ganho nenhum.
- Cada aula produz três arquivos ao lado do vídeo: `.srt` (a legenda que o
  player usa), `-Fala.Cronometrada.txt` e `.txt` corrido.
- Um vídeo que falha não derruba a fila: ele fica em `erro`, com a mensagem
  guardada, e `bun run src/cli.ts requeue` devolve todos eles à fila.

### As legendas velhas, e a comparação

Parte do acervo já vinha com legenda de origem desconhecida. Antes de
retranscrever, o worker **move** — nunca apaga — os arquivos antigos para uma
pasta `_transcricoes.antigas/` ao lado do próprio vídeo. Uma segunda passada
não sobrescreve a primeira: ela guarda como `.srt.2`, `.srt.3`. A primeira
geração guardada é a referência, e é contra ela que a comparação faz sentido.

O modo de falha real do Whisper não é errar palavra: é **parar no meio** e
devolver um pedaço convincente. Por isso a checagem principal é de tamanho.
Um vídeo entra em `relatorios/divergencias.md` quando a transcrição nova tem
menos de **85%** das palavras da antiga, **ou** quando a similaridade entre as
duas cai abaixo de **0,75** (`ED_DIVERGENCIA_PALAVRAS` e
`ED_DIVERGENCIA_SIMILARIDADE` no `.env`).

Crescer não é motivo de alarme: o `large-v3` pegando mais fala que uma legenda
velha é exatamente o resultado desejado.

Estado de hoje: 231 de 231 prontos, 0 erros, 72 vídeos comparados (os outros
159 nunca tiveram legenda) e **1 divergente** — "Criando o Seu Método de Ensino
On-line", similaridade 0,59. Uma linha no relatório não quer dizer que a nova
está errada; quer dizer que vale abrir as duas e olhar.

## Os recortes em PNG

O acervo carrega 56 pastas de recorte quadro a quadro: **171.998 arquivos,
127,24 GB** — mais peso que todos os vídeos juntos, e nenhum valor para
estudar. O `scan` as reconhece, mantém fora do catálogo e as lista em
`relatorios/recortes.md`.

`bun run recortes` (e todo `scan`) **gera** `scripts/apagar-recortes.sh`.

> **Esse script nunca foi executado, e nada neste projeto o executa.**
> Nem o painel, nem o worker, nem o CLI, nem os testes. Ele é um rascunho
> gerado para ser lido. Apagar 127 GB é irreversível e é decisão do dono: o
> script só roda se alguém, à mão, escrever `bash scripts/apagar-recortes.sh
> --confirmar`. Sem o `--confirmar` ele recusa e sai com 1.

## Os dois usuários

Não há tela de login e o app não guarda senha. Quem autentica é o nginx do VPS,
que repassa o usuário no header `X-Painel-Usuario`.

| Quem | Como chega | Vê |
|---|---|---|
| `chico` (dono) | Sem header — o acesso local em `127.0.0.1` já é a máquina dele | Tudo: conteúdo, espaço em disco, tamanho dos arquivos, caminhos absolutos, fila de transcrição, eventos, divergências, botões que rodam processo |
| `procopio` (convidado) | Header `X-Painel-Usuario: procopio`, posto pelo nginx | Só o conteúdo: cursos, aulas, vídeo, legenda, o próprio progresso e as próprias notas |

Duas regras que parecem detalhe e não são:

- Header **ausente** vira `chico`; header **presente e desconhecido** vira
  `procopio`, o menos privilegiado. Um header estranho significa nginx mal
  configurado, e nesse caso errar para menos poder é a única direção segura.
- O filtro é no servidor, não no CSS: a resposta de `/api/tudo` para o
  procópio simplesmente **não contém** as chaves `disco`, `fila`, `eventos`,
  `recortes`, os bytes nem os caminhos. Nem o "ver código-fonte" os entrega.
  As rotas que rodam processo (`/api/run`, `/api/requeue`, `/api/revelar`,
  `/api/abrir`, `/api/limpeza`) devolvem 403 para ele — no nginx **e** aqui.

O progresso e as notas são por usuário: cada um marca o que viu sem mexer no do
outro. No canto superior direito, o chico vê acender um `(p)` quando o procópio
está online; o contrário não acontece, de propósito.

## Acesso de fora

A porta é a **17789**, dos dois lados do túnel, e tem de bater com `PORTA` no
`infra/remote/config.sh`. Divergir as duas produz 502 intermitente, que parece
problema de rede e não é.

Os passos do dono para montar (ou refazer) o acesso remoto — chave, droplet,
nginx com os dois logins, serviço local, e o roteiro de conferência de fora —
estão em **[`infra/remote/README.md`](infra/remote/README.md)**. Não estão
repetidos aqui de propósito: um roteiro de infraestrutura em dois lugares vira
dois roteiros diferentes.

## Quando der errado

| Sintoma | Quase sempre é |
|---|---|
| 502 de fora | PC suspenso, painel parado, ou painel que pulou de porta |
| 401 que não passa | senha errada — `htpasswd -B /etc/nginx/ensinantes.htpasswd <usuario>` |
| Procópio vendo card de disco | `proxy_set_header X-Painel-Usuario` faltando no nginx |
| Vídeo não deixa arrastar | `Range` não está chegando — `proxy_buffering off` no nginx |
| Legenda não aparece | o `<track>` não lê SRT; confira se `/api/legenda` devolve VTT |
| Scan demorando minutos | o prune não está pegando — veja `ehRecorte` |
| Transcrição lenta demais | caiu para CPU — `python -c "import torch;print(torch.cuda.is_available())"` |

## Mapa do repositório

```
src/          TypeScript: cli, config, banco, scan, painel, permissões, UI
py/ensinantes/ Python: worker, transcriber, comparação com a legenda antiga
tests/        testes do lado TS (bun test)
py/tests/     testes do lado Python (uv run pytest py/tests/)
infra/remote/ o acesso remoto, com README próprio
relatorios/   saída gerada — recortes, fora do catálogo, divergências (fora do git)
scripts/      apagar-recortes.sh, gerado e nunca executado (fora do git)
docs/         o design e o plano que originaram o projeto
```

O banco `ensinantes.db` fica na raiz do projeto, **nunca** dentro do acervo: o
acervo é conteúdo, não estado. Ele não está no git — se sumir, `bun run scan` o
reconstrói (menos o progresso e as notas, que só existem ali).
