#!/bin/sh
set -eu

KCADM=/opt/keycloak/bin/kcadm.sh
REALM=application-hub
CANONICAL_HOST=ai-stg-node02.serv.net.mx
LEGACY_HOST=201.150.35.186

"$KCADM" config credentials \
  --server http://127.0.0.1:8080 \
  --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
  --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

update_client() {
  client_id="$1"
  port="$2"
  client_uuid="$($KCADM get clients -r "$REALM" -q "clientId=$client_id" --fields id | tr -d '\n ' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"

  if [ -z "$client_uuid" ]; then
    printf 'No se encontró el cliente %s\n' "$client_id" >&2
    exit 1
  fi

  "$KCADM" get "clients/$client_uuid" -r "$REALM" > "/tmp/$client_id.before-canonical-domain.json"
  "$KCADM" update "clients/$client_uuid" -r "$REALM" \
    -s "redirectUris=[\"https://$LEGACY_HOST:$port/*\",\"https://$CANONICAL_HOST:$port/*\"]" \
    -s "webOrigins=[\"https://$LEGACY_HOST:$port\",\"https://$CANONICAL_HOST:$port\"]"

  printf '%s actualizado para %s\n' "$client_id" "$CANONICAL_HOST"
}

update_client application-hub-frontend 4443
update_client san-uptime 3443
update_client san-uptime-dino 3444
update_client capa1 3445
