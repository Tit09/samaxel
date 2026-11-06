'use strict';
const Redis = require('ioredis');
const env = require('./env');

const { url, ...hote } = env.redis;
const options = {
  lazyConnect: env.isTest,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => (times > 10 ? null : 2000),
};
// REDIS_URL (redis:// ou rediss:// avec TLS) : Render Key Value, Upstash… ; sinon hôte + port
const redis = url ? new Redis(url, options) : new Redis({ ...hote, ...options });

redis.on('error', (err) => {
  console.error('[Redis] Erreur de connexion :', err.message);
});

module.exports = redis;
