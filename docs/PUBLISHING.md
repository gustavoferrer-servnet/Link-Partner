# Publicación en Application Hub staging

## 1. DNS y red Docker

1. El nodo de staging usa el dominio canónico `ai-stg-node02.serv.net.mx` y Link Partner se publica en `https://ai-stg-node02.serv.net.mx:3446`.
2. La red Docker compartida validada es `app-hub-staging_default`; si cambia, configura `APP_HUB_NETWORK`.
3. En el stack actual, aplica `deploy/Caddyfile.ai-stg-node02`; el servicio `link-partner-edge` publica `3446:3446` y lo conduce al Caddy existente sin recrearlo.
4. El dominio canónico usa un certificado público de Let's Encrypt administrado por Caddy. Mantén el puerto 80 accesible para el desafío HTTP-01 y la renovación automática. Los endpoints heredados por IP conservan `tls internal`.

## 2. Keycloak

Crea el client público `link-partner-frontend` en el realm `application-hub`:

- Standard Flow: habilitado.
- PKCE: S256.
- Direct Access Grants: deshabilitado.
- Valid redirect URI: `https://ai-stg-node02.serv.net.mx:3446/callback`.
- Web origin: `https://ai-stg-node02.serv.net.mx:3446`.
- Client authentication: deshabilitado.
- Audience mapper: usa `oidc-audience-mapper` con `included.client.audience=link-partner-frontend` y habilita el claim en el access token. La definición reproducible está en `deploy/keycloak-audience-mapper.link-partner.json` y también forma parte de `deploy/keycloak-client.link-partner.json`.

No se crea ni se distribuye un client secret para la SPA.

## 3. Firestore

1. Crea o selecciona la base destinada a Link Partner.
2. Despliega `firestore.rules` para negar acceso directo desde clientes.
3. Otorga al contenedor API una identidad con permisos mínimos sobre esa base.
4. Crea el primer documento de `users` unido al `authUid` del administrador, o usa temporalmente `BOOTSTRAP_ADMIN_EMAILS` con el correo completo y en minúsculas (por ejemplo, `administrador@empresa.example`).

En staging, `DATA_BACKEND=file` guarda proveedores y coberturas normalizadas en `/app/data/link-partner-state.json`, respaldado por el volumen Docker `link-partner-staging_data`. El servicio de inicialización asigna el volumen al usuario `node` antes de iniciar la API. No elimines ese volumen al recrear los contenedores.

## 4. Contenedores

Parte de `deploy/ai-stg-node02.env.example`, completa únicamente los valores de infraestructura pendientes y ejecuta desde la raíz de Link Partner:

```bash
docker compose --env-file .env -f deploy/docker-compose.staging.yml up -d --build
```

Si el daemon remoto no tiene salida a los registries, compila web/API previamente y usa `deploy/Dockerfile.web.prebuilt` y `deploy/Dockerfile.api.prebuilt`. Esos Dockerfiles son un mecanismo de entrega offline; la construcción reproducible normal sigue siendo la de los Dockerfiles de cada aplicación.

Verifica:

```bash
curl -fsS https://ai-stg-node02.serv.net.mx:3446/api/health
```

## 5. Catálogo del Hub

1. Crea la aplicación usando `deploy/app-hub.application.template.json`.
2. Define `LINK_PARTNER_ACTOR_EMAIL` con el usuario interno que registrará la aplicación y ejecuta `deploy/register-link-partner.mongosh.js`.
3. Usa `deploy/app-hub.deployment.ai-stg-node02.json` y crea el deployment bajo el slug `link-partner`.
4. Asigna la aplicación al tenant de Servnet y concede acceso al grupo piloto.
5. Abre Link Partner desde el catálogo y confirma SSO, retorno al Hub y rechazo de un usuario sin acceso interno.

## Gate de publicación

- Build web y API correctos.
- Contenedores saludables.
- HTTPS válido.
- Redirect URI exacta en Keycloak.
- API rechaza token ausente, inválido y usuario sin rol.
- Un tenant externo no puede consultar oportunidades ni precios de otro.
- `Volver al Hub` funciona desde ruta raíz y detalle.
- No hay secretos en bundle, logs o query params.
