FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
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
