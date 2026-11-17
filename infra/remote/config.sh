#!/bin/bash
# Um lugar só para as decisões. Trocar de domínio ou de servidor é mexer aqui,
# e em nada mais.

# O endereço CANÔNICO: é o que fica na barra e o que o certificado cobre
# primeiro. Sem hífen, como no pedido original. Também nomeia o arquivo do
# Site: infra/caddy/$DOMINIO.caddy.
DOMINIO=ensinantesdigitais.chicofigueiredo.com.br

# Apelidos que também respondem. O 301 em si está no .caddy (infra/caddy/); aqui
# a lista serve ao passo 3 (conferir o DNS) e ao verificar.sh. Cada um
# precisa do seu próprio registro de DNS apontando para a VPS.
#
# Redirecionar em vez de servir os dois é de propósito: o basic auth guarda a
# senha POR ORIGEM no navegador. Servindo os dois nomes, entrar por um não
# valeria para o outro, e o Procópio veria a caixa de senha de novo achando
# que a dele parou de funcionar.
DOMINIOS_ALIAS=(ensinantes-digitais.chicofigueiredo.com.br)

# Acesso administrativo à VPS — usado só na instalação (passos 2 e 3).
#
# NÃO é `ssh.lojapopcorn.com.br`, que estava aqui antes por herança do
# focus-scrap. Medido: lojapopcorn resolve para 167.99.225.233, e os dois nomes
# do painel resolvem para 191.252.219.183, que é este. São máquinas
# diferentes — apontar para a errada faria o Caddy falhar na emissão do
# certificado, e o erro não diria "servidor errado".
VPS=root@ssh.chico-figueiredo.com.br

# Para onde o túnel disca no dia a dia. Mesmo servidor, usuário sem shell.
TUNEL_HOST=ssh.chico-figueiredo.com.br
TUNEL_USER=tunel-ensinantes

# A PORTA. Vale dos dois lados do túnel e TEM de bater com ED_PAINEL_PORTA
# do .env e com o reverse_proxy de infra/caddy/$DOMINIO.caddy (o passo 3 confere).
#
# É 17789, e não 17788, porque o túnel do focus-scrap já usa a 17788 — e isto
# foi MEDIDO neste servidor, não suposto: `ss -lntp` mostra o sshd escutando na
# 17788, e `focus.chicofigueiredo.com.br` está entre os Sites da Borda daqui.
# Repetir a porta derruba um dos dois de forma intermitente, e o sintoma é 502
# esporádico, que parece PC suspenso e não é.
PORTA=17789

# Dois usuários, duas senhas, num arquivo só (/etc/caddy/segredos/ensinantes.auth).
# O passo 3 grava cada uma UMA vez em senhas.txt.
USUARIOS_PAINEL=(chico procopio)

CHAVE="$HOME/.ssh/ensinantes_tunel"

# As rotas que rodam processo na máquina de casa (o 403 de fora) NÃO ficam mais
# aqui: estão no regex de infra/caddy/$DOMINIO.caddy. A lista canônica é
# ROTAS_ADMIN em src/usuario.ts. /api/sync NÃO pode entrar nela: é por ela que o
# tablet grava o que foi marcado e anotado. Bloqueá-la não deixa o painel
# somente-leitura, deixa quebrado, com a fila de escrita enchendo para sempre.
