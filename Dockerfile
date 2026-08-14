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
# --base-href is REQUIRED, not cosmetic. Without it Angular emits asset URLs
# rooted at / , but the gateway serves this app under /owncast/ — so every
# bundle request lands on the SPA catch-all and comes back as index.html with
# HTTP 200 and content-type text/html instead of JS. The browser then fails
# with a syntax/JSON parse error on markup, which reads as a corrupt build
# rather than a routing problem. tube-ui and user-ui already carry this flag.
RUN npm run build:owncast -- --base-href=/owncast/

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/owncast/browser /usr/share/nginx/html
EXPOSE 8080

#### Runtime THEME injection (the fleet-wide login-ui 50-snap-theme.sh
#### mechanism; see hugmesh-host-shell PR #11 for the full rationale). The hook
#### writes $SNAP_THEME_CSS verbatim at container start; nginx serves it via
#### the exact-match /snap-theme.css alias. /tmp, NOT the docroot: on the
#### nginx-unprivileged images uid 101 cannot write the docroot, and on the
#### root images /tmp is equally correct — ONE stanza for the whole fleet.
#### COPY --chmod, NOT COPY + RUN chmod: unprivileged final stages run as
#### uid 101 and a RUN chmod on root-owned COPY output exits 1 (BuildKit is
#### always on for this stack: Makefile DOCKER_BUILDKIT=1).
COPY --chmod=0755 docker-entrypoint.d/50-snap-theme.sh /docker-entrypoint.d/50-snap-theme.sh
ENV SNAP_THEME_OUT=/tmp/snap-theme.css
