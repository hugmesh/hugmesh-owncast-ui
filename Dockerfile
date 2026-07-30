# hugmesh-owncast-ui — builds the Owncast management native-federation REMOTE
# (src → dist/owncast/browser) and serves it via nginx with CORS so the
# hugmesh.systems host can fetch its remoteEntry.json cross-origin.
#
# Serves on :8080 to MATCH the federation-api owncast module registration:
#   remote_entry_url = http://hugmesh-owncast-ui:8080/remoteEntry.json
# The remoteEntry.json the production build emits exposes ./Owncast (the host
# loadRemoteModule('owncast','./Owncast') mounts OWNCAST_ROUTES at /owncast).
#
# visibility=internal: the owncast remote is reachable only behind the gateway's
# /owncast=ROLE_OWNCAST route-access gate — it is NOT a public surface. Deployed
# to hugmesh-frontend. Consumes same-origin /bff/owncast/** (the
# hugmesh-owncast-bff-api stream self-service + broadcast grant/timeout/ban
# overlay). Angular CLI 22 requires Node >= 24.15.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:owncast

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/owncast/browser /usr/share/nginx/html
EXPOSE 8080
