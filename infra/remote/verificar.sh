#!/bin/bash
# Diagnóstico da corrente inteira, elo por elo. É o que responder quando o
# tablet mostrar 502 ou pedir senha para sempre.
#
#   ./verificar.sh                                   # tudo que dá sem senha
#   SENHA_CHICO='...' SENHA_PROCOPIO='...' ./verificar.sh   # inclui as autenticadas
cd "$(dirname "$0")" && source ./config.sh
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

falhou=0
ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; }
nao()  { printf '  \033[31mfalha\033[0m %s\n' "$1"; falhou=1; }
dica() { printf '        ↳ %s\n' "$1"; }

echo
echo "1. a porta combinada ($PORTA)"
ENV_PORTA=$(grep -oP '^ED_PAINEL_PORTA=\K.*' ../../.env 2>/dev/null || true)
if [[ -z "$ENV_PORTA" ]]; then
  nao ".env não fixa ED_PAINEL_PORTA — 'bun run painel' vai abrir na 17789 padrão do config.ts, ou onde o processo mandar"
  dica "acrescente ED_PAINEL_PORTA=$PORTA ao .env"
elif [[ "$ENV_PORTA" != "$PORTA" ]]; then
  nao ".env diz $ENV_PORTA, o túnel usa $PORTA"
  dica "os dois têm de bater; ajuste o .env ou o config.sh"
else
  ok ".env e túnel combinam na $PORTA"
fi

echo
echo "2. o painel, aqui"
# É o painel mesmo, e não qualquer coisa escutando: procuro o título da
# página. Há outros 'bun' na máquina, então achar pelo nome do processo erraria.
eh_painel() { curl -s --max-time 2 "http://127.0.0.1:$1/" 2>/dev/null | grep -q '<title>Ensinantes Digitais</title>'; }

if eh_painel "$PORTA"; then
  ok "respondendo em 127.0.0.1:$PORTA"
else
  nao "nada em 127.0.0.1:$PORTA"
  # Se o painel pulou de porta (a pedida estava ocupada), local funciona e
  # remoto vira 502 — o caso mais chato de diagnosticar.
  OUTRA=""
  for p in $(seq $((PORTA + 1)) $((PORTA + 19))); do
    if eh_painel "$p"; then OUTRA=$p; break; fi
  done
  if [[ -n "$OUTRA" ]]; then
    dica "o painel está na $OUTRA: a $PORTA estava ocupada e ele pulou"
    dica "libere a $PORTA (ss -lntp 'sport = :$PORTA') e reinicie o painel"
  else
    dica "inicie com: bun run painel"
  fi
fi

echo
echo "3. o túnel, daqui até o droplet"
if [[ "$(systemctl --user is-active ensinantes-tunel 2>/dev/null)" == "active" ]]; then
  ok "ensinantes-tunel.service de pé (reinícios: $(systemctl --user show ensinantes-tunel -p NRestarts --value))"
else
  nao "ensinantes-tunel.service parado"
  dica "systemctl --user restart ensinantes-tunel && journalctl --user -u ensinantes-tunel -n 30"
fi

echo
echo "4. a ponta do túnel, no droplet"
PONTA=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$DROPLET" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:$PORTA/" 2>/dev/null || echo erro)
[[ "$PONTA" == "200" ]] \
  && ok "o droplet enxerga o painel (HTTP $PONTA)" \
  || { nao "o droplet não enxerga o painel (HTTP $PONTA)"; dica "se 1 a 3 estão ok, o túnel caiu agora — reinicie o serviço"; }

echo
echo "5. a porta pública"
SEM=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMINIO/")
[[ "$SEM" == "401" ]] \
  && ok "exige senha (HTTP 401)" \
  || nao "esperava 401 sem senha, veio $SEM"

if [[ -n "${SENHA_CHICO:-}" ]]; then
  COM=$(curl -s -u "chico:$SENHA_CHICO" -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMINIO/")
  [[ "$COM" == "200" ]] && ok "chico abre com a senha (HTTP 200)" || nao "chico com a senha veio $COM"

  BLO=$(curl -s -u "chico:$SENHA_CHICO" -X POST -o /dev/null -w '%{http_code}' \
        --max-time 20 "https://$DOMINIO/api/run")
  [[ "$BLO" == "403" ]] && ok "rotas de execução barradas (HTTP 403)" || nao "/api/run devolveu $BLO, esperava 403"

  RANGE=$(curl -s -u "chico:$SENHA_CHICO" -r 0-1023 -o /dev/null -w '%{http_code}' \
          --max-time 20 "https://$DOMINIO/api/video?id=1")
  [[ "$RANGE" == "206" ]] \
    && ok "vídeo com Range (HTTP 206) — o seek do player funciona" \
    || printf '  \033[33maviso\033[0m /api/video?id=1 devolveu %s (o item pode não existir com esse id)\n' "$RANGE"
else
  printf '  \033[33maviso\033[0m sem SENHA_CHICO no ambiente: pulei as conferências de chico\n'
fi

if [[ -n "${SENHA_PROCOPIO:-}" ]]; then
  EU=$(curl -s -u "procopio:$SENHA_PROCOPIO" --max-time 20 "https://$DOMINIO/api/eu")
  echo "$EU" | grep -q '"usuario":"procopio"' \
    && ok "procopio autentica e o painel o reconhece como procopio" \
    || nao "esperava usuario:procopio em /api/eu, veio: $EU"

  # O TESTE QUE IMPORTA: um header X-Painel-Usuario forjado pelo cliente tem
  # de ser ignorado — quem manda é o proxy_set_header do nginx, não o que veio
  # na requisição. Se isto vier "chico", o controle de acesso remoto é
  # decorativo: pare e conserte antes de passar a senha ao Procópio.
  FORJADO=$(curl -s -u "procopio:$SENHA_PROCOPIO" -H 'X-Painel-Usuario: chico' \
            --max-time 20 "https://$DOMINIO/api/eu")
  echo "$FORJADO" | grep -q '"usuario":"procopio"' \
    && ok "header X-Painel-Usuario forjado pelo cliente é ignorado" \
    || nao "com header forjado veio: $FORJADO — o nginx não está sobrescrevendo o header"
else
  printf '  \033[33maviso\033[0m sem SENHA_PROCOPIO no ambiente: pulei as conferências de procopio\n'
fi

# Cada apelido tem de responder 301 para o canônico, e sob HTTPS — ou seja, o
# certificado precisa cobrir o apelido também. Um apelido que ficou de fora do
# certbot só falha na hora em que alguém digita aquele nome, com aviso de
# segurança no navegador, e não na instalação.
for apelido in ${DOMINIOS_ALIAS[@]+"${DOMINIOS_ALIAS[@]}"}; do
  DESTINO=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 20 "https://$apelido/")
  case "$DESTINO" in
    "https://$DOMINIO/"*) ok "$apelido redireciona para o canônico" ;;
    "") nao "$apelido não redirecionou (certificado não cobre este nome?)" ;;
    *)  nao "$apelido redirecionou para $DESTINO, e não para https://$DOMINIO/" ;;
  esac
done

echo
[[ $falhou -eq 0 ]] && echo "tudo certo." || echo "há elo quebrado acima."
exit $falhou
