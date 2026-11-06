'use strict';
/**
 * Tests de bout en bout du backend SAMA XHEL Santé.
 * Chaque test correspond à une ligne du plan de tests du mémoire (chapitre 6).
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { preparerBase, requeteAdmin, MDP } = require('./helpers');

let request; let app; let otp; let pool; let redis;
const S = {}; // état partagé entre les tests

before(async () => {
  await preparerBase();
  request = require('supertest');
  app = require('../src/app');
  otp = require('../src/services/otp.service');
  ({ pool } = require('../src/config/database'));
  redis = require('../src/config/redis');
  const st = await requeteAdmin('SELECT id, sigle FROM structures WHERE partenaire');
  S.kx = st.find((s) => s.sigle === 'Keur Xaleyi').id;
  S.cp = st.find((s) => s.sigle === 'CEPIAD').id;
});
after(async () => { await pool.end(); await redis.quit(); });

const api = () => request(app);
const bearer = (t, structureId) => {
  const h = { Authorization: `Bearer ${t}` };
  if (structureId) h['X-Structure-Id'] = structureId;
  return h;
};

/** Connexion d'un professionnel avec MFA → jetons */
async function loginPro(email, structureId) {
  let r1 = await api().post('/api/auth/login').send({ identifier: email, password: MDP, ...(structureId ? { structure_id: structureId } : {}) });
  if (!structureId && r1.status === 409) {
    // Le personnel se connecte par le portail de son établissement
    assert.equal(r1.body.code, 'PORTAIL_REQUIS');
    r1 = await api().post('/api/auth/login').send({ identifier: email, password: MDP, portail: r1.body.details.portails[0].code });
  }
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.mfa_required, true);
  assert.equal(r1.body.token, undefined, 'aucun jeton avant le code MFA');
  const [u] = await requeteAdmin('SELECT id FROM users WHERE email = $1', [email]);
  const code = otp.dernierCodePourTests('mfa', u.id);
  const r2 = await api().post('/api/auth/mfa/verify').send({ mfa_token: r1.body.mfa_token, code });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  return r2.body;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('Authentification', () => {
  test('inscription refusée sans consentement aux données de santé', async () => {
    const r = await api().post('/api/auth/register').send({
      prenom: 'Khady', nom: 'Sow', telephone: '77 123 45 67', password: 'Parent2026x',
      consentements: { cgu: true, donnees_sante: false },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'CONSENT_REQUIRED');
  });

  test('inscription d’un parent puis activation par code', async () => {
    const r = await api().post('/api/auth/register').send({
      prenom: 'Khady', nom: 'Sow', telephone: '77 123 45 67', password: 'Parent2026x', langue: 'wo', region: 'Thiès',
      consentements: { cgu: true, donnees_sante: true, ia_analyse: true },
      profil_besoins: { comportements: 'Ne parle pas encore à 3 ans', deja_consulte: false },
      capacite_paiement: 0,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.verification.canal, 'sms');
    // Téléphone normalisé au format international
    const [u] = await requeteAdmin('SELECT telephone, profil_besoins_chiffre FROM users WHERE id = $1', [r.body.user_id]);
    assert.equal(u.telephone, '+221771234567');
    assert.match(u.profil_besoins_chiffre, /^v1:/, 'profil de besoins chiffré');

    const nonVerifie = await api().post('/api/auth/login').send({ identifier: '771234567', password: 'Parent2026x' });
    assert.equal(nonVerifie.status, 403);
    assert.equal(nonVerifie.body.code, 'ACCOUNT_NOT_VERIFIED');

    const code = otp.dernierCodePourTests('verification', r.body.user_id);
    const mauvais = await api().post('/api/auth/verify').send({ identifier: '+221771234567', code: code === '000000' ? '111111' : '000000' });
    assert.equal(mauvais.status, 400);
    const ok = await api().post('/api/auth/verify').send({ identifier: '+221771234567', code });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token && ok.body.refresh_token);
    assert.equal(ok.body.user.role, 'PARENT');
    S.parent2 = ok.body;
  });

  test('connexion du parent de démonstration (sans MFA)', async () => {
    const r = await api().post('/api/auth/login').send({ identifier: 'parent@samaxhel.sn', password: MDP });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.token);
    S.parent = r.body;
  });

  test('un professionnel doit valider un code MFA ; le jeton liste ses structures', async () => {
    S.medecin = await loginPro('medecin@samaxhel.sn', null);
    assert.equal(S.medecin.user.role, 'MEDECIN');
    assert.equal(S.medecin.user.structures.length, 2, 'médecin de Keur Xaleyi et du CEPIAD');
    S.secretaire = await loginPro('secretaire@samaxhel.sn');
    S.therapeute = await loginPro('therapeute@samaxhel.sn');
    S.adminKx = await loginPro('admin.kx@samaxhel.sn');
    S.superAdmin = await loginPro('admin@samaxhel.sn');
  });

  test('le compte est verrouillé après 5 mots de passe erronés', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await api().post('/api/auth/login').send({ identifier: 'admin.cepiad@samaxhel.sn', password: 'faux' });
      assert.equal(r.status, 401);
    }
    const r = await api().post('/api/auth/login').send({ identifier: 'admin.cepiad@samaxhel.sn', password: MDP });
    assert.equal(r.status, 423);
    assert.equal(r.body.code, 'ACCOUNT_LOCKED');
  });

  test('réponse identique pour un compte inexistant (pas d’énumération)', async () => {
    const r = await api().post('/api/auth/login').send({ identifier: 'inconnu@x.sn', password: 'faux' });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'INVALID_CREDENTIALS');
  });

  test('rotation du jeton de rafraîchissement : un jeton déjà utilisé est refusé', async () => {
    const r1 = await api().post('/api/auth/refresh').send({ refresh_token: S.parent2.refresh_token });
    assert.equal(r1.status, 200);
    const r2 = await api().post('/api/auth/refresh').send({ refresh_token: S.parent2.refresh_token });
    assert.equal(r2.status, 401);
    S.parent2 = r1.body;
  });

  test('jeton falsifié ou « alg: none » refusé', async () => {
    const [h, p] = S.parent.token.split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
    assert.equal((await api().get('/api/auth/me').set(bearer(none))).status, 401);
    const modifie = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), role: 'SUPER_ADMIN' })).toString('base64url')}.${S.parent.token.split('.')[2]}`;
    assert.equal((await api().get('/api/auth/me').set(bearer(modifie))).status, 401);
  });

  test('déconnexion : le jeton est mis en liste noire', async () => {
    const r = await api().post('/api/auth/login').send({ identifier: '+221771234567', password: 'Parent2026x' });
    const t = r.body.token;
    assert.equal((await api().get('/api/auth/me').set(bearer(t))).status, 200);
    assert.equal((await api().post('/api/auth/logout').set(bearer(t)).send({})).status, 200);
    const apres = await api().get('/api/auth/me').set(bearer(t));
    assert.equal(apres.status, 401);
    assert.equal(apres.body.code, 'REVOKED_TOKEN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Annuaire et orientation (API publique du site vitrine)', () => {
  test('recherche par trouble et par position', async () => {
    const r = await api().get('/api/structures').query({ trouble: 'TSA', lat: 14.79, lng: -16.93 });
    assert.equal(r.status, 200);
    assert.ok(r.body.structures.some((s) => s.id === S.kx));
    assert.ok(r.body.structures[0].distance_km !== undefined);
  });

  test('une tentative d’injection SQL est traitée comme un texte', async () => {
    const r = await api().get('/api/structures').query({ q: "x' OR 1=1; DROP TABLE users; --" });
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
    const [u] = await requeteAdmin('SELECT count(*)::int AS n FROM users');
    assert.ok(u.n > 0);
  });

  test('questionnaire anonyme du site vitrine : résultat sans enregistrement', async () => {
    const q = await api().get('/api/questionnaires/TSA');
    assert.equal(q.status, 200);
    const reponses = Object.fromEntries(q.body.questionnaire.questions.map((x) => [x.id, x.type === 'alerte' ? 0 : 2]));
    const avant = await requeteAdmin('SELECT count(*)::int AS n FROM depistages');
    const r = await api().post('/api/questionnaires/TSA/evaluer').send({ reponses, age_mois: 30, lat: 14.69, lng: -17.46 });
    assert.equal(r.status, 200);
    assert.equal(r.body.resultat.niveau, 'ELEVE');
    assert.ok(r.body.recommandations.length > 0);
    assert.equal(r.body.recommandations[0].structure.id, S.kx);
    const apres = await requeteAdmin('SELECT count(*)::int AS n FROM depistages');
    assert.equal(apres[0].n, avant[0].n);
  });

  test('orientation par l’IA avec les raisons du classement', async () => {
    const r = await api().post('/api/orientation').send({ troubles: ['ADDICTION'], age_mois: 240, region: 'Dakar', budget: 0 });
    assert.equal(r.status, 200);
    assert.equal(r.body.recommandations[0].structure.sigle, 'CEPIAD');
    assert.ok(r.body.recommandations[0].raisons.length >= 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Parcours parent : enfant, repérage, IA de tri, dossier', () => {
  test('ajout d’un enfant : nom chiffré en base, âge calculé', async () => {
    const r = await api().post('/api/enfants').set(bearer(S.parent.token)).send({
      prenom: 'Awa', nom: 'Diallo', date_naissance: '2024-03-10', sexe: 'F', region: 'Dakar', langue_maison: 'wo',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.enfant.prenom, 'Awa');
    assert.ok(r.body.enfant.age_mois > 20);
    S.enfant = r.body.enfant;
    const [row] = await requeteAdmin('SELECT prenom_chiffre, nom_chiffre FROM enfants WHERE id = $1', [S.enfant.id]);
    assert.ok(!row.prenom_chiffre.includes('Awa'), 'le prénom n’est pas lisible en base');
  });

  test('un parent ne voit pas les enfants d’un autre parent', async () => {
    const r = await api().get(`/api/enfants/${S.enfant.id}`).set(bearer(S.parent2.token));
    assert.equal(r.status, 404);
  });

  test('repérage TSA avec perte de mots : niveau élevé, alerte RÉGRESSION, priorité URGENT', async () => {
    const reponses = { 1: 3, 2: 2, 3: 2, 4: 3, 5: 2, 6: 3, 7: 3, 8: 2, 9: 2, 10: 1, 11: 1, 12: 1 };
    const r = await api().post('/api/depistages').set(bearer(S.parent.token))
      .send({ questionnaire_code: 'TSA', enfant_id: S.enfant.id, reponses });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.resultat.niveau, 'ELEVE');
    assert.ok(r.body.resultat.alertes.some((a) => a.code === 'REGRESSION'));
    assert.equal(r.body.triage.priorite, 'URGENT');
    assert.ok(r.body.triage.raisons.some((x) => x.texte.includes('moins de 3 ans')));
    assert.ok(r.body.recommandations.length > 0);
    S.depistage = r.body.depistage;
  });

  test('le score est calculé par le serveur : réponse hors échelle refusée', async () => {
    const r = await api().post('/api/depistages').set(bearer(S.parent.token))
      .send({ questionnaire_code: 'TSA', enfant_id: S.enfant.id, reponses: { 1: 9 } });
    assert.equal(r.status, 400);
  });

  test('PHQ-9 avec idées de mort : alerte IDÉES SUICIDAIRES', async () => {
    const reponses = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 0, 6: 1, 7: 1, 8: 0, 9: 1 };
    const r = await api().post('/api/depistages').set(bearer(S.parent.token))
      .send({ questionnaire_code: 'DEPRESSION', reponses });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const a = r.body.resultat.alertes.find((x) => x.code === 'IDEES_SUICIDAIRES');
    assert.ok(a);
    assert.match(a.message, /1515/);
  });

  test('demande de prise en charge : dossier créé avec priorité et médecins notifiés', async () => {
    const r = await api().post('/api/suivis').set(bearer(S.parent.token))
      .send({ enfant_id: S.enfant.id, structure_id: S.kx, motif: 'Ne répond plus à son prénom', depistage_id: S.depistage.id });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.suivi.priorite, 'URGENT');
    assert.match(r.body.suivi.numero_dossier, /^TND-\d{4}-\d{6}$/);
    S.suivi = r.body.suivi;
    const n = await requeteAdmin(
      "SELECT count(*)::int AS n FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'medecin@samaxhel.sn' AND n.type = 'NOUVELLE_DEMANDE'");
    assert.equal(n[0].n, 1);
    const doublon = await api().post('/api/suivis').set(bearer(S.parent.token)).send({ enfant_id: S.enfant.id, structure_id: S.kx });
    assert.equal(doublon.status, 409);
  });

  test('une structure non partenaire ne peut pas recevoir de demande en ligne', async () => {
    const [s] = await requeteAdmin('SELECT id FROM structures WHERE NOT partenaire LIMIT 1');
    const r = await api().post('/api/suivis').set(bearer(S.parent.token)).send({ enfant_id: S.enfant.id, structure_id: s.id });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'STRUCTURE_NOT_PARTNER');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Multi-tenant : isolation des structures (RLS)', () => {
  test('le médecin voit le dossier dans la file de Keur Xaleyi, trié par urgence', async () => {
    const r = await api().get('/api/suivis').set(bearer(S.medecin.token, S.kx));
    assert.equal(r.status, 200);
    assert.equal(r.body.suivis[0].id, S.suivi.id);
    assert.equal(r.body.suivis[0].enfant.prenom, 'Awa');
    assert.equal(r.body.resume.URGENT, 1);
  });

  test('le même médecin, dans le contexte du CEPIAD, ne voit rien de Keur Xaleyi', async () => {
    const liste = await api().get('/api/suivis').set(bearer(S.medecin.token, S.cp));
    assert.equal(liste.status, 200);
    assert.equal(liste.body.total, 0);
    const d = await api().get(`/api/suivis/${S.suivi.id}`).set(bearer(S.medecin.token, S.cp));
    assert.equal(d.status, 404);
    const e = await api().get(`/api/enfants/${S.enfant.id}`).set(bearer(S.medecin.token, S.cp));
    assert.equal(e.status, 404);
  });

  test('un professionnel ne peut pas choisir une structure dont il n’est pas membre', async () => {
    const r = await api().get('/api/suivis').set(bearer(S.therapeute.token, S.cp));
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'NOT_A_MEMBER');
  });

  test('la RLS bloque même une requête SQL sans filtre (défense en profondeur)', async () => {
    const { withContext } = require('../src/config/database');
    const [m] = await requeteAdmin("SELECT id FROM users WHERE email = 'medecin@samaxhel.sn'");
    const n = await withContext({ id: m.id, role: 'MEDECIN', structure_id: S.cp },
      async (db) => (await db.query('SELECT count(*)::int AS n FROM suivis')).rows[0].n);
    assert.equal(n, 0);
    const n2 = await withContext({ id: m.id, role: 'MEDECIN', structure_id: S.kx },
      async (db) => (await db.query('SELECT count(*)::int AS n FROM suivis')).rows[0].n);
    assert.equal(n2, 1);
  });

  test('un parent ne peut pas usurper un contexte professionnel avec X-Structure-Id', async () => {
    const r = await api().get('/api/suivis').set(bearer(S.parent2.token, S.kx));
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0, 'le parent 2 ne voit pas les dossiers de la structure');
  });

  test('le médecin accepte la demande, désigne un référent et ajuste la priorité (tracé)', async () => {
    const [t] = await requeteAdmin("SELECT id FROM users WHERE email = 'therapeute@samaxhel.sn'");
    const r = await api().put(`/api/suivis/${S.suivi.id}`).set(bearer(S.medecin.token, S.kx))
      .send({ statut: 'ACTIF', referent_id: t.id, priorite: 'PRIORITAIRE', justification: 'Vu en urgence ce jour' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.suivi.priorite, 'PRIORITAIRE');
    assert.ok(r.body.suivi.triage_raisons.some((x) => x.manuel));
  });

  test('la secrétaire ne peut pas modifier la priorité ni lire les consultations', async () => {
    const r = await api().put(`/api/suivis/${S.suivi.id}`).set(bearer(S.secretaire.token)).send({ priorite: 'NORMAL' });
    assert.equal(r.status, 403);
    const c = await api().get('/api/consultations').set(bearer(S.secretaire.token));
    assert.equal(c.status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Rendez-vous, consultation et téléconsultation', () => {
  test('le parent demande une téléconsultation ; la secrétaire la confirme', async () => {
    const r = await api().post('/api/rendez-vous').set(bearer(S.parent.token)).send({
      enfant_id: S.enfant.id, structure_id: S.kx, type: 'TELECONSULTATION',
      date_souhaitee: new Date(Date.now() + 3 * 86400000).toISOString(), motif: 'Bilan',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.rendez_vous.statut, 'DEMANDE');
    S.rdv = r.body.rendez_vous;

    const sansPro = await api().put(`/api/rendez-vous/${S.rdv.id}`).set(bearer(S.secretaire.token)).send({ statut: 'CONFIRME' });
    assert.equal(sansPro.status, 400);
    assert.equal(sansPro.body.code, 'MISSING_PROFESSIONNEL');

    const [m] = await requeteAdmin("SELECT id FROM users WHERE email = 'medecin@samaxhel.sn'");
    const ok = await api().put(`/api/rendez-vous/${S.rdv.id}`).set(bearer(S.secretaire.token))
      .send({ statut: 'CONFIRME', professionnel_id: m.id });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.rendez_vous.statut, 'CONFIRME');
    assert.equal(ok.body.rendez_vous.consultation_id, null, 'la secrétaire ne voit pas la consultation (secret médical)');
    const [c] = await requeteAdmin('SELECT id FROM consultations WHERE rdv_id = $1', [S.rdv.id]);
    assert.ok(c, 'consultation créée automatiquement');
    const vueParent = await api().get('/api/rendez-vous').set(bearer(S.parent.token));
    assert.equal(vueParent.body.rendez_vous.find((x) => x.id === S.rdv.id).consultation_id, c.id, 'le parent obtient l’identifiant pour rejoindre');
    S.consultationId = c.id;
  });

  test('visio WebRTC : configuration réservée aux participants, signalisation relayée entre eux seulement', async () => {
    const ok = await api().get(`/api/teleconsultation/${S.consultationId}/join`).set(bearer(S.parent.token));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.mode, 'WEBRTC');
    assert.ok(ok.body.ice.some((s) => String(s.urls).includes('stun:')));
    const autre = await api().get(`/api/teleconsultation/${S.consultationId}/join`).set(bearer(S.parent2.token));
    assert.equal(autre.status, 404);
    const medecinCepiad = await api().get(`/api/teleconsultation/${S.consultationId}/join`).set(bearer(S.medecin.token, S.cp));
    assert.equal(medecinCepiad.status, 404);

    // Socket.IO réel sur un port libre
    const http = require('http');
    const { io: client } = require('socket.io-client');
    const serveur = http.createServer(app);
    require('../src/services/temps-reel.service').attacher(serveur);
    await new Promise((ok2) => serveur.listen(0, ok2));
    const url = `http://127.0.0.1:${serveur.address().port}`;
    const connecter = (jeton) => new Promise((ok2, ko) => {
      const s = client(url, { auth: { token: jeton }, transports: ['websocket'], reconnection: false });
      s.on('connect', () => ok2(s)); s.on('connect_error', ko);
    });
    try {
      await assert.rejects(connecter('faux.jeton.x'), /Non autorisé/);
      const parent = await connecter(S.parent.token);
      const medecin = await connecter(S.medecin.token);
      const intrus = await connecter(S.parent2.token);
      const r1 = await parent.emitWithAck('visio:rejoindre', { consultationId: S.consultationId });
      assert.equal(r1.ok, true, JSON.stringify(r1));
      const r2 = await medecin.emitWithAck('visio:rejoindre', { consultationId: S.consultationId, structureId: S.kx });
      assert.equal(r2.ok, true, JSON.stringify(r2));
      assert.equal(r2.initiateur, true, 'le second arrivé lance l’appel');
      const r3 = await intrus.emitWithAck('visio:rejoindre', { consultationId: S.consultationId });
      assert.equal(r3.ok, false, 'un autre parent ne peut pas entrer dans la salle');
      const recu = new Promise((ok2) => parent.on('visio:signal', ok2));
      let fuite = false; intrus.on('visio:signal', () => { fuite = true; });
      medecin.emit('visio:signal', { type: 'offre', sdp: 'v=0 test' });
      const sig = await recu;
      assert.equal(sig.type, 'offre');
      await new Promise((ok2) => setTimeout(ok2, 200));
      assert.equal(fuite, false, 'la signalisation ne sort pas de la salle');
      [parent, medecin, intrus].forEach((s) => s.close());
    } finally {
      serveur.close();
    }
  });

  test('le médecin rédige la consultation : observations chiffrées, invisibles pour le parent', async () => {
    const r = await api().put(`/api/consultations/${S.consultationId}`).set(bearer(S.medecin.token, S.kx)).send({
      observations: 'Contact visuel fuyant, absence de pointage.', recommandations: 'Séances d’orthophonie 2 fois par semaine.',
      diagnostic_code: '6A02', statut: 'TERMINEE',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.consultation.observations, 'Contact visuel fuyant, absence de pointage.');
    const [row] = await requeteAdmin('SELECT observations_chiffre FROM consultations WHERE id = $1', [S.consultationId]);
    assert.ok(!row.observations_chiffre.includes('pointage'));
    const p = await api().get(`/api/consultations/${S.consultationId}`).set(bearer(S.parent.token));
    assert.equal(p.status, 200);
    assert.equal(p.body.consultation.recommandations, 'Séances d’orthophonie 2 fois par semaine.');
    assert.equal(p.body.consultation.observations, undefined, 'observations réservées aux cliniciens');
    const [rdv] = await requeteAdmin('SELECT statut FROM rendez_vous WHERE id = $1', [S.rdv.id]);
    assert.equal(rdv.statut, 'TERMINE');
  });

  test('export HL7 FHIR du dossier par le médecin', async () => {
    const r = await api().get(`/api/fhir/Patient/${S.enfant.id}/$everything`).set(bearer(S.medecin.token, S.kx));
    assert.equal(r.status, 200);
    const b = JSON.parse(r.text);
    assert.equal(b.resourceType, 'Bundle');
    assert.ok(b.entry.some((e) => e.resource.resourceType === 'Patient'));
    assert.ok(b.entry.some((e) => e.resource.resourceType === 'Encounter'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Messagerie chiffrée de bout en bout', () => {
  test('ouverture d’une conversation et envoi d’un message chiffré', async () => {
    const [m] = await requeteAdmin("SELECT id FROM users WHERE email = 'medecin@samaxhel.sn'");
    const interdit = await api().post('/api/conversations').set(bearer(S.parent2.token))
      .send({ professionnel_id: m.id, structure_id: S.kx });
    assert.equal(interdit.status, 403);

    const c = await api().post('/api/conversations').set(bearer(S.parent.token))
      .send({ professionnel_id: m.id, structure_id: S.kx, enfant_id: S.enfant.id });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const ciphertext = Buffer.from('donnees-chiffrees-par-le-telephone').toString('base64');
    const e = await api().post(`/api/conversations/${c.body.conversation.id}/messages`).set(bearer(S.parent.token))
      .send({ ciphertext, nonce: 'AAAAAAAAAAAAAAAA' });
    assert.equal(e.status, 201);
    const lu = await api().get(`/api/conversations/${c.body.conversation.id}/messages`).set(bearer(S.medecin.token, S.kx));
    assert.equal(lu.status, 200);
    assert.equal(lu.body.messages[0].ciphertext, ciphertext);
    const cepiad = await api().get(`/api/conversations/${c.body.conversation.id}/messages`).set(bearer(S.medecin.token, S.cp));
    assert.equal(cepiad.status, 404, 'conversation cloisonnée par structure');
  });

  test('accusé de lecture : le destinataire marque lu, l’expéditeur ne peut rien modifier', async () => {
    const convs = await api().get('/api/conversations').set(bearer(S.medecin.token, S.kx));
    const id = convs.body.conversations[0].id;
    assert.equal(convs.body.conversations[0].non_lus, 1);
    const lu = await api().put(`/api/conversations/${id}/lu`).set(bearer(S.medecin.token, S.kx));
    assert.equal(lu.status, 200, JSON.stringify(lu.body));
    assert.equal(lu.body.marques_lus, 1);
    const apres = await api().get('/api/conversations').set(bearer(S.medecin.token, S.kx));
    assert.equal(apres.body.conversations[0].non_lus, 0);
    // L'expéditeur (parent) ne « lit » pas ses propres messages
    const parent = await api().put(`/api/conversations/${id}/lu`).set(bearer(S.parent.token));
    assert.equal(parent.body.marques_lus, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('IA émotionnelle', () => {
  test('détresse grave du parent : niveau CRISE, SAMU, dossier repassé en URGENT', async () => {
    const r = await api().post('/api/humeur').set(bearer(S.parent.token)).send({
      humeur: 1, texte: "Je suis épuisée, je n'en peux plus, j'ai envie de mourir", enfant_id: S.enfant.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.entree.analyse_ia.niveau, 'CRISE');
    assert.equal(r.body.entree.analyse_ia.ressources[0].telephone, '1515');
    const [s] = await requeteAdmin('SELECT priorite FROM suivis WHERE id = $1', [S.suivi.id]);
    assert.equal(s.priorite, 'URGENT');
  });

  test('la négation est prise en compte (« pas triste »)', async () => {
    const r = await api().post('/api/humeur').set(bearer(S.parent.token)).send({ humeur: 4, texte: 'Je ne suis pas triste, il progresse bien, alhamdoulilah' });
    assert.equal(r.status, 201);
    assert.equal(r.body.entree.analyse_ia.niveau, 'FAIBLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Administration multi-tenant', () => {
  test('inscription d’un thérapeute depuis le site : en attente, puis validé par l’admin', async () => {
    const r = await api().post('/api/auth/register-professionnel').send({
      prenom: 'Cheikh', nom: 'Ndour', email: 'cheikh.ndour@exemple.sn', telephone: '76 555 44 33', password: 'Therap2026x',
      structure_id: S.kx, role: 'THERAPEUTE', specialite: 'Psychomotricien', numero_ordre: 'PM-0042',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const code = otp.dernierCodePourTests('verification', r.body.user_id);
    const v = await api().post('/api/auth/verify').send({ identifier: 'cheikh.ndour@exemple.sn', code });
    assert.equal(v.body.en_attente, true);
    const l = await api().post('/api/auth/login').send({ identifier: 'cheikh.ndour@exemple.sn', password: 'Therap2026x' });
    assert.equal(l.status, 403);
    assert.equal(l.body.code, 'PENDING_VALIDATION');

    const liste = await api().get('/api/admin/membres').set(bearer(S.adminKx.token)).query({ statut: 'EN_ATTENTE' });
    assert.equal(liste.body.membres.length, 1);
    // Circuit de vérification : pièces (diplôme + identité) → conformes → convocation → entretien passé → actif
    const pdf = Buffer.from('%PDF-1.4\n%%EOF');
    for (const type of ['DIPLOME', 'IDENTITE']) {
      const d = await api().post(`/api/candidatures/pieces?type=${type}`).set({ 'X-Jeton-Depot': r.body.jeton_depot, 'Content-Type': 'application/pdf' }).send(pdf);
      assert.equal(d.status, 201, JSON.stringify(d.body));
      await api().put(`/api/admin/pieces/${d.body.piece.id}`).set(bearer(S.adminKx.token)).send({ statut: 'CONFORME' });
    }
    const c = await api().put(`/api/admin/membres/${r.body.user_id}/decision`).set(bearer(S.adminKx.token))
      .send({ statut: 'CONVOQUE', convocation_date: new Date(Date.now() + 3600e3).toISOString(), convocation_lieu: 'Keur Xaleyi' });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    await requeteAdmin("UPDATE membres_structure SET convocation_date = NOW() - INTERVAL '1 hour' WHERE user_id = $1", [r.body.user_id]);
    const ok = await api().put(`/api/admin/membres/${r.body.user_id}/decision`).set(bearer(S.adminKx.token)).send({ statut: 'ACTIF' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const l2 = await api().post('/api/auth/login').send({ identifier: 'cheikh.ndour@exemple.sn', password: 'Therap2026x' });
    // Sans portail : on lui indique le portail de SON établissement
    assert.equal(l2.status, 409, JSON.stringify(l2.body));
    assert.equal(l2.body.code, 'PORTAIL_REQUIS');
    const l3 = await api().post('/api/auth/login').send({ identifier: 'cheikh.ndour@exemple.sn', password: 'Therap2026x', portail: l2.body.details.portails[0].code });
    assert.equal(l3.status, 200, JSON.stringify(l3.body));
    assert.equal(l3.body.mfa_required, true);
  });

  test('un admin ne gère que les membres de SA structure', async () => {
    const [m] = await requeteAdmin("SELECT id FROM users WHERE email = 'admin.cepiad@samaxhel.sn'");
    const r = await api().put(`/api/admin/membres/${m.id}`).set(bearer(S.adminKx.token)).send({ statut: 'SUSPENDU' });
    assert.equal(r.status, 404);
  });

  test('statistiques de la structure et journal d’audit', async () => {
    const s = await api().get('/api/admin/statistiques').set(bearer(S.adminKx.token));
    assert.equal(s.status, 200);
    assert.ok(s.body.statistiques.dossiers_par_statut.length > 0);
    const a = await api().get('/api/admin/audit').set(bearer(S.adminKx.token));
    assert.equal(a.status, 200);
    assert.ok(a.body.journal.length > 0);
  });

  test('journal d’audit chaîné : intégrité vérifiée, puis falsification détectée', async () => {
    await new Promise((res) => setTimeout(res, 300)); // écritures d'audit asynchrones
    const ok = await api().get('/api/admin/audit/verifier').set(bearer(S.superAdmin.token));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.integrite.valide, true);
    await requeteAdmin("UPDATE audit_logs SET action = 'FALSIFIE' WHERE id = (SELECT min(id) + 1 FROM audit_logs)");
    const ko = await api().get('/api/admin/audit/verifier').set(bearer(S.superAdmin.token));
    assert.equal(ko.body.integrite.valide, false);
  });

  test('l’application ne peut ni modifier ni supprimer le journal d’audit', async () => {
    await assert.rejects(pool.query('DELETE FROM audit_logs'), /permission denied/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Dons et droits des personnes', () => {
  test('transparence des dons (publique)', async () => {
    const r = await api().get('/api/dons/transparence');
    assert.equal(r.status, 200);
    assert.equal(r.body.repartition.reduce((a, x) => a + x.pourcentage, 0), 100);
  });

  test('export des données du parent (droit d’accès, loi 2008-12)', async () => {
    const r = await api().get('/api/users/me/export').set(bearer(S.parent.token));
    assert.equal(r.status, 200);
    assert.ok(r.body.consentements.length >= 3);
    assert.ok(r.body.depistages.length >= 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Messages vocaux et assistant vocal (parents qui ne lisent pas)', () => {
  const http = require('http');
  let faux; let prochaineTranscription = '';
  const audioWav = () => { // petit WAV valide (0,5 s de silence, 16 kHz)
    const n = 8000; const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28);
    b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    return b;
  };
  before(async () => {
    // Faux service d'IA vocale : renvoie la transcription prévue par le test
    faux = http.createServer((req, res) => {
      req.resume(); req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ texte: prochaineTranscription, confiance: 0.95, duree_s: 3, temps_s: 0.1, modele: 'faux' }));
      });
    }).listen(0);
    require('../src/config/env').iaVoix.url = `http://127.0.0.1:${faux.address().port}`;
  });
  after(() => faux.close());

  const envoyer = (langue) => api().post(`/api/vocaux?langue=${langue}&enfant_id=${S.enfant.id}`)
    .set({ ...bearer(S.parent.token), 'Content-Type': 'audio/wav' }).send(audioWav());

  test('vocal en wolof « je cherche un hôpital proche » → l’assistant ouvre la carte des centres', async () => {
    prochaineTranscription = 'asalaa malekum sama doom dafa feebar damay seet loppitam bu jege';
    const r = await envoyer('wo');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.message.intention, 'TROUVER_STRUCTURE');
    assert.equal(r.body.reponse.reponse.action.route, '/trouver');
    assert.equal(r.body.reponse.reponse.cle, 'assistant_structure');
    const [v] = await requeteAdmin('SELECT audio_chiffre, transcription_chiffree FROM vocaux WHERE id = $1', [r.body.message.id]);
    assert.ok(!v.audio_chiffre.includes(Buffer.from('RIFF')), 'audio chiffré en base');
    assert.match(v.transcription_chiffree, /^v1:/, 'transcription chiffrée en base');
  });

  test('urgence dite en wolof → médecins alertés, vocal transmis, SAMU proposé', async () => {
    prochaineTranscription = 'sama doom dafa daanu te xuus';
    const r = await envoyer('wo');
    assert.equal(r.status, 201);
    assert.equal(r.body.message.intention, 'URGENCE');
    assert.equal(r.body.reponse.reponse.action.numero, '1515');
    assert.ok(r.body.transmis_a >= 1);
    S.vocalUrgent = r.body.message.id;
    const [m] = await requeteAdmin('SELECT id FROM users WHERE email = $1', ['medecin@samaxhel.sn']);
    const n = await requeteAdmin("SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'ALERTE_VOCAL'", [m.id]);
    assert.ok(n.length >= 1);
  });

  test('le médecin de la structure écoute le vocal et répond par un vocal ; CEPIAD ne voit rien', async () => {
    const l = await api().get('/api/vocaux').set(bearer(S.medecin.token, S.kx));
    assert.equal(l.status, 200);
    const recu = l.body.vocaux.find((v) => v.sens === 'PARENT' && v.intention === 'URGENCE');
    assert.ok(recu, 'vocal reçu par Keur Xaleyi');
    const a = await api().get(`/api/vocaux/${recu.id}/audio`).set(bearer(S.medecin.token, S.kx));
    assert.equal(a.status, 200);
    assert.equal(a.headers['content-type'], 'audio/wav');
    assert.ok(a.body.subarray(0, 4).equals(Buffer.from('RIFF')), 'audio déchiffré à l’écoute');
    const cp = await api().get('/api/vocaux').set(bearer(S.medecin.token, S.cp));
    assert.equal(cp.body.vocaux.length, 0, 'cloisonnement par structure');
    const s = await api().get('/api/vocaux').set(bearer(S.secretaire.token));
    assert.equal(s.status, 403, 'la secrétaire n’a pas accès au contenu médical');
    const rep = await api().post(`/api/vocaux/${recu.id}/repondre`).set({ ...bearer(S.medecin.token, S.kx), 'Content-Type': 'audio/wav' }).send(audioWav());
    assert.equal(rep.status, 201, JSON.stringify(rep.body));
    const fil = await api().get('/api/vocaux').set(bearer(S.parent.token));
    assert.ok(fil.body.vocaux.some((v) => v.sens === 'SOIGNANT'), 'le parent reçoit la réponse vocale');
  });

  test('sans consentement IA : aucune transcription, le vocal va directement à l’équipe', async () => {
    await api().post('/api/consentements').set(bearer(S.parent.token)).send({ type: 'IA_ANALYSE', accepte: false });
    prochaineTranscription = 'ne doit pas être utilisé';
    const r = await envoyer('srr');
    assert.equal(r.status, 201);
    assert.equal(r.body.message.intention, 'SANS_IA');
    assert.equal(r.body.message.transcription, null);
    assert.ok(r.body.transmis_a >= 1);
    await api().post('/api/consentements').set(bearer(S.parent.token)).send({ type: 'IA_ANALYSE', accepte: true });
  });

  test('un fichier qui n’est pas de l’audio est refusé ; aucun vocal ne peut être supprimé', async () => {
    const r = await api().post('/api/vocaux?langue=wo').set({ ...bearer(S.parent.token), 'Content-Type': 'audio/wav' }).send(Buffer.alloc(10));
    assert.equal(r.status, 400);
    await assert.rejects(pool.query('DELETE FROM vocaux'), /permission denied/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Dossier médical inviolable', () => {
  test('aucune donnée médicale ne peut être supprimée, même par une requête directe', async () => {
    for (const t of ['consultations', 'enfants', 'suivis', 'depistages', 'ordonnances', 'vocaux', 'audit_logs']) {
      await assert.rejects(requeteAdmin(`DELETE FROM ${t} WHERE false OR true`), /Suppression interdite|permission denied/, t);
    }
  });

  test('chaque correction d’une consultation garde l’ancienne version (historique)', async () => {
    const r = await api().put(`/api/consultations/${S.consultationId}`).set(bearer(S.medecin.token, S.kx))
      .send({ recommandations: 'Orthophonie 3 fois par semaine (correction).' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const h = await requeteAdmin('SELECT version, modifie_par FROM consultations_historique WHERE consultation_id = $1 ORDER BY id', [S.consultationId]);
    assert.ok(h.length >= 1);
    assert.match(h[h.length - 1].version.recommandations_chiffre, /^v1:/, 'l’ancienne version reste chiffrée');
    assert.ok(h[h.length - 1].modifie_par, 'auteur de la correction enregistré');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Ordonnances et pharmacies (données OpenStreetMap réelles)', () => {
  test('l’annuaire contient les pharmacies réelles du Sénégal, triées par distance', async () => {
    const r = await api().get('/api/pharmacies?region=Dakar&lat=14.6898&lng=-17.4644&limit=5');
    assert.equal(r.status, 200);
    assert.ok(r.body.total > 100, `${r.body.total} pharmacies à Dakar`);
    assert.match(r.body.attribution, /OpenStreetMap/);
    const d = r.body.pharmacies.map((p) => p.distance_km);
    assert.deepEqual(d, [...d].sort((a, b) => a - b));
  });

  test('le médecin prescrit ; le parent voit l’ordonnance et les pharmacies qui ont DÉCLARÉ le médicament', async () => {
    const o = await api().post('/api/ordonnances').set(bearer(S.medecin.token, S.kx)).send({
      enfant_id: S.enfant.id, lignes: [{ dci: 'Rispéridone', forme: 'solution buvable', posologie: '0,25 mg le soir', duree: '1 mois' }],
    });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    assert.deepEqual(o.body.ordonnance.dci, ['risperidone']);
    const [brut] = await requeteAdmin('SELECT lignes_chiffrees FROM ordonnances WHERE id = $1', [o.body.ordonnance.id]);
    assert.match(brut.lignes_chiffrees, /^v1:/, 'posologie chiffrée');
    const l = await api().get('/api/ordonnances').set(bearer(S.parent.token));
    assert.equal(l.body.ordonnances[0].lignes[0].posologie, '0,25 mg le soir');
    const p = await api().get('/api/pharmacies?dci=risperidone&lat=14.69&lng=-17.46');
    assert.equal(p.body.pharmacies[0].disponibilite, 'DECLAREE');
    assert.ok(p.body.pharmacies.slice(1).every((x) => x.disponibilite === 'NON_RENSEIGNEE'), 'aucune disponibilité inventée');
    const t = await api().post('/api/ordonnances').set(bearer(S.therapeute.token, S.kx)).send({ enfant_id: S.enfant.id, lignes: [{ dci: 'x', posologie: 'xx' }] });
    assert.equal(t.status, 403, 'seul un médecin prescrit');
  });

  test('méthadone : jamais orientée vers une pharmacie de ville (délivrance par le centre)', async () => {
    const p = await api().get('/api/pharmacies?dci=methadone');
    assert.equal(p.body.reserve_structure, true);
    assert.equal(p.body.pharmacies.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Candidature d’un médecin : pièces justificatives puis convocation', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  test('inscription depuis le site, dépôt des pièces, vérification, convocation, puis validation', async () => {
    const ins = await api().post('/api/auth/register-professionnel').send({
      prenom: 'Khady', nom: 'Sow', email: 'khady.sow@exemple.sn', telephone: '+221771112233', password: 'Pedopsy2026x',
      structure_id: S.kx, role: 'MEDECIN', specialite: 'Pédopsychiatre', numero_ordre: 'ONMS-12345',
    });
    assert.equal(ins.status, 201, JSON.stringify(ins.body));
    assert.deepEqual(ins.body.pieces_obligatoires, ['DIPLOME', 'IDENTITE', 'ORDRE']);
    const uid = ins.body.user_id;
    const faux = await api().post('/api/candidatures/pieces?type=DIPLOME').set({ 'X-Jeton-Depot': ins.body.jeton_depot, 'Content-Type': 'application/pdf' })
      .send(Buffer.from('MZ exécutable déguisé en PDF'));
    assert.equal(faux.status, 400, 'contenu vérifié, pas seulement le type annoncé');
    for (const type of ['DIPLOME', 'IDENTITE', 'ORDRE']) {
      const d = await api().post(`/api/candidatures/pieces?type=${type}`).set({ 'X-Jeton-Depot': ins.body.jeton_depot, 'Content-Type': 'application/pdf' }).send(pdf);
      assert.equal(d.status, 201, JSON.stringify(d.body));
    }
    const sansJeton = await api().post('/api/candidatures/pieces?type=CV').set({ 'Content-Type': 'application/pdf' }).send(pdf);
    assert.equal(sansJeton.status, 401);

    const direct = await api().put(`/api/admin/membres/${uid}`).set(bearer(S.adminKx.token)).send({ statut: 'ACTIF' });
    assert.equal(direct.status, 400, 'impossible de valider sans le circuit de vérification');
    const tropTot = await api().put(`/api/admin/membres/${uid}/decision`).set(bearer(S.adminKx.token))
      .send({ statut: 'CONVOQUE', convocation_date: new Date(Date.now() + 86400000).toISOString(), convocation_lieu: 'Keur Xaleyi, Fann' });
    assert.equal(tropTot.status, 400);
    assert.equal(tropTot.body.code, 'PIECES_INCOMPLETES');

    const dossier = await api().get(`/api/admin/membres/${uid}/pieces`).set(bearer(S.adminKx.token));
    assert.equal(dossier.status, 200);
    for (const p of dossier.body.pieces) {
      const f = await api().get(`/api/admin/pieces/${p.id}`).set(bearer(S.adminKx.token));
      assert.equal(f.status, 200);
      assert.ok(f.body.subarray(0, 5).equals(Buffer.from('%PDF-')));
      await api().put(`/api/admin/pieces/${p.id}`).set(bearer(S.adminKx.token)).send({ statut: 'CONFORME' });
    }
    const autreAdmin = await api().get(`/api/admin/membres/${uid}/pieces`).set(bearer(S.adminCp?.token || S.adminKx.token, S.cp));
    assert.ok([403, 404].includes(autreAdmin.status) || autreAdmin.status === 200 && autreAdmin.body.membre === undefined);

    const conv = await api().put(`/api/admin/membres/${uid}/decision`).set(bearer(S.adminKx.token))
      .send({ statut: 'CONVOQUE', convocation_date: new Date(Date.now() + 86400000).toISOString(), convocation_lieu: 'Keur Xaleyi, Fann' });
    assert.equal(conv.status, 200, JSON.stringify(conv.body));
    const avantEntretien = await api().put(`/api/admin/membres/${uid}/decision`).set(bearer(S.adminKx.token)).send({ statut: 'ACTIF' });
    assert.equal(avantEntretien.body.code, 'ENTRETIEN_REQUIS');
    await requeteAdmin("UPDATE membres_structure SET convocation_date = NOW() - INTERVAL '1 hour' WHERE user_id = $1", [uid]);
    const ok = await api().put(`/api/admin/membres/${uid}/decision`).set(bearer(S.adminKx.token)).send({ statut: 'ACTIF' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.membre.statut, 'ACTIF');
    const [p] = await requeteAdmin('SELECT contenu_chiffre FROM pieces_justificatives WHERE user_id = $1 LIMIT 1', [uid]);
    assert.ok(!p.contenu_chiffre.subarray(0, 40).includes(Buffer.from('%PDF')), 'pièces chiffrées en base');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('USSD pour les parents sans smartphone', () => {
  const ussd = (text) => api().post('/api/ussd').type('form').send({ sessionId: 's1', serviceCode: '*384*7788#', phoneNumber: '+221770009999', text });
  test('menu, recherche par région, demande de rappel transmise au secrétariat', async () => {
    const a = await ussd('');
    assert.match(a.text, /^CON SAMA XHEL/);
    const r = await ussd('1*1');
    assert.match(r.text, /^END Dakar/);
    assert.ok(r.text.length <= 182, 'tient dans un écran USSD');
    const choix = await ussd('2*1');
    assert.match(choix.text, /^CON Quel centre/);
    const fin = await ussd('2*1*1');
    assert.match(fin.text, /^END Merci/);
    const [d] = await requeteAdmin('SELECT telephone_chiffre FROM demandes_rappel ORDER BY created_at DESC LIMIT 1');
    assert.match(d.telephone_chiffre, /^v1:/, 'numéro chiffré');
    const urg = await ussd('3');
    assert.match(urg.text, /1515/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Groupe des parents, rappels automatiques, supervision', () => {
  test('groupe des parents : numéros et e-mails masqués automatiquement', async () => {
    const r = await api().post('/api/communaute').set(bearer(S.parent.token)).send({ texte: 'Appelez-moi au 77 123 45 67 ou awa@mail.sn pour le groupe de parole' });
    assert.equal(r.status, 201);
    assert.doesNotMatch(r.body.message.texte, /77 123|awa@/);
    const l = await api().get('/api/communaute').set(bearer(S.parent2.token));
    assert.ok(l.body.messages.length >= 1);
    const pro = await api().get('/api/communaute').set(bearer(S.medecin.token, S.kx));
    assert.equal(pro.status, 403);
  });

  test('rappel automatique : rendez-vous demain → le parent est prévenu une seule fois', async () => {
    const [rdv] = await requeteAdmin('SELECT id, parent_id FROM rendez_vous LIMIT 1');
    await requeteAdmin("UPDATE rendez_vous SET statut = 'CONFIRME', date_confirmee = NOW() + INTERVAL '3 hours' WHERE id = $1", [rdv.id]);
    const { executer } = require('../src/services/rappels.service');
    const b1 = await executer();
    const b2 = await executer();
    assert.ok(b1.rdv >= 1);
    assert.equal(b2.rdv, 0, 'pas de doublon');
    const n = await requeteAdmin("SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'RAPPEL_RDV'", [rdv.parent_id]);
    assert.equal(n.length, 1);
  });

  test('supervision du super-administrateur (aucune donnée nominative)', async () => {
    const r = await api().get('/api/admin/supervision').set(bearer(S.superAdmin.token));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.services.base_de_donnees.ok, true);
    // Le test précédent a falsifié le journal directement en base : la supervision doit le signaler
    assert.equal(r.body.securite.journal_integre.valide, false);
    assert.ok(r.body.activite.pharmacies > 600);
    const refuse = await api().get('/api/admin/supervision').set(bearer(S.adminKx.token));
    assert.equal(refuse.status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Portails des établissements (plateforme multi-établissements)', () => {
  test('« Où êtes-vous suivi ? » : établissements en ligne d’abord, autres avec l’icône générique', async () => {
    const r = await api().get('/api/portails').query({ lat: 14.69, lng: -17.46 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [premier] = r.body.etablissements;
    assert.equal(premier.en_ligne, true);
    const thiaroye = r.body.etablissements.find((e) => e.code === 'thiaroye');
    assert.ok(thiaroye, 'Thiaroye est dans l’annuaire');
    assert.equal(thiaroye.en_ligne, false);
    assert.equal(thiaroye.logo_url, null);
    assert.equal(thiaroye.icone, 'HOPITAL_GENERIQUE');
    // Les points OpenStreetMap hors santé mentale ne sont plus dans l’annuaire
    assert.ok(r.body.total < 60, `${r.body.total} établissements`);
  });

  test('recherche par public (personnes âgées) et par établissement de rattachement', async () => {
    const agees = await api().get('/api/portails').query({ public: 'PERSONNE_AGEE' });
    assert.ok(agees.body.etablissements.some((e) => e.code === 'moussa-diop'));
    assert.ok(!agees.body.etablissements.some((e) => e.code === 'keur-xaleyi'));
    const fann = await api().get('/api/portails').query({ parent: 'fann' });
    const codes = fann.body.etablissements.map((e) => e.code).sort();
    assert.deepEqual(codes, ['cepiad', 'fann-neurologie', 'keur-xaleyi', 'moussa-diop']);
  });

  test('page du portail : logo, services et boutons ; un établissement de l’annuaire propose seulement d’appeler', async () => {
    const cp = await api().get('/api/portails/cepiad');
    assert.equal(cp.status, 200);
    assert.equal(cp.body.etablissement.logo_url, '/media/structures/cepiad_logo.png');
    assert.equal(cp.body.etablissement.parent.code, 'fann');
    assert.ok(cp.body.services.length >= 2);
    assert.equal(cp.body.actions.inscription_famille, true);
    const logo = await api().get(cp.body.etablissement.logo_url);
    assert.equal(logo.status, 200);
    assert.match(logo.headers['content-type'], /image\/png/);

    const fann = await api().get('/api/portails/fann');
    assert.equal(fann.body.rattaches.length, 4);
    const th = await api().get('/api/portails/thiaroye');
    assert.equal(th.body.actions.inscription_famille, false);
    assert.equal(th.body.actions.demander_adhesion, true);
    assert.equal((await api().get('/api/portails/inconnu-xyz')).status, 404);
    assert.equal((await api().get('/api/portails/..%2F..%2Fetc')).status, 400);
    assert.equal((await api().get('/media/../.env')).status, 404);
  });

  test('une famille rejoint un établissement en ligne, l’accueil accepte ; impossible dans un établissement hors ligne', async () => {
    const h = bearer(S.parent2.token);
    const hors = await api().post('/api/portails/thiaroye/inscription').set(h).send({});
    assert.equal(hors.status, 400);
    assert.equal(hors.body.code, 'PAS_ENCORE_EN_LIGNE');

    const ok = await api().post('/api/portails/cepiad/inscription').set(h).send({ service_code: 'psychologie', origine: 'QR_CODE' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const deux = await api().post('/api/portails/cepiad/inscription').set(h).send({});
    assert.equal(deux.status, 409);

    const mes = await api().get('/api/moi/etablissements').set(h);
    assert.equal(mes.status, 200);
    const tuile = mes.body.etablissements.find((e) => e.code === 'cepiad');
    assert.equal(tuile.inscription.statut, 'DEMANDEE');
    assert.equal(tuile.inscription.service, 'Soutien psychologique');
    assert.equal(tuile.logo_url, '/media/structures/cepiad_logo.png');

    // Le même médecin, dans le contexte de Keur Xaleyi, ne voit ni ne traite cette demande
    const kx = await api().get('/api/inscriptions').set(bearer(S.medecin.token, S.kx));
    assert.equal(kx.status, 200);
    assert.ok(!kx.body.inscriptions.some((i) => i.id === ok.body.inscription.id));
    const vol = await api().put(`/api/inscriptions/${ok.body.inscription.id}`).set(bearer(S.medecin.token, S.kx)).send({ statut: 'ACTIVE' });
    assert.equal(vol.status, 404, 'RLS : inscription invisible depuis une autre structure');

    // Dans le contexte du CEPIAD, il la voit et l’accepte
    const cp = await api().get('/api/inscriptions').set(bearer(S.medecin.token, S.cp)).query({ statut: 'DEMANDEE' });
    assert.ok(cp.body.inscriptions.some((i) => i.id === ok.body.inscription.id));
    const acc = await api().put(`/api/inscriptions/${ok.body.inscription.id}`).set(bearer(S.medecin.token, S.cp)).send({ statut: 'ACTIVE' });
    assert.equal(acc.status, 200, JSON.stringify(acc.body));
    const apres = await api().get('/api/moi/etablissements').set(h);
    assert.equal(apres.body.etablissements.find((e) => e.code === 'cepiad').inscription.statut, 'ACTIVE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notifications hors application : Telegram, WhatsApp, SMS Orange', () => {
  // Les vrais fournisseurs sont simulés : on vérifie EXACTEMENT ce qui leur serait envoyé.
  const appels = [];
  let fetchOrigine; let pannes = {};
  before(() => {
    const env = require('../src/config/env');
    Object.assign(env.telegram, { token: '123:FAUX', bot: 'samaxhel_test_bot', secretWebhook: 'secret-webhook-de-test-0123456789' });
    Object.assign(env.whatsapp, { token: 'FAUX', numeroId: '1111' });
    Object.assign(env.orangeSms, { clientId: 'id', clientSecret: 'secret', expediteur: 'tel:+2210000' });
    env.smsFournisseur = 'orange';
    fetchOrigine = global.fetch;
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      const corps = typeof opts.body === 'string' ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : opts.body;
      appels.push({ url: u, headers: opts.headers, corps });
      const rep = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('api.telegram.org')) return pannes.telegram ? rep({ ok: false, description: 'Forbidden: bot was blocked by the user' }, 403) : rep({ ok: true, result: { message_id: 42 } });
      if (u.includes('graph.facebook.com')) return pannes.whatsapp ? rep({ error: { message: 'Recipient not in allowed list' } }, 400) : rep({ messages: [{ id: 'wamid.X' }] });
      if (u.includes('/oauth/v3/token')) return rep({ access_token: 'jeton-orange', expires_in: 3600 });
      if (u.includes('smsmessaging')) return rep({ outboundSMSMessageRequest: { resourceURL: 'https://api.orange.com/x/requests/abc123' } }, 201);
      return fetchOrigine(url, opts);
    };
  });
  after(() => { global.fetch = fetchOrigine; });

  test('SMS Orange : jeton OAuth puis envoi au bon format', async () => {
    require('../src/services/canaux/orange')._reinitialiser();
    appels.length = 0;
    const { sendSms } = require('../src/services/sms.service');
    const r = await sendSms('+221770000099', 'Bonjour');
    assert.equal(r.id, 'abc123');
    assert.match(appels[0].url, /oauth\/v3\/token/);
    assert.equal(appels[0].headers.Authorization, `Basic ${Buffer.from('id:secret').toString('base64')}`);
    assert.equal(appels[1].url, 'https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2210000/requests');
    assert.equal(appels[1].corps.outboundSMSMessageRequest.address, 'tel:+221770000099');
    assert.equal(appels[1].headers.Authorization, 'Bearer jeton-orange');
    await sendSms('+221770000099', 'Encore');
    assert.equal(appels.filter((a) => a.url.includes('oauth')).length, 1, 'le jeton est réutilisé');
  });

  test('relier Telegram : lien à usage unique, puis le code de connexion part sur Telegram', async () => {
    const h = bearer(S.parent2.token);
    const lien = await api().post('/api/moi/telegram').set(h);
    assert.equal(lien.status, 200, JSON.stringify(lien.body));
    assert.match(lien.body.url, /^https:\/\/t\.me\/samaxhel_test_bot\?start=[A-Za-z0-9_-]{24}$/);
    const jeton = lien.body.url.split('start=')[1];

    // Faux webhook refusé, vrai webhook accepté
    const faux = await api().post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'mauvais').send({});
    assert.equal(faux.status, 403);
    const maj = { update_id: 1, message: { chat: { id: 987654321 }, text: `/start ${jeton}` } };
    const ok = await api().post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'secret-webhook-de-test-0123456789').send(maj);
    assert.equal(ok.status, 200);
    const [u] = await requeteAdmin('SELECT telegram_chat_id FROM users WHERE id = $1', [S.parent2.user.id]);
    assert.equal(u.telegram_chat_id, '987654321');

    // Le même lien ne sert pas deux fois (un autre chat ne peut pas le réutiliser)
    await api().post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'secret-webhook-de-test-0123456789')
      .send({ update_id: 2, message: { chat: { id: 111 }, text: `/start ${jeton}` } });
    const [u2] = await requeteAdmin('SELECT telegram_chat_id FROM users WHERE id = $1', [S.parent2.user.id]);
    assert.equal(u2.telegram_chat_id, '987654321');

    const etat = await api().get('/api/moi/canaux').set(h);
    assert.equal(etat.body.telegram.relie, true);
    assert.equal(etat.body.ordre[0], 'TELEGRAM', 'Telegram (gratuit) passe avant le SMS');
  });

  test('message de test : Telegram d’abord ; s’il échoue, WhatsApp, puis SMS — tout est journalisé sans contenu', async () => {
    const h = bearer(S.parent2.token);
    appels.length = 0;
    const t1 = await api().post('/api/moi/canaux/test').set(h).send({});
    assert.deepEqual(t1.body.envoye_par, ['telegram']);
    assert.ok(appels.some((a) => a.url.endsWith('/sendMessage') && a.corps.chat_id === '987654321'));
    assert.ok(!appels.some((a) => a.url.includes('smsmessaging')), 'pas de SMS payant si Telegram a marché');

    await api().put('/api/moi/canaux').set(h).send({ whatsapp_accepte: true });
    pannes = { telegram: true };
    appels.length = 0;
    const t2 = await api().post('/api/moi/canaux/test').set(h).send({});
    assert.deepEqual(t2.body.envoye_par, ['whatsapp']);
    const wa = appels.find((a) => a.url.includes('graph.facebook.com'));
    assert.equal(wa.corps.type, 'template');
    assert.equal(wa.corps.to, '221771234567');

    pannes = { telegram: true, whatsapp: true };
    const t3 = await api().post('/api/moi/canaux/test').set(h).send({});
    assert.deepEqual(t3.body.envoye_par, ['sms']);
    pannes = {};

    const journal = await requeteAdmin("SELECT canal, statut, erreur FROM envois WHERE user_id = $1 AND type = 'TEST' ORDER BY id", [S.parent2.user.id]);
    assert.deepEqual(journal.map((j) => `${j.canal}:${j.statut}`),
      ['TELEGRAM:ENVOYE', 'TELEGRAM:ECHEC', 'WHATSAPP:ENVOYE', 'TELEGRAM:ECHEC', 'WHATSAPP:ECHEC', 'SMS:ENVOYE']);
    const cols = await requeteAdmin("SELECT column_name FROM information_schema.columns WHERE table_name = 'envois'");
    assert.ok(!cols.some((c) => /corps|texte|contenu|message/.test(c.column_name)), 'aucun contenu stocké');
  });

  test('préférence : le parent choisit le SMS en premier ; /stop sur Telegram délie le compte', async () => {
    const h = bearer(S.parent2.token);
    const p = await api().put('/api/moi/canaux').set(h).send({ canaux_preferes: ['SMS', 'TELEGRAM'] });
    assert.equal(p.status, 200);
    assert.equal(p.body.ordre[0], 'SMS');
    const doublon = await api().put('/api/moi/canaux').set(h).send({ canaux_preferes: ['SMS', 'SMS'] });
    assert.equal(doublon.status, 400);
    await api().post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'secret-webhook-de-test-0123456789')
      .send({ update_id: 3, message: { chat: { id: 987654321 }, text: '/stop' } });
    const etat = await api().get('/api/moi/canaux').set(h);
    assert.equal(etat.body.telegram.relie, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Sécurité avancée : IA prédictive et blockchain (mémoire 4.3.6)', () => {
  test('ancrage : l’empreinte du dernier maillon part vers OpenTimestamps et la preuve .ots est téléchargeable', async () => {
    // Réponse simulée d'un calendrier : opérations « ajouter un nonce » puis SHA-256 (format OpenTimestamps)
    const reponseCalendrier = Buffer.from(`f010${'00'.repeat(16)}08`, 'hex');
    const envoyes = [];
    const fetchOrigine = global.fetch;
    global.fetch = async (url, opts = {}) => {
      if (String(url).endsWith('/digest')) { envoyes.push({ url: String(url), corps: opts.body }); return new Response(reponseCalendrier, { status: 200 }); }
      return fetchOrigine(url, opts);
    };
    try {
      const r = await api().post('/api/admin/ancrages').set(bearer(S.superAdmin.token));
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.ancre, true);
      assert.equal(envoyes.length, 2, 'deux calendriers (redondance)');
      assert.equal(envoyes[0].corps.length, 32, 'seuls 32 octets quittent le serveur');
      const [dernier] = await requeteAdmin('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1 OFFSET 0');
      assert.ok(dernier, 'journal non vide');
      const liste = await api().get('/api/admin/ancrages').set(bearer(S.superAdmin.token));
      const a = liste.body.ancrages[0];
      assert.equal(a.statut, 'EN_ATTENTE');
      assert.equal(Buffer.from(envoyes[0].corps).toString('hex'), a.empreinte);
      const preuve = await api().get(`/api/admin/ancrages/${a.id}/preuve`).set(bearer(S.superAdmin.token))
        .buffer(true).parse((res, cb) => { const b = []; res.on('data', (c) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); });
      assert.equal(preuve.status, 200);
      const { MAGIC } = require('../src/services/securite/ancrage.service');
      assert.ok(preuve.body.subarray(0, MAGIC.length).equals(MAGIC), 'en-tête officiel OpenTimestamps');
      assert.equal(preuve.body.subarray(MAGIC.length + 2, MAGIC.length + 34).toString('hex'), a.empreinte);
      const refuse = await api().get('/api/admin/ancrages').set(bearer(S.adminKx.token));
      assert.equal(refuse.status, 403);
    } finally { global.fetch = fetchOrigine; }
  });

  test('IA d’accès : 60 dossiers ouverts à 3 h du matin par un soignant habitué à 4 par heure → alerte', async () => {
    const [m] = await requeteAdmin("SELECT id FROM users WHERE email = 'medecin@samaxhel.sn'");
    // Habitude sur 20 jours : environ 4 lectures par heure, en journée
    await requeteAdmin(`
      INSERT INTO audit_logs (user_id, role, structure_id, action, ressource, ip, statut_http, created_at)
      SELECT $1, 'MEDECIN', $2, 'LECTURE', 'enfant', '10.0.0.1', 200,
             date_trunc('day', NOW()) - (j || ' days')::interval + ((9 + h) || ' hours')::interval + (k || ' minutes')::interval
        FROM generate_series(1, 20) j, generate_series(0, 6) h, generate_series(1, 4) k`, [m.id, S.kx]);
    // Heure en cours : 60 lectures
    await requeteAdmin(`
      INSERT INTO audit_logs (user_id, role, structure_id, action, ressource, ip, statut_http, created_at)
      SELECT $1, 'MEDECIN', $2, 'LECTURE', 'enfant', '10.0.0.1', 200, NOW() - (k || ' seconds')::interval
        FROM generate_series(1, 60) k`, [m.id, S.kx]);
    const { executer } = require('../src/services/rappels.service');
    const b = await executer();
    assert.ok(b.alertes >= 1, JSON.stringify(b));
    const r = await api().get('/api/admin/securite/alertes').set(bearer(S.superAdmin.token)).query({ statut: 'NOUVELLE' });
    const volume = r.body.alertes.find((a) => a.type === 'VOLUME_INHABITUEL');
    assert.ok(volume, JSON.stringify(r.body));
    assert.ok(Number(volume.score) >= 3, 'au moins 3 écarts-types au-dessus de l’habitude');
    assert.ok(!JSON.stringify(volume.details).match(/enfant_id|nom_chiffre|diagnostic/), 'aucune donnée médicale');
    // L'administrateur de Keur Xaleyi la voit aussi, et la classe
    const kx = await api().get('/api/admin/securite/alertes').set(bearer(S.adminKx.token, S.kx));
    assert.ok(kx.body.alertes.some((a) => a.id === volume.id));
    const t = await api().put(`/api/admin/securite/alertes/${volume.id}`).set(bearer(S.adminKx.token, S.kx)).send({ statut: 'FAUX_POSITIF' });
    assert.equal(t.status, 200);
    const n = await requeteAdmin("SELECT 1 FROM notifications WHERE type = 'ALERTE_SECURITE'");
    assert.ok(n.length >= 1, 'super-administrateur et administrateur prévenus');
    const b2 = await executer();
    assert.equal(b2.alertes, 0, 'pas d’alerte en double dans la même heure');
  });

  test('IA prédictive : famille souvent absente → risque élevé, rappel anticipé à 48 h sur tous les canaux', async () => {
    const [p] = await requeteAdmin("SELECT id FROM users WHERE email = 'parent@samaxhel.sn'");
    const ins = (statut, date) => requeteAdmin(
      `INSERT INTO rendez_vous (structure_id, enfant_id, parent_id, statut, date_confirmee, created_at)
       VALUES ($1, $2, $3, $4, ${date}, NOW() - INTERVAL '40 days') RETURNING id`, [S.kx, S.enfant.id, p.id, statut]);
    await ins('ABSENT', "NOW() - INTERVAL '20 days'");
    await ins('ABSENT', "NOW() - INTERVAL '10 days'");
    const [rdv] = await ins('CONFIRME', "NOW() + INTERVAL '36 hours'");
    const { executer } = require('../src/services/rappels.service');
    const b = await executer();
    const [r] = await requeteAdmin('SELECT risque_absence, risque_facteurs FROM rendez_vous WHERE id = $1', [rdv.id]);
    assert.ok(r.risque_absence >= 50, `risque ${r.risque_absence} %`);
    assert.equal(r.risque_facteurs[0].facteur, 'absences précédentes', 'le score est expliqué');
    assert.ok(b.rdv_risque >= 1);
    const n = await requeteAdmin("SELECT titre FROM notifications WHERE user_id = $1 AND titre = 'Rendez-vous dans 2 jours'", [p.id]);
    assert.equal(n.length, 1);
    assert.equal((await executer()).rdv_risque, 0, 'une seule fois');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Chaque établissement : son portail, ses comptes, son personnel réel', () => {
  test('connexion par le portail du CEPIAD : seul un compte du CEPIAD entre', async () => {
    const ok = await api().post('/api/auth/login').send({ identifier: 'direction@cepiad.samaxhel.sn', password: MDP, portail: 'cepiad' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.mfa_required, true, 'code de sécurité obligatoire');
    const autre = await api().post('/api/auth/login').send({ identifier: 'direction@keur-xaleyi.samaxhel.sn', password: MDP, portail: 'cepiad' });
    assert.equal(autre.status, 403);
    assert.equal(autre.body.code, 'NOT_A_MEMBER');
    const annuaire = await api().post('/api/auth/login').send({ identifier: 'direction@cepiad.samaxhel.sn', password: MDP, portail: 'thiaroye' });
    assert.equal(annuaire.status, 404, 'pas de portail de connexion pour un établissement hors ligne');
  });

  test('le directeur invite une vraie médecin : lien à usage unique, compte créé dans CET établissement seulement', async () => {
    const r1 = await api().post('/api/auth/login').send({ identifier: 'direction@cepiad.samaxhel.sn', password: MDP, portail: 'cepiad' });
    const [u] = await requeteAdmin("SELECT id FROM users WHERE email = 'direction@cepiad.samaxhel.sn'");
    const r2 = await api().post('/api/auth/mfa/verify').send({ mfa_token: r1.body.mfa_token, code: otp.dernierCodePourTests('mfa', u.id) });
    assert.equal(r2.status, 200);
    const inv = await api().post('/api/etablissement/invitations').set(bearer(r2.body.token))
      .send({ role: 'MEDECIN', destinataire: '77 555 44 33', service_code: 'consultation' });
    assert.equal(inv.status, 201, JSON.stringify(inv.body));
    const jeton = inv.body.lien.split('#invitation=')[1];
    const [stocke] = await requeteAdmin('SELECT jeton_hash FROM invitations ORDER BY created_at DESC LIMIT 1');
    assert.notEqual(stocke.jeton_hash, jeton, 'le jeton n’est jamais stocké en clair');

    const infos = await api().get(`/api/invitations/${jeton}`);
    assert.equal(infos.status, 200, JSON.stringify(infos.body) + ' ' + jeton);
    assert.equal(infos.body.etablissement.code, 'cepiad');
    const acc = await api().post(`/api/invitations/${jeton}/accepter`)
      .send({ prenom: 'Khady', nom: 'Fall', password: 'Medecine2026x', numero_ordre: 'SN-1234' });
    assert.equal(acc.status, 201, JSON.stringify(acc.body));
    const deux = await api().post(`/api/invitations/${jeton}/accepter`).send({ prenom: 'X', nom: 'Y', password: 'Medecine2026x', email: 'x@exemple.sn' });
    assert.equal(deux.status, 404, 'usage unique');
    const [m] = await requeteAdmin(
      "SELECT m.role, m.statut, s.code FROM membres_structure m JOIN users u ON u.id = m.user_id JOIN structures s ON s.id = m.structure_id WHERE u.telephone = '+221775554433'");
    assert.deepEqual({ ...m }, { role: 'MEDECIN', statut: 'ACTIF', code: 'cepiad' });
    const ailleurs = await api().post('/api/auth/login').send({ identifier: '775554433', password: 'Medecine2026x', portail: 'keur-xaleyi' });
    assert.equal(ailleurs.status, 403);
  });

  test('un soignant en attente suit son dossier (sans accès aux patients)', async () => {
    const r = await api().post('/api/auth/candidature/statut').send({ identifier: 'medecin@samaxhel.sn', password: MDP });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.candidatures) && r.body.etapes.length === 4);
    const faux = await api().post('/api/auth/candidature/statut').send({ identifier: 'medecin@samaxhel.sn', password: 'faux' });
    assert.equal(faux.status, 401);
  });

  test('une famille demande un rendez-vous sans « prise en charge » préalable : le dossier s’ouvre seul', async () => {
    const h = bearer(S.parent2.token);
    const p = await api().post('/api/enfants').set(h).send({ prenom: 'Awa', nom: 'Sow', date_naissance: '1990-04-02', sexe: 'F', lien: 'SOI' });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    assert.equal(p.body.enfant.lien, 'SOI');
    const [md] = await requeteAdmin("SELECT id FROM structures WHERE code = 'moussa-diop'");
    const rdv = await api().post('/api/rendez-vous').set(h).send({ enfant_id: p.body.enfant.id, structure_id: md.id, type: 'PRESENTIEL', motif: 'Je dors mal depuis des mois' });
    assert.equal(rdv.status, 201, JSON.stringify(rdv.body));
    const [s] = await requeteAdmin('SELECT statut FROM suivis WHERE enfant_id = $1 AND structure_id = $2', [p.body.enfant.id, md.id]);
    assert.equal(s.statut, 'DEMANDE');
    const tests = await api().get('/api/questionnaires').query({ age_mois: 430 });
    const codes = tests.body.questionnaires.map((q) => q.code);
    assert.ok(codes.includes('TSAADULTE') && codes.includes('TSA'), 'tous les tests proposés, même ceux d’un autre âge');
    assert.equal(tests.body.questionnaires[0].adapte, true, 'les tests adaptés à l’âge d’abord');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('La maison de l’hôpital : médecin visible, caisse, tickets, file d’attente', () => {
  const connecterPortail = async (email, portail) => {
    const r1 = await api().post('/api/auth/login').send({ identifier: email, password: MDP, portail });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    const [u] = await requeteAdmin('SELECT id FROM users WHERE email = $1', [email]);
    const r2 = await api().post('/api/auth/mfa/verify').send({ mfa_token: r1.body.mfa_token, code: otp.dernierCodePourTests('mfa', u.id) });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.user.structure.code, portail, 'la session porte la maison (code, logo, couleur)');
    return bearer(r2.body.token);
  };

  test('le personnel sans portail est renvoyé vers le portail de SON établissement', async () => {
    const r = await api().post('/api/auth/login').send({ identifier: 'accueil@cepiad.samaxhel.sn', password: MDP });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'PORTAIL_REQUIS');
    assert.deepEqual(r.body.details.portails.map((p) => p.code), ['cepiad']);
    const faux = await api().post('/api/auth/login').send({ identifier: 'accueil@cepiad.samaxhel.sn', password: 'faux' });
    assert.equal(faux.status, 401, 'aucune indication sans le bon mot de passe');
  });

  test('famille : connexion au portail du CEPIAD → rejoindre → acceptée → elle voit SON médecin', async () => {
    const login = await api().post('/api/auth/login').send({ identifier: 'parent@samaxhel.sn', password: MDP, portail: 'cepiad' });
    assert.equal(login.status, 200);
    assert.equal(login.body.portail.code, 'cepiad');
    const h = bearer(login.body.token);
    const p = await api().post('/api/enfants').set(h).send({ prenom: 'Modou', nom: 'Faye', date_naissance: '1985-02-11', sexe: 'M', lien: 'PROCHE' });
    const ins = await api().post('/api/portails/cepiad/inscription').set(h).send({ personne_id: p.body.enfant.id, motif: 'Consommation' });
    assert.equal(ins.status, 201, JSON.stringify(ins.body));
    let m = await api().get('/api/moi/etablissements/cepiad').set(h);
    assert.equal(m.status, 200, JSON.stringify(m.body));
    assert.equal(m.body.inscription.statut, 'DEMANDEE');
    assert.equal(m.body.soignants.length, 0, 'pas de soignant visible avant validation');

    const accueil = await connecterPortail('accueil@cepiad.samaxhel.sn', 'cepiad');
    const liste = await api().get('/api/inscriptions').set(accueil).query({ statut: 'DEMANDEE' });
    const mienne = liste.body.inscriptions.find((i) => i.id === ins.body.inscription.id);
    assert.ok(mienne);
    const sg = await api().get('/api/etablissement/soignants').set(accueil);
    assert.ok(sg.body.soignants.length >= 1);
    const ok = await api().put(`/api/inscriptions/${mienne.id}`).set(accueil).send({ statut: 'ACTIVE' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    m = await api().get('/api/moi/etablissements/cepiad').set(h);
    assert.equal(m.body.inscription.statut, 'ACTIVE');
    const dossier = m.body.dossiers.find((d) => d.personne_id === p.body.enfant.id);
    assert.equal(dossier.statut, 'ACTIF');
    assert.ok(dossier.referent, 'un soignant référent est désigné automatiquement');
    assert.ok(m.body.soignants.some((s) => s.id === dossier.referent.id), 'la famille voit les soignants de l’établissement');
    assert.ok(m.body.tarifs.length >= 3, 'tarifs de la caisse visibles');
    // Elle peut écrire en privé à son médecin et lui demander un rendez-vous (vidéo possible)
    const conv = await api().post('/api/conversations').set(h).send({ professionnel_id: dossier.referent.id, structure_id: m.body.etablissement.id, enfant_id: p.body.enfant.id });
    assert.equal(conv.status, 201, JSON.stringify(conv.body));
    const rdv = await api().post('/api/rendez-vous').set(h).send({ enfant_id: p.body.enfant.id, structure_id: m.body.etablissement.id, type: 'TELECONSULTATION', professionnel_id: dossier.referent.id });
    assert.equal(rdv.status, 201, JSON.stringify(rdv.body));
    // Ailleurs (Keur Xaleyi), rien n'apparaît : les maisons sont séparées
    const kx = await api().get('/api/moi/etablissements/keur-xaleyi').set(h);
    assert.equal(kx.body.dossiers.filter((d) => d.personne_id === p.body.enfant.id).length, 0);
    S.maison = { h, accueil, personne: p.body.enfant.id, tarifs: m.body.tarifs };
  });

  test('caisse : espèces à l’entrée (patient sans application) → ticket numéroté, file, appel, Excel', async () => {
    const { accueil, tarifs } = S.maison;
    const tarif = tarifs.find((t) => t.code === 'ticket-consultation');
    const t1 = await api().post('/api/caisse/tickets').set(accueil)
      .send({ tarif_id: tarif.id, mode_paiement: 'ESPECES', patient: { prenom: 'Ndeye', nom: 'Sarr', telephone: '77 111 22 33' } });
    assert.equal(t1.status, 201, JSON.stringify(t1.body));
    assert.match(t1.body.ticket.numero, /^A-\d{3}$/);
    assert.equal(t1.body.ticket.montant, 3000);
    assert.ok(t1.body.ticket.orientation, 'le ticket dit où aller');
    const t2 = await api().post('/api/caisse/tickets').set(accueil)
      .send({ tarif_id: tarif.id, mode_paiement: 'WAVE', reference: 'T-8891', patient: { prenom: 'Pape', nom: 'Gueye' } });
    assert.equal(Number(t2.body.ticket.numero.slice(2)), Number(t1.body.ticket.numero.slice(2)) + 1, 'numéros qui se suivent');
    const [brut] = await requeteAdmin('SELECT prenom_chiffre FROM patients_registre ORDER BY created_at DESC LIMIT 1');
    assert.match(brut.prenom_chiffre, /^v1:/, 'nom chiffré dans le registre');
    const reg = await api().get('/api/caisse/registre').set(accueil).query({ q: '771112233' });
    assert.equal(reg.body.patients[0].prenom, 'Ndeye', 'retrouvé par téléphone (index aveugle)');

    const ecran = await api().get('/api/portails/cepiad/file');
    assert.ok(ecran.body.en_attente.includes(t1.body.ticket.numero));
    assert.ok(!JSON.stringify(ecran.body).includes('Ndeye'), 'l’écran de la salle d’attente n’affiche aucun nom');

    const medecin = await connecterPortail('medecin@cepiad.samaxhel.sn', 'cepiad');
    const appel = await api().post('/api/caisse/appeler').set(medecin).send({ bureau: 'bureau 4' });
    assert.equal(appel.body.ticket.numero, t1.body.ticket.numero, 'le plus ancien est appelé en premier');
    const ecran2 = await api().get('/api/portails/cepiad/file');
    assert.equal(ecran2.body.appeles[0].numero, t1.body.ticket.numero);
    assert.equal(ecran2.body.appeles[0].bureau, 'bureau 4');

    const j = await api().get('/api/caisse/tickets').set(accueil);
    assert.ok(j.body.total >= 6000);
    assert.ok(j.body.totaux.ESPECES >= 3000 && j.body.totaux.WAVE >= 3000);
    const x = await api().get('/api/caisse/export').set(accueil).buffer(true).parse((res, cb) => {
      const d = []; res.on('data', (c) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d)));
    });
    assert.equal(x.status, 200);
    assert.equal(x.body.slice(0, 2).toString(), 'PK', 'fichier Excel (.xlsx)');
    const supp = await requeteAdmin('DELETE FROM tickets WHERE id = $1', [t1.body.ticket.id]).catch((e) => e);
    assert.ok(supp instanceof Error, 'une ligne de caisse ne se supprime jamais');
  });

  test('famille : ticket payé d’avance par Wave → la caisse confirme → la famille est prévenue', async () => {
    const { h, accueil, personne, tarifs } = S.maison;
    const tarif = tarifs.find((t) => t.code === 'seance');
    const sans = await api().post('/api/moi/tickets').set(h).send({ etablissement: 'cepiad', tarif_id: tarif.id, personne_id: personne, mode_paiement: 'WAVE' });
    assert.equal(sans.status, 400, 'référence de transaction obligatoire');
    const r = await api().post('/api/moi/tickets').set(h).send({ etablissement: 'cepiad', tarif_id: tarif.id, personne_id: personne, mode_paiement: 'WAVE', reference: 'WV-77412' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.ticket.statut, 'A_CONFIRMER');
    const ecran = await api().get('/api/portails/cepiad/file');
    assert.ok(!ecran.body.en_attente.includes(r.body.ticket.numero), 'pas dans la file tant que la caisse n’a pas confirmé');
    const c = await api().put(`/api/caisse/tickets/${r.body.ticket.id}`).set(accueil).send({ action: 'CONFIRMER' });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.ticket.statut, 'PAYE');
    const mes = await api().get('/api/moi/tickets').set(h).query({ etablissement: 'cepiad' });
    assert.equal(mes.body.tickets[0].statut, 'PAYE');
    const [n] = await requeteAdmin("SELECT titre FROM notifications WHERE titre = $1", [`Ticket ${r.body.ticket.numero} payé`]);
    assert.ok(n, 'notification « ticket payé »');
    const autre = await api().post('/api/caisse/tickets').set(h).send({ tarif_id: tarif.id, mode_paiement: 'ESPECES', personne_id: personne });
    assert.equal(autre.status, 403, 'une famille ne peut pas encaisser');
  });

  test('import du fichier Excel du CEPIAD dans le registre (colonnes reconnues, noms chiffrés)', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Patients');
    ws.addRow(['N°', 'Prénom', 'Nom', 'Téléphone', 'Date de naissance', 'Sexe', 'Observations']);
    ws.addRow([1, 'Moussa', 'Ba', '77 222 33 44', '12/03/1990', 'M', 'Suivi méthadone']);
    ws.addRow([2, 'Fatou', 'Kane', '', '', 'F', '']);
    const fichier = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await api().post('/api/caisse/registre/import').set(S.maison.accueil)
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(fichier);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.importes, 2);
    const reg = await api().get('/api/caisse/registre').set(S.maison.accueil).query({ q: 'moussa' });
    assert.equal(reg.body.patients[0].date_naissance.slice(0, 10), '1990-03-12');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Studio des voix : de vraies voix en langues nationales', () => {
  test('le super-admin enregistre une phrase en sérère ; tout le monde peut l’écouter ; une famille ne peut pas en déposer', async () => {
    const os = require('os'); const fs = require('fs'); const path = require('path');
    process.env.VOIX_DIR = process.env.VOIX_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'voix-'));
    const [u] = await requeteAdmin("SELECT id FROM users WHERE email = 'admin@samaxhel.sn'");
    const r1 = await api().post('/api/auth/login').send({ identifier: 'admin@samaxhel.sn', password: MDP });
    const r2 = await api().post('/api/auth/mfa/verify').send({ mfa_token: r1.body.mfa_token, code: otp.dernierCodePourTests('mfa', u.id) });
    const admin = bearer(r2.body.token);
    const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(4000, 7)]);
    const ok = await api().post('/api/admin/voix/srr/bienvenue').set(admin).set('Content-Type', 'audio/mpeg').send(audio);
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const cat = await api().get('/api/voix/catalogue');
    assert.match(cat.body.fichiers.srr.bienvenue, /^\/media-voix\/srr\/bienvenue\.mp3$/);
    const fichier = await api().get(cat.body.fichiers.srr.bienvenue);
    assert.equal(fichier.status, 200);
    const mauvais = await api().post('/api/admin/voix/xx/bienvenue').set(admin).set('Content-Type', 'audio/mpeg').send(audio);
    assert.equal(mauvais.status, 400, 'langue inconnue refusée');
    const famille = await api().post('/api/admin/voix/srr/bienvenue').set(bearer(S.parent.token)).set('Content-Type', 'audio/mpeg').send(audio);
    assert.equal(famille.status, 403);
    assert.equal((await api().delete('/api/admin/voix/srr/bienvenue').set(admin)).status, 200);
  });
});
