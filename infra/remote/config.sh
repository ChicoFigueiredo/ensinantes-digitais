#!/bin/bash
# Um lugar só para as decisões. Trocar de domínio ou de servidor é mexer aqui,
# e em nada mais.

# O endereço CANÔNICO: é o que fica na barra e o que o certificado cobre
# primeiro. Sem hífen, como no pedido original.
DOMINIO=ensinantesdigitais.chicofigueiredo.com.br

# Apelidos que também respondem. Cada um recebe 301 para o canônico, e cada um
# precisa do seu próprio registro de DNS apontando para o droplet.
#
# Redirecionar em vez de servir os dois é de propósito: o auth_basic guarda a
# senha POR ORIGEM no navegador. Servindo os dois nomes, entrar por um não
# valeria para o outro, e o Procópio veria a caixa de senha de novo achando
# que a dele parou de funcionar.
DOMINIOS_ALIAS=(ensinantes-digitais.chicofigueiredo.com.br)

# Acesso administrativo ao servidor — usado só na instalação (passos 2 e 3).
#
# NÃO é `ssh.lojapopcorn.com.br`, que estava aqui antes por herança do
# focus-scrap. Medido: lojapopcorn resolve para 167.99.225.233, e os dois nomes
# do painel resolvem para 191.252.219.183, que é este. São máquinas
# diferentes — apontar para a errada faria o certbot falhar na validação, e o
# erro não diria "servidor errado".
DROPLET=root@ssh.chico-figueiredo.com.br

# Para onde o túnel disca no dia a dia. Mesmo servidor, usuário sem shell.
TUNEL_HOST=ssh.chico-figueiredo.com.br
TUNEL_USER=tunel-ensinantes

# A PORTA. Vale dos dois lados do túnel e TEM de bater com ED_PAINEL_PORTA
# do .env.
#
# É 17789, e não 17788, porque o túnel do focus-scrap já usa a 17788 — e isto
# foi MEDIDO neste servidor, não suposto: `ss -lntp` mostra o sshd escutando na
# 17788, e `focus.chicofigueiredo.com.br` está entre os sites do nginx daqui.
# Repetir a porta derruba um dos dois de forma intermitente, e o sintoma é 502
# esporádico, que parece PC suspenso e não é.
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
