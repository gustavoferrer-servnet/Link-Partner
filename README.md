# Link Partner

Aplicación independiente para operar abastecimiento de conectividad, proveedores, cobertura, entrega y rentabilidad dentro del ecosistema Application Hub.

## Contrato con Application Hub

- Link Partner se publica como un `Application` con un `Deployment` compartido.
- Usa un client público propio de Keycloak: `link-partner-frontend`.
- Comparte el realm `application-hub`, pero mantiene usuarios, roles y datos de dominio en su propia base.
- El Hub valida el acceso base; Link Partner aplica sus permisos internos.
- La app ocupa la pantalla completa y siempre ofrece `Volver al Hub`.
- Ningún token o secreto viaja en query params.

## Estructura

```text
apps/web   React 19 + Vite + TypeScript
apps/api   Express + TypeScript + validación JWT/JWKS + Firestore
deploy     Contratos de catálogo, deployment, Caddy y Docker Compose
docs       Arquitectura, publicación y conceptos visuales
```

## Desarrollo local

```bash
npm install
npm run dev:api
npm run dev
```

En desarrollo, web y API usan datos de demostración. Producción exige `VITE_AUTH_MODE=oidc`, `DATA_BACKEND=firestore` y un client configurado en Keycloak.

## Validación

```bash
npm run check
npm run build
docker compose -f deploy/docker-compose.staging.yml config
```

Consulta [la guía de publicación](docs/PUBLISHING.md) antes de registrar el deployment en Application Hub.
