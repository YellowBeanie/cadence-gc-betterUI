# App d'entraînement — cible : serveur cible (x86_64).
# node:sqlite est intégré à Node : aucun module natif, donc aucune compilation.
FROM node:24-slim AS deps
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /build
COPY --from=deps /build/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runner
# Aligné sur l'utilisateur du stack (uid 1000) : sinon les fichiers écrits dans training.db
# seraient root-owned et exclus du restic off-site.
USER 1000:1000
WORKDIR /app
ENV NODE_ENV=production \
    GARMIN_DATA_DIR=/work \
    NODE_OPTIONS=--no-warnings \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=1000:1000 /build/.next/standalone ./
COPY --from=builder --chown=1000:1000 /build/.next/static ./.next/static
COPY --from=builder --chown=1000:1000 /build/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
