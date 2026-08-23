# Acesso remoto ao painel

> **Nada disto foi executado.** Os scripts estão escritos e conferidos por
> sintaxe, mas nenhum comando saiu daqui para o droplet: os passos exigem as
> duas senhas e o acesso administrativo, que são do dono. Rodar é com você.

**Dois nomes chegam no mesmo painel.** O canônico é
`ensinantesdigitais.chicofigueiredo.com.br` (sem hífen); o apelido
`ensinantes-digitais.chicofigueiredo.com.br` (com hífen) responde com 301 para
ele. Os DOIS precisam de registro de DNS apontando para o droplet **antes** do
passo 3 — o Let's Encrypt valida cada nome separadamente, e um apelido sem DNS
não gera aviso: derruba a emissão inteira e o site fica sem certificado nenhum.

O servidor `ssh.chico-figueiredo.com.br` e o `ssh.lojapopcorn.com.br` são a
mesma máquina. Os scripts usam o segundo, que é o que o túnel do focus-scrap já
usa — e é por isso que a porta aqui é a 17789 e não a 17788.

Como **https://ensinantesdigitais.chicofigueiredo.com.br** existe, e como
refazer isso do zero.

O painel continua rodando só na máquina de casa. Nada do acervo é copiado para
servidor nenhum: o vídeo sai do disco daqui no instante em que se aperta play
no tablet. O que existe lá fora é um cano com senha na ponta — e, diferente do
focus-scrap, com **duas** senhas, uma para cada pessoa que pode entrar.

```
tablet ──HTTPS──▶ nginx no droplet ──▶ 127.0.0.1:17789 (ponta do túnel)
                  (TLS + htpasswd           ▲
                   com 2 usuários)          │ túnel SSH reverso
                        WSL ── ssh -R ───────┘   (ensinantes-tunel.service)
                         │
                         └─ painel em 127.0.0.1:17789 ── acervo em /mnt/e
```

Quem disca é o PC de casa, saindo pela porta 22. Não há porta aberta no
roteador, não há IP fixo para manter, e por isso funciona atrás do NAT da
operadora.

## Dois usuários, dois níveis de acesso

`chico` é o dono e vê tudo. `procopio` é o professor convidado: não vê espaço
em disco, botões de processamento, fila/eventos/erros nem caminhos absolutos
do sistema de arquivos — essa distinção é feita pelo painel (`src/usuario.ts`),
não pelo nginx. O nginx só faz duas coisas, e as duas são obrigatórias:

1. Autentica cada usuário contra o `htpasswd` (`/etc/nginx/ensinantes.htpasswd`,
   duas entradas) e repassa quem autenticou no cabeçalho
   `X-Painel-Usuario: $remote_user`.
2. Como esse `proxy_set_header` **sobrescreve** qualquer `X-Painel-Usuario` que
   o navegador tenha mandado, ninguém consegue se declarar `chico` só
   forjando o cabeçalho na mão — o painel confia nesse header porque é o
   nginx quem o torna confiável.

Sem essa linha no nginx, todo acesso remoto chegaria como `chico` (o painel
assume esse usuário quando o header não vem, caso do acesso local em
`127.0.0.1`) — e o Procópio veria tudo que o Chico vê.

## A porta é fixa, e não é a 17788

**Não basta dar `bun run painel` em qualquer porta.** O túnel é um par de
portas decidido de antemão: `ssh -R 17789:127.0.0.1:17789`. O nginx do droplet
faz proxy para a `17789` **daquela ponta**, e a ponta despeja na `17789`
**desta**. Painel em qualquer outra porta = o túnel entrega numa porta vazia =
**502 no tablet**.

É **17789**, e não **17788**, porque a 17788 já é do túnel do focus-scrap
nesta mesma máquina e no mesmo droplet. Repetir a porta derruba um dos dois
serviços de forma intermitente — o sintoma é 502 esporádico, que parece PC
suspenso ou painel caído, e não é.

Por isso a porta está fixada no `.env`:

```bash
ED_PAINEL_PORTA=17789
```

Mudar a porta: troque nos **dois** lugares (`.env` e `config.sh`) e rode
`./3-droplet-nginx.sh` e `./4-servico-local.sh` de novo.

## Refazer do zero

