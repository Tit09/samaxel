# Image unique pour l'hébergement en ligne (Render) : API + site vitrine + application web + APK.
# Construite depuis la RACINE du dépôt (backend/ et site-vitrine/ côte à côte).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production SITE_DIR=/site PORT=3001
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/db ./db
COPY backend/data ./data
COPY backend/public ./public
COPY site-vitrine /site
RUN mkdir -p /app/keys /app/donnees && chown node:node /app/keys /app/donnees
USER node
EXPOSE 3001
CMD ["sh", "scripts/demarrage-cloud.sh"]
