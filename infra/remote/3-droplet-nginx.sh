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

# Todos os nomes que vão para o certificado: o canônico primeiro, depois os
# apelidos. O Let's Encrypt valida CADA UM batendo na porta 80 daquele nome —
# um apelido sem DNS não dá aviso, derruba a emissão inteira e deixa o site
# sem certificado nenhum. Por isso a conferência é de todos, antes de começar.
TODOS_OS_NOMES=("$DOMINIO" ${DOMINIOS_ALIAS[@]+"${DOMINIOS_ALIAS[@]}"})

IP_DROP=$(ssh "$DROPLET" 'curl -s -4 ifconfig.me')
for nome in "${TODOS_OS_NOMES[@]}"; do
  echo "conferindo o DNS de $nome…"
  IP_DOM=$(getent hosts "$nome" | awk '{print $1}' | head -1)
  [[ "$IP_DOM" == "$IP_DROP" ]] || {
    echo "  $nome → ${IP_DOM:-nada} mas o droplet é $IP_DROP"
    echo "  Acerte o DNS antes: o Let's Encrypt valida batendo na porta 80 deste nome."
    exit 1
  }
  echo "  ok: $IP_DOM"
done

# As senhas vão para um ARQUIVO, não para a tela.
#
# Quem roda isto pode ser um agente, e aí a saída do terminal vira transcrição
# de conversa — credencial não tem lugar ali. O arquivo nasce com 600, está no
# .gitignore, e a última linha deste script diz onde ele está. Leia, guarde no
# seu gerenciador de senhas, apague.
ARQUIVO_SENHAS="$(dirname "$0")/senhas.txt"
umask 077
: > "$ARQUIVO_SENHAS"
{
  echo "# Senhas do painel — $DOMINIO"
  echo "# Geradas em $(date '+%F %T'). Guarde e APAGUE este arquivo."
  echo "# Trocar depois: veja 'Trocar uma senha' no README desta pasta."
} >> "$ARQUIVO_SENHAS"

echo
echo "gerando as senhas no droplet, uma por usuário…"
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
  printf '%s : %s\n' "$usuario" "$senha" >> "$ARQUIVO_SENHAS"
  echo "  $usuario: gravada"
  unset senha
done
echo
echo "As senhas estão em: $ARQUIVO_SENHAS"
echo "No droplet só existe o bcrypt — de lá elas não voltam."

ssh "$DROPLET" 'chmod 640 /etc/nginx/ensinantes.htpasswd && chown root:www-data /etc/nginx/ensinantes.htpasswd'

ssh "$DROPLET" "DOMINIO='$DOMINIO' ALIASES='${DOMINIOS_ALIAS[*]-}' PORTA='$PORTA' EMAIL='$EMAIL_CERT' BLOQ='$ROTAS_BLOQUEADAS' bash -s" <<'REMOTO'
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

# Os apelidos NÃO servem o painel: só mandam para o canônico. Ver o porquê em
# config.sh — o navegador guarda a senha do auth_basic por origem, e servir os
# dois nomes faria a senha parecer ter parado de funcionar ao trocar de nome.
if [ -n "${ALIASES// /}" ]; then
  {
    echo "server {"
    echo "    listen 80;"
    echo "    listen [::]:80;"
    echo "    server_name $ALIASES;"
    echo "    return 301 https://$DOMINIO\$request_uri;"
    echo "}"
  } > "/etc/nginx/sites-available/$DOMINIO.apelidos"
  ln -sfn "/etc/nginx/sites-available/$DOMINIO.apelidos" "/etc/nginx/sites-enabled/$DOMINIO.apelidos"
fi

ln -sfn "/etc/nginx/sites-available/$DOMINIO" "/etc/nginx/sites-enabled/$DOMINIO"
nginx -t
systemctl reload nginx

# --redirect põe o 301 de http para https. A renovação já fica agendada pelo
# próprio certbot (systemd timer).
# Um -d por nome. O primeiro é o canônico e nomeia o diretório do
# certificado em /etc/letsencrypt/live/.
ARGS_D=(-d "$DOMINIO")
for a in $ALIASES; do ARGS_D+=(-d "$a"); done
certbot --nginx "${ARGS_D[@]}" --non-interactive --agree-tos -m "$EMAIL" --redirect
REMOTO

echo
echo "───────────────────────────────────────────────"
echo " https://$DOMINIO"
echo " apelidos com 301: ${DOMINIOS_ALIAS[*]:-nenhum}"
echo " usuários: ${USUARIOS_PAINEL[*]} — senhas em $ARQUIVO_SENHAS (leia, guarde, apague)"
echo "───────────────────────────────────────────────"