Pré-requisitos — no droplet: nginx, certbot com plugin nginx, `apache2-utils`,
OpenSSH 7.9+. No DNS: o nome já resolvendo para o IP do droplet (o passo 3
confere e recusa seguir se não estiver). Aqui: systemd no WSL.

**Quem roda isto é o dono do projeto** — os passos 2, 3 e 4 abaixo exigem acesso
SSH ao droplet (`root@ssh.lojapopcorn.com.br`) e o passo 3 pede para inventar
e anotar as duas senhas na hora. Nenhum desses scripts embute senha ou
credencial: tudo é gerado ou pedido no momento em que roda.

Ajuste `config.sh` se necessário (domínio, servidor, porta, os dois usuários)
e rode na ordem:

```bash
cd infra/remote
./1-chave-local.sh      # aqui — gera o par de chaves exclusivo do túnel
./2-droplet-usuario.sh  # NO DROPLET — cria 'tunel-ensinantes', sem shell, chave trancada
./3-droplet-nginx.sh    # NO DROPLET — site, as DUAS senhas, certificado; imprime as senhas uma vez
./4-servico-local.sh    # aqui — o túnel como serviço do systemd
./verificar.sh          # confere a corrente inteira
```

Todos são idempotentes: rodar de novo não estraga o que já existe. O passo 3
imprime cada senha uma única vez — depois dela só resta o bcrypt no droplet.
**Anote as duas na hora**, uma para `chico` e uma para `procopio`.

Antes do passo 3, o DNS já tem de resolver para o IP do droplet — o próprio
Let's Encrypt confirma o domínio batendo na porta 80:

```bash
dig +short ensinantesdigitais.chicofigueiredo.com.br
```

| Arquivo | O quê | Exige acesso ao VPS? |
|---|---|---|
| `config.sh` | domínio, servidor, porta, os dois usuários — a única coisa a editar | não |
| `1-chave-local.sh` | gera `~/.ssh/ensinantes_tunel` | não |
| `2-droplet-usuario.sh` | cria o usuário `tunel-ensinantes` com a chave restrita | sim |
| `3-droplet-nginx.sh` | site do nginx, `htpasswd` com os dois usuários, certbot — pede/gera as duas senhas | sim |
| `4-servico-local.sh` | escreve e liga o `ensinantes-tunel.service` | não |
| `verificar.sh` | diagnóstico elo por elo (as conferências autenticadas pedem as senhas) | sim, se autenticado |
| `ensinantes-nginx.conf` | cópia do que fica no droplet, para leitura | — (referência) |
| `ensinantes-painel.service` | **opcional, não instalado** — painel subindo com o WSL | não |

## As decisões que valem explicar

**Por que não Caddy nem Docker.** O droplet já serve outros sites com nginx +
certbot nas portas 80/443. Caddy só poderia entrar *atrás* do nginx, fazendo o
que o nginx já faz. Os scripts são aditivos: criam um arquivo novo em
`sites-available`, passam por `nginx -t` e recarregam. Não leem nem editam
configuração de outro site — nem a do focus-scrap, que já mora lá.

**Por que um usuário sem shell.** A chave do túnel fica guardada num serviço
que reconecta sozinho a noite toda. Ela é um par novo (não a chave de root do
dono) e no `authorized_keys` vai com
`restrict,port-forwarding,permitlisten="17789"`: sem shell, sem agente, sem
X11, sem TTY, e sem poder escutar em outra porta. De posse dela, o que se
alcança é um painel que ainda pede senha.

**Por que dois usuários, e não um.** O Procópio precisa assistir aula, ler
transcrição, marcar como visto e anotar — mas nada de ver quanto espaço o
acervo ocupa, disparar transcrição ou abrir arquivo no Explorer da máquina de
casa. Um único login misturaria as duas coisas. Com dois usuários e o
cabeçalho `X-Painel-Usuario` repassado pelo nginx, o painel decide a
visibilidade sozinho — ver `permissoesDe()` em `src/usuario.ts`.

**Por que só leitura de processo, de fora.** O painel dispara transcrição,
abre arquivo no Explorer e limpa recortes. Nada disso faz sentido a partir do
tablet, e tudo isso é poder sobre a máquina de casa. Estas respondem 403 no
nginx (a lista canônica é `ROTAS_ADMIN` em `src/usuario.ts`; `ROTAS_BLOQUEADAS`
em `config.sh` tem de bater com ela):

