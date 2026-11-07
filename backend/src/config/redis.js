'use strict';
const Redis = require('ioredis');
const env = require('./env');

const { url, ...hote } = env.redis;
const options = {
  lazyConnect: env.isTest,
  maxRetriesPerRequest: 3,
  // Ne jamais abandonner : après une panne de Redis, même longue, l'API se reconnecte seule
  // (attente croissante jusqu'à 5 s). Défaut trouvé grâce à Uptime Kuma : l'ancienne règle
  // abandonnait après 10 essais et l'API restait « dégradée » même Redis revenu.
  retryStrategy: (times) => Math.min(times * 500, 5000),
};
// REDIS_URL (redis:// ou rediss:// avec TLS) : Render Key Value, Upstash… ; sinon hôte + port
const redis = url ? new Redis(url, options) : new Redis({ ...hote, ...options });

redis.on('error', (err) => {
  console.error('[Redis] Erreur de connexion :', err.message);
});

module.exports = redis;
