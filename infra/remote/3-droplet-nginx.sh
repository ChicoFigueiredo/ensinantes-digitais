#!/bin/bash
# Passo 3 (roda daqui, age no droplet) — TLS, as duas senhas e proxy para a
# ponta do túnel.
#
#   ./3-droplet-nginx.sh
#
# Este droplet já servia outros sites quando isto foi escrito, então o script é
# aditivo por princípio: cria um arquivo novo em sites-available, liga em
# sites-enabled e passa por `nginx -t` antes de recarregar. Não edita nem lê
# configuração de outro site.
#
# Pré-requisitos no droplet: nginx, certbot com plugin nginx, apache2-utils
# (htpasswd). Pré-requisito no DNS: $DOMINIO já resolvendo para o IP do droplet.
set -euo pipefail
cd "$(dirname "$0")" && source ./config.sh

echo "conferindo o DNS de $DOMINIO…"
IP_DOM=$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1)
IP_DROP=$(ssh "$DROPLET" 'curl -s -4 ifconfig.me')
[[ "$IP_DOM" == "$IP_DROP" ]] || {
  echo "  $DOMINIO → ${IP_DOM:-nada} mas o droplet é $IP_DROP"
  echo "  Acerte o DNS antes: o Let's Encrypt valida batendo na porta 80 deste nome."
  exit 1
}
echo "  ok: $IP_DOM"

echo
echo "gerando as senhas no droplet, uma por usuário — cada uma aparece UMA vez,"
echo "agora:"
echo
# Duas entradas: a primeira cria o arquivo (-c), as seguintes acrescentam.
primeiro=1
for usuario in "${USUARIOS_PAINEL[@]}"; do
  senha="$(openssl rand -base64 15)"
  if [[ $primeiro == 1 ]]; then
    ssh "$DROPLET" "htpasswd -bcB /etc/nginx/ensinantes.htpasswd '$usuario' '$senha'" >/dev/null
    primeiro=0
  else
    ssh "$DROPLET" "htpasswd -bB /etc/nginx/ensinantes.htpasswd '$usuario' '$senha'" >/dev/null
  fi
  echo "  $usuario : $senha"
done
echo
echo "Anote agora — daqui em diante só existe o bcrypt no droplet."

ssh "$DROPLET" 'chmod 640 /etc/nginx/ensinantes.htpasswd && chown root:www-data /etc/nginx/ensinantes.htpasswd'

ssh "$DROPLET" "DOMINIO='$DOMINIO' PORTA='$PORTA' EMAIL='$EMAIL_CERT' BLOQ='$ROTAS_BLOQUEADAS' bash -s" <<'REMOTO'
set -euo pipefail

# auth_basic vai DENTRO das locations, nunca no server. Se fosse no server, a
# location que o certbot injeta para o desafio do Let's Encrypt nasceria atrás
# da senha e a emissão do certificado falharia.
cat > "/etc/nginx/sites-available/$DOMINIO" <<EOF
# Painel do ensinantes-digitais, que roda na máquina de casa e chega aqui por
# um túnel SSH reverso. 502 significa que o túnel chegou mas não achou o
# painel do outro lado — PC desligado, painel parado, ou painel em outra
# porta.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMINIO;

    # Rotas que rodam processo na máquina de casa: disparar transcrição, abrir
    # arquivo no Explorer, apagar recortes. Do tablet se assiste e se marca
    # aula como vista — não se dispara processo daqui. Precisa bater com
    # ROTAS_ADMIN em src/usuario.ts: as duas tranças protegem coisas
    # diferentes, o nginx o acesso remoto e o app um nginx mal configurado.
    location ~ ^/api/($BLOQ)\$ {
        auth_basic "Ensinantes Digitais";
        auth_basic_user_file /etc/nginx/ensinantes.htpasswd;
        return 403;
    }

    location / {
        auth_basic           "Ensinantes Digitais";
        auth_basic_user_file /etc/nginx/ensinantes.htpasswd;

        # É ISTO que o painel lê para saber quem está do outro lado. Sem esta
        # linha, todo acesso remoto chega como 'chico' — e o Procópio passa a
        # ver os cards de disco, a fila e os caminhos do sistema de arquivos.
        #
        # E é isto que barra o cliente de se declarar 'chico' na mão: o
        # proxy_set_header SOBRESCREVE o cabeçalho que veio na requisição, não
        # acrescenta — o valor que o painel recebe é sempre o que o nginx
        # decidiu aqui, nunca o que o navegador mandou. Confira isso no passo
        # 6 do README: é a diferença entre o controle valer e ser decorativo.
        proxy_set_header X-Painel-Usuario \$remote_user;

        proxy_pass http://127.0.0.1:$PORTA;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Vídeo sai do disco de casa em tempo real: buffering aqui só atrasa o
        # primeiro frame, e o Range precisa passar inteiro para o seek do
        # player funcionar.
        proxy_buffering off;
        proxy_read_timeout 3600s;
        client_max_body_size 16m;
    }
}
EOF

ln -sfn "/etc/nginx/sites-available/$DOMINIO" "/etc/nginx/sites-enabled/$DOMINIO"
nginx -t
systemctl reload nginx

# --redirect põe o 301 de http para https. A renovação já fica agendada pelo
# próprio certbot (systemd timer).
certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m "$EMAIL" --redirect
REMOTO

echo
echo "───────────────────────────────────────────────"
echo " https://$DOMINIO"
echo " usuários: ${USUARIOS_PAINEL[*]} (senhas impressas acima, uma vez só)"
echo "───────────────────────────────────────────────"
