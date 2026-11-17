#!/bin/bash
# Passo 3 (roda daqui, age na VPS) — o Site no Caddy e as duas senhas.
#
#   ./3-vps-caddy.sh                     # mantém as senhas se o arquivo já existe
#   RENOVAR_SENHAS=1 ./3-vps-caddy.sh    # gera senhas novas para os dois usuários
#
# A Borda desta VPS é o Caddy (binário no host, sob systemd; ver o ADR 0003 do
# repositório vps). A configuração do Site mora AQUI, em
# infra/caddy/$DOMINIO.caddy, e este script a copia para /etc/caddy/sites/,
# valida e recarrega. O Caddy emite e renova o certificado sozinho (HTTP-01):
# não há certbot, dhparam nem redirecionamento 80→443 para cuidar.
#
# O script é aditivo: só escreve o arquivo deste Site e o das senhas. Se a
# validação falhar, restaura o arquivo anterior (ou remove o novo) ANTES de
# recarregar — um .caddy quebrado em /etc/caddy/sites/ derrubaria o próximo
# reload de todos os outros Sites.
#
# Pré-requisitos na VPS: Caddy instalado e rodando (usuário 'caddy', pasta
# /etc/caddy/sites/ importada pelo Caddyfile base) e apache2-utils (htpasswd).
# Pré-requisito no DNS: $DOMINIO e os apelidos já resolvendo para o IP da VPS.
set -euo pipefail
cd "$(dirname "$0")" && source ./config.sh

ARQUIVO_CADDY="../caddy/$DOMINIO.caddy"
ARQUIVO_AUTH=/etc/caddy/segredos/ensinantes.auth

# O .caddy e o config.sh são duas fontes da mesma verdade: o nome do arquivo, a
# porta do túnel e os apelidos. Se divergem, o site sobe apontando para o nada
# (502) ou sem o apelido — melhor recusar aqui do que descobrir de fora.
[[ -f "$ARQUIVO_CADDY" ]] || { echo "não achei $ARQUIVO_CADDY (o nome vem do DOMINIO em config.sh)"; exit 1; }
grep -qF "127.0.0.1:$PORTA" "$ARQUIVO_CADDY" || {
  echo "$ARQUIVO_CADDY não faz proxy para 127.0.0.1:$PORTA, a PORTA do config.sh."
  echo "Acerte os dois: a porta tem de ser a mesma nos dois lados do túnel."
  exit 1
}
for nome in ${DOMINIOS_ALIAS[@]+"${DOMINIOS_ALIAS[@]}"}; do
  grep -qF "$nome" "$ARQUIVO_CADDY" || { echo "o apelido $nome está no config.sh mas não em $ARQUIVO_CADDY"; exit 1; }
done

# Todos os nomes que o Caddy vai tentar emitir: o canônico primeiro, depois os
# apelidos. O Let's Encrypt valida CADA UM batendo na porta 80 daquele nome.
# Um apelido sem DNS não derruba o canônico (o Caddy emite um certificado por
# nome), mas o apelido ficaria sem HTTPS e o redirecionamento só quebraria na
# hora em que alguém digitasse aquele nome. Por isso a conferência é de todos.
TODOS_OS_NOMES=("$DOMINIO" ${DOMINIOS_ALIAS[@]+"${DOMINIOS_ALIAS[@]}"})

echo "conferindo o Caddy na VPS…"
ssh "$VPS" 'command -v caddy >/dev/null && id caddy >/dev/null && test -d /etc/caddy/sites' || {
  echo "  a VPS não tem o Caddy pronto (binário, usuário 'caddy' e /etc/caddy/sites/)."
  echo "  Este passo só vale depois da Virada para o Caddy — ver o ADR 0003 do repositório vps."
  exit 1
}

IP_VPS=$(ssh "$VPS" 'curl -s -4 ifconfig.me')
for nome in "${TODOS_OS_NOMES[@]}"; do
  echo "conferindo o DNS de $nome…"
  IP_DOM=$(getent hosts "$nome" | awk '{print $1}' | head -1)
  [[ "$IP_DOM" == "$IP_VPS" ]] || {
    echo "  $nome → ${IP_DOM:-nada} mas a VPS é $IP_VPS"
    echo "  Acerte o DNS antes: o Let's Encrypt valida batendo na porta 80 deste nome."
    exit 1
  }
  echo "  ok: $IP_DOM"
done

# As senhas.
#
# O arquivo /etc/caddy/segredos/ensinantes.auth tem uma linha 'usuario hash'
# por usuário (bcrypt), dono caddy:caddy, modo 600. O Caddy lê o arquivo ao
# carregar a configuração, então trocar uma senha pede um reload.
#
# Rodar o script de novo NÃO troca as senhas: quem já tem acesso não pode
# perdê-lo por um passo repetido. Para gerar novas, RENOVAR_SENHAS=1.
ARQUIVO_SENHAS="$(dirname "$0")/senhas.txt"
GEROU_SENHAS=0

