FROM node:22-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace=@link-partner/web

COPY apps/web apps/web

ARG VITE_AUTH_MODE=oidc
ARG VITE_DATA_MODE=api
ARG VITE_API_URL=/api/v1
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID=link-partner-frontend
ARG VITE_HUB_URL
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE \
    VITE_DATA_MODE=$VITE_DATA_MODE \
    VITE_API_URL=$VITE_API_URL \
    VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_HUB_URL=$VITE_HUB_URL

RUN npm run build --workspace=@link-partner/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
