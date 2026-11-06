'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const { apiLimiter } = require('./middlewares/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', 1); // derrière Nginx : vraie IP du client

app.use(helmet());
// CORS : seul le site vitrine (et l'app web) peuvent appeler l'API depuis un navigateur.
// Les applications mobiles ne sont pas concernées par CORS.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || env.corsOrigins.includes(origin) || (!env.isProd && origin === 'null') || (!env.isProd && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin))) {
      return cb(null, true);
    }
    return cb(null, false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Structure-Id', 'X-Jeton-Depot'],
  maxAge: 600,
}));
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/dons/webhook')) req.rawBody = buf.toString(); },
}));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'sama-xhel-sante', version: '1.0.0' }));
// Logos et photos des établissements partenaires (fichiers publics, mis en cache 7 jours)
app.use('/media', express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '7d', index: false, dotfiles: 'ignore',
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}));
// Application Android à télécharger (fichiers .apk déposés dans public/telechargements)
app.use('/telechargements', express.static(path.join(__dirname, '..', 'public', 'telechargements'), {
  index: false, dotfiles: 'ignore', maxAge: '1h',
  setHeaders: (res, fichier) => {
    if (fichier.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fichier)}"`);
    }
  },
}));
app.use('/api', apiLimiter, routes);

// Version web de l'application (ordinateur, tablette, iPhone dans Safari) : dossier public/app
const APP_WEB = path.join(__dirname, '..', 'public', 'app');
if (fs.existsSync(path.join(APP_WEB, 'index.html'))) {
  app.use('/app', helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", "'unsafe-inline'"], // moteur de rendu Flutter (WebAssembly)
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://fonts.gstatic.com', 'https://tiles.openfreemap.org', 'https://tile.openstreetmap.org'],
      workerSrc: ["'self'", 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  }), express.static(APP_WEB, { index: 'index.html', dotfiles: 'ignore', maxAge: 0 }));
}

// Site vitrine servi par le même serveur (PC de test, puis serveur en ligne) : une seule adresse à retenir.
// Politique de sécurité du contenu propre au site : carte OpenFreeMap, polices Google, voix du navigateur.
const SITE = process.env.SITE_DIR || path.join(__dirname, '..', '..', 'site-vitrine');
if (fs.existsSync(path.join(SITE, 'index.html'))) {
  const cspSite = helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"], // repli d'image (onerror) des fiches de l'annuaire
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://tiles.openfreemap.org'],
      workerSrc: ["'self'", 'blob:'],
      childSrc: ['blob:'],
      mediaSrc: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null, // le PC de test est en http sur le Wi-Fi local ; en ligne, Caddy impose HTTPS
    },
  });
  // Chaque établissement a SA page : /etablissement/cepiad, et l'écran de sa salle d'attente
  const codeOk = (req, res, next) => (/^[a-z0-9][a-z0-9-]{1,39}$/.test(req.params.code) ? next() : res.status(404).end());
  app.get('/etablissement/:code', cspSite, codeOk, (req, res) => res.sendFile(path.join(SITE, 'etablissement.html')));
  app.get('/etablissement/:code/file', cspSite, codeOk, (req, res) => res.sendFile(path.join(SITE, 'file.html')));
  app.use('/', cspSite, express.static(SITE, { index: 'index.html', dotfiles: 'ignore', maxAge: env.isProd ? '1h' : 0 }));
}
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
