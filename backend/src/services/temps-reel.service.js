'use strict';
/**
 * TEMPS RÉEL (Socket.IO) — remplace LiveKit.
 *
 *  • Messagerie : quand un message chiffré arrive, le destinataire est prévenu instantanément
 *    (« message:nouveau ») et recharge la conversation. Le serveur ne relaie QUE l'identifiant
 *    de la conversation : le contenu reste chiffré de bout en bout (il ne transite pas par ici).
 *  • Visio : signalisation WebRTC (offre, réponse, candidats ICE) entre les deux participants
 *    d'une téléconsultation. Les flux audio/vidéo vont directement d'un appareil à l'autre,
 *    chiffrés DTLS-SRTP ; s'ils ne passent pas (réseau mobile), ils transitent par NOTRE relais
 *    TURN (coturn), toujours chiffrés. Aucun service vidéo étranger.
 *  • Appels audio/vidéo d'une conversation : invitation « appel:entrant » sur la salle de
 *    l'utilisateur, puis salle « appel:<id> » réservée aux deux participants (contrôle RLS).
 *  • Sécurité : jeton de connexion vérifié à l'ouverture (signature, expiration, liste noire) ;
 *    une salle de visio n'est accessible qu'aux participants de la consultation (contrôle en base).
 */
const crypto = require('crypto');
const { Server } = require('socket.io');
const env = require('../config/env');
const tokens = require('./token.service');
const { withContext } = require('../config/database');

let io = null;

/** Serveurs ICE : STUN public + TURN de SAMA XHEL (identifiants temporaires, 1 h) */
function serveursIce(userId) {
  const liste = [{ urls: ['stun:stun.l.google.com:19302'] }];
  const { url, secret } = env.turn;
  if (url && secret) {
    // API REST de coturn (use-auth-secret) : nom = expiration:utilisateur, mot de passe = HMAC-SHA1
    const nom = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
    const credential = crypto.createHmac('sha1', secret).update(nom).digest('base64');
    liste.push({ urls: url.split(',').map((u) => u.trim()), username: nom, credential });
  }
  return liste;
}

function attacher(serveurHttp) {
  io = new Server(serveurHttp, {
    path: '/socket.io',
    cors: { origin: env.isProd ? env.corsOrigins : true, credentials: false },
    maxHttpBufferSize: 64 * 1024, // signalisation seulement : pas de gros fichiers
  });

  io.use(async (socket, next) => {
    try {
      const jeton = socket.handshake.auth?.token;
      if (!jeton) throw new Error('jeton manquant');
      const d = tokens.verifyAccess(jeton);
      if (await tokens.isBlacklisted(d.jti)) throw new Error('session fermée');
      socket.data.user = { id: d.sub, role: d.role, structure_id: d.structure_id || null };
      next();
    } catch (e) {
      next(new Error(`Non autorisé : ${e.message}`));
    }
  });

  io.on('connection', (socket) => {
    const u = socket.data.user;
    socket.join(`user:${u.id}`);

    // ── Visio : rejoindre la salle d'une consultation dont on est participant ──
    socket.on('visio:rejoindre', async ({ consultationId, structureId } = {}, ack = () => {}) => {
      try {
        if (!/^[0-9a-f-]{36}$/i.test(String(consultationId))) throw new Error('consultation invalide');
        const ctxUser = { ...u, structure_id: structureId || u.structure_id };
        const c = await withContext(ctxUser, async (db) => (await db.query('SELECT * FROM acces_teleconsultation($1)', [consultationId])).rows[0]);
        if (!c || c.type !== 'TELECONSULTATION' || ['ANNULEE', 'TERMINEE'].includes(c.statut)) throw new Error('accès refusé');
        const salle = `visio:${consultationId}`;
        const presents = (await io.in(salle).fetchSockets()).length;
        if (presents >= 2) throw new Error('la consultation a déjà deux participants');
        socket.join(salle);
        socket.data.salle = salle;
        socket.to(salle).emit('visio:arrivee', { de: u.id });
        ack({ ok: true, ice: serveursIce(u.id), initiateur: presents === 1 });
      } catch (e) {
        ack({ ok: false, erreur: e.message });
      }
    });

    // ── Appel audio/vidéo depuis une conversation : seuls ses deux participants entrent ──
    socket.on('appel:rejoindre', async ({ appelId } = {}, ack = () => {}) => {
      try {
        if (!/^[0-9a-f-]{36}$/i.test(String(appelId))) throw new Error('appel invalide');
        const a = await withContext(u, async (db) => (await db.query('SELECT * FROM appels WHERE id = $1', [appelId])).rows[0]);
        if (!a || !['SONNE', 'EN_COURS'].includes(a.statut)) throw new Error('appel terminé');
        const salle = `appel:${appelId}`;
        const presents = (await io.in(salle).fetchSockets()).length;
        if (presents >= 2) throw new Error('l’appel a déjà deux participants');
        socket.join(salle);
        socket.data.salle = salle;
        socket.to(salle).emit('visio:arrivee', { de: u.id });
        // Celui qui arrive en second (celui qui décroche) lance la négociation WebRTC
        ack({ ok: true, ice: serveursIce(u.id), initiateur: presents === 1, mode: a.mode });
      } catch (e) {
        ack({ ok: false, erreur: e.message });
      }
    });

    // Relais de la signalisation WebRTC, uniquement dans sa propre salle
    socket.on('visio:signal', (donnees = {}) => {
      if (!socket.data.salle) return;
      socket.to(socket.data.salle).emit('visio:signal', { de: u.id, ...donnees });
    });

    socket.on('visio:quitter', () => {
      if (socket.data.salle) socket.to(socket.data.salle).emit('visio:depart', { de: u.id });
      if (socket.data.salle) socket.leave(socket.data.salle);
      socket.data.salle = null;
    });

    socket.on('disconnect', () => {
      if (socket.data.salle) socket.to(socket.data.salle).emit('visio:depart', { de: u.id });
    });
  });
  return io;
}

/** Prévenir un utilisateur en temps réel (sans contenu sensible) */
function emettre(userId, evenement, donnees) {
  if (io) io.to(`user:${userId}`).emit(evenement, donnees);
}

module.exports = { attacher, emettre, serveursIce };