```
/api/run  /api/requeue  /api/revelar  /api/abrir  /api/limpeza
```

Assistir, ler transcrição, marcar aula como vista e anotar continuam
funcionando: tudo isso passa por `POST /api/sync`, que é escrita de progresso,
anotação e preferência — nada que rode processo nesta máquina. Se uma senha
vazar, o estrago é alguém ver o acervo (ou, no caso do Procópio, uma fatia
dele), não rodar processo aqui dentro.

Ao mexer na lista de bloqueio, lembre que `/api/sync` **tem de continuar
liberada**: é por ela que o tablet grava o que foi marcado e anotado. Bloqueá-la
não deixa o painel "só leitura" — deixa ele quebrado, com a fila de escrita
enchendo para sempre.

## Conferir a corrente inteira, de fora

Depois da instalação, com as senhas em mãos:

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

Esperado na última: `"usuario":"procopio"`. Se vier `chico`, o
`proxy_set_header` não está sobrescrevendo e o controle de acesso remoto é
decorativo — pare e conserte antes de passar a senha ao Procópio.

`SENHA_CHICO='...' SENHA_PROCOPIO='...' ./verificar.sh` roda essas mesmas
conferências, incluindo a do header forjado.

## Diagnóstico

```bash
./verificar.sh                                          # elo por elo
SENHA_CHICO='...' SENHA_PROCOPIO='...' ./verificar.sh    # + conferências autenticadas

systemctl --user status ensinantes-tunel
journalctl --user -u ensinantes-tunel -n 50
systemctl --user restart ensinantes-tunel
```

| Sintoma | Quase sempre é |
|---|---|
| **502** | túnel de pé, painel não. PC suspenso, painel parado, ou painel que pulou de porta |
| **401 que não passa** | senha errada — `htpasswd -B /etc/nginx/ensinantes.htpasswd <usuario>` troca |
| **503 / conexão recusada** | nginx fora do ar no droplet |
| **procópio vendo o que não devia** | o `X-Painel-Usuario` não está chegando ou está sendo repassado do cliente — rode a conferência do header forjado |
| **tudo lento** | é o upload da internet de casa: o vídeo sai do disco em tempo real |

**PC desligado ou suspenso = 502.** Não tem contorno: o acervo está aqui. Para
o painel ao menos subir junto com o WSL, `ensinantes-painel.service` está
pronto e não instalado (as duas linhas para ligar estão no cabeçalho dele).

## Trocar uma senha

```bash
ssh -t root@ssh.lojapopcorn.com.br htpasswd -B /etc/nginx/ensinantes.htpasswd chico
ssh -t root@ssh.lojapopcorn.com.br htpasswd -B /etc/nginx/ensinantes.htpasswd procopio
```

O `-t` não é enfeite: o `htpasswd` PERGUNTA a senha, e `ssh` com comando não
aloca terminal. Sem ele o prompt não aparece direito e a troca falha de um
jeito confuso. Com `-t`, ele pede duas vezes e nada da senha passa pela linha
de comando — ou seja, não fica no histórico do shell nem na lista de processos.

Cada comando troca só a senha do usuário indicado; o outro fica intacto. Não
precisa recarregar o nginx: o arquivo é lido a cada requisição, então a senha
nova vale na requisição seguinte.

Conferir que funcionou, sem abrir o navegador:

```bash
# 401 com a senha velha, 200 com a nova
curl -s -o /dev/null -w '%{http_code}\n' -u chico https://ensinantesdigitais.chicofigueiredo.com.br/
```

**Acrescentar um terceiro usuário** é o mesmo comando com outro nome — o
`htpasswd` cria a entrada se ela não existir. Mas o painel só conhece `chico` e
`procopio`: qualquer outro nome autentica no nginx e cai como o MENOS
privilegiado do lado do app (`USUARIOS` em `src/config.ts`, `quemE` em
`src/usuario.ts`). Para um terceiro usuário de verdade, os dois lados mudam.

**Nunca** use `-b` (senha na linha de comando) nem `-c` fora da instalação: o
`-c` RECRIA o arquivo e apaga o outro usuário junto.

## Certificado

O certbot deixou a renovação agendada no próprio droplet. Conferir:

```bash
ssh root@ssh.lojapopcorn.com.br 'certbot certificates | grep -A2 ensinantesdigitais'
```
