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
