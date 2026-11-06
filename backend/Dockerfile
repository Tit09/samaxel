FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Dépendances de production, puis on RETIRE npm de l'image : inutile à l'exécution, il embarque
# ses propres bibliothèques (failles signalées par Trivy). Moins de logiciels = moins de surface d'attaque.
RUN npm ci --omit=dev && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY src ./src
COPY scripts ./scripts
COPY db ./db
COPY data ./data
COPY public ./public
# Dossiers inscriptibles (clés JWT, données de démonstration) pour l'utilisateur non privilégié
RUN mkdir -p /app/keys /app/donnees && chown node:node /app/keys /app/donnees
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "src/server.js"]