if ssh "$VPS" "test -s '$ARQUIVO_AUTH'" && [[ "${RENOVAR_SENHAS:-0}" != 1 ]]; then
  echo
  echo "as senhas já existem em $ARQUIVO_AUTH — mantidas (RENOVAR_SENHAS=1 gera novas)"
  for usuario in "${USUARIOS_PAINEL[@]}"; do
    ssh "$VPS" "grep -q '^$usuario ' '$ARQUIVO_AUTH'" || {
      echo "  falta o usuário '$usuario' no arquivo de senhas da VPS."
      echo "  Rode com RENOVAR_SENHAS=1 (troca as senhas de TODOS) ou acrescente a linha à mão."
      exit 1
    }
  done
else
  # As senhas vão para um ARQUIVO, não para a tela.
  #
  # Quem roda isto pode ser um agente, e aí a saída do terminal vira transcrição
  # de conversa — credencial não tem lugar ali. O arquivo nasce com 600, está no
  # .gitignore, e a última linha deste script diz onde ele está. Leia, guarde no
  # seu gerenciador de senhas, apague.
  GEROU_SENHAS=1
  umask 077
  : > "$ARQUIVO_SENHAS"
  {
    echo "# Senhas do painel — $DOMINIO"
    echo "# Geradas em $(date '+%F %T'). Guarde e APAGUE este arquivo."
    echo "# Trocar depois: veja 'Trocar uma senha' no README desta pasta."
  } >> "$ARQUIVO_SENHAS"

  echo
  echo "gerando as senhas, uma por usuário…"
  LINHAS_AUTH=""
  for usuario in "${USUARIOS_PAINEL[@]}"; do
    senha="$(openssl rand -base64 15)"
    # A senha entra no htpasswd por stdin (-i): nunca em argv, onde ficaria
    # visível na lista de processos. -n imprime 'usuario:hash' em vez de gravar
    # arquivo; o Caddy quer 'usuario hash', então o ':' vira espaço.
    linha="$(printf '%s\n' "$senha" | ssh "$VPS" "htpasswd -niB '$usuario'")"
    LINHAS_AUTH+="${linha/:/ }"$'\n'
    printf '%s : %s\n' "$usuario" "$senha" >> "$ARQUIVO_SENHAS"
    echo "  $usuario: gerada"
    unset senha linha
  done

  # Grava num arquivo temporário e troca de nome no fim: o Caddy nunca vê o
  # arquivo pela metade.
  printf '%s' "$LINHAS_AUTH" | ssh "$VPS" "set -euo pipefail; umask 077
    install -d -o caddy -g caddy -m 750 '$(dirname "$ARQUIVO_AUTH")'
    cat > '$ARQUIVO_AUTH.novo'
    chown caddy:caddy '$ARQUIVO_AUTH.novo'
    chmod 600 '$ARQUIVO_AUTH.novo'
    mv '$ARQUIVO_AUTH.novo' '$ARQUIVO_AUTH'"
  unset LINHAS_AUTH
  echo
  echo "As senhas estão em: $ARQUIVO_SENHAS"
  echo "Na VPS só existe o bcrypt — de lá elas não voltam."
fi

# O Site.
#
# O .novo e o .bak não casam com o glob '*.caddy' do Caddyfile base, então
# ficam invisíveis ao Caddy até o momento certo. A validação lê o Caddyfile
# inteiro (todos os Sites + o arquivo das senhas), por isso o arquivo novo tem
# de estar no lugar para ser validado — e por isso o desfazer abaixo existe.
echo
echo "copiando o Site para a VPS, validando e recarregando o Caddy…"
ssh "$VPS" "cat > '/etc/caddy/sites/$DOMINIO.caddy.novo'" < "$ARQUIVO_CADDY"
ssh "$VPS" "DESTINO='/etc/caddy/sites/$DOMINIO.caddy' bash -s" <<'REMOTO'
set -euo pipefail
[ -e "$DESTINO" ] && cp -p "$DESTINO" "$DESTINO.bak"
install -m 644 -o root -g root "$DESTINO.novo" "$DESTINO"
rm -f "$DESTINO.novo"

if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  if [ -e "$DESTINO.bak" ]; then mv "$DESTINO.bak" "$DESTINO"; else rm -f "$DESTINO"; fi
  echo "a validação falhou; o arquivo anterior foi restaurado e o Caddy NÃO foi recarregado." >&2
  exit 1
fi
rm -f "$DESTINO.bak"
systemctl reload caddy
REMOTO

echo
echo "───────────────────────────────────────────────"
echo " https://$DOMINIO"
echo " apelidos com 301: ${DOMINIOS_ALIAS[*]:-nenhum}"
echo " usuários: ${USUARIOS_PAINEL[*]}"
if [[ $GEROU_SENHAS == 1 ]]; then
  echo " senhas novas em $ARQUIVO_SENHAS (leia, guarde, apague)"
else
  echo " senhas mantidas, só o bcrypt em $ARQUIVO_AUTH na VPS"
fi
echo " O certificado sai na primeira visita; acompanhe: journalctl -u caddy -f"
echo "───────────────────────────────────────────────"
