'use strict';
/**
 * USSD (*xxx#) — pour les parents SANS smartphone ni internet (téléphone simple, « kaolin »).
 * Fonctionne sur tous les téléphones, sans crédit data, via Africa's Talking (code USSD loué
 * auprès des opérateurs). Le serveur reçoit { sessionId, serviceCode, phoneNumber, text } et répond :
 *   « CON … » = afficher un menu et attendre ; « END … » = afficher et terminer.
 * Écrans courts (≤ 182 caractères), en français et en wolof simple.
 *
 *  1. Trouver un centre (par région) → les 3 structures les plus adaptées + envoi de la liste par SMS
 *  2. Être rappelé par un centre → demande de rappel enregistrée, la secrétaire rappelle
 *  3. Urgence → SAMU 1515
 */
const { pool, withContext } = require('../config/database');
const env = require('../config/env');
const { sendSms } = require('../services/sms.service');
const { notifierStructure } = require('../services/membres.service');
const { chiffrer, indexAveugle } = require('../utils/crypto');

const REGIONS = ['Dakar', 'Thiès', 'Diourbel', 'Fatick', 'Kaolack', 'Kaffrine', 'Saint-Louis', 'Louga', 'Matam',
  'Tambacounda', 'Kédougou', 'Kolda', 'Sédhiou', 'Ziguinchor'];
const menuRegions = (debut) => REGIONS.map((r, i) => `${i + 1} ${r}`).slice(debut, debut + 7).join('\n');

const ACCUEIL = 'CON SAMA XHEL - Santé de nos enfants\n1 Trouver un centre (Seet fajkat)\n2 Être rappelé (Ñu woo la)\n3 Urgence (Musiba)';

async function structuresDeRegion(region) {
  const { rows } = await pool.query(
    `SELECT id, nom, sigle, telephone FROM structures
     WHERE actif AND region = $1 AND cardinality(troubles) > 0
     ORDER BY partenaire DESC, verifie DESC, cout_niveau ASC NULLS LAST LIMIT 3`, [region]);
  if (rows.length) return rows;
  // Aucune structure spécialisée dans la région : on propose les centres nationaux de référence
  const { rows: nat } = await pool.query(
    `SELECT id, nom, sigle, telephone FROM structures WHERE actif AND partenaire ORDER BY nom LIMIT 3`);
  return nat;
}

/** Choix de région en 2 pages (7 + 7) pour tenir dans un écran USSD */
function lireRegion(parts) {
  // parts : ['1', '8'] (page suivante) puis ['1','8','3'] etc.
  if (parts[1] === '8') {
    if (!parts[2]) return { ecran: `CON Région (suite)\n${menuRegions(7)}` };
    const i = Number(parts[2]) - 1;
    return { region: REGIONS[i], suite: parts.slice(3) };
  }
  const i = Number(parts[1]) - 1;
  if (Number.isNaN(i) || i < 0 || i > 6) return { ecran: 'END Choix invalide. Recomposez le code.' };
  return { region: REGIONS[i], suite: parts.slice(2) };
}

// ── POST /api/ussd  (rappel Africa's Talking, application/x-www-form-urlencoded) ──
async function ussd(req, res) {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  if (env.ussdIpAutorisees.length && !env.ussdIpAutorisees.includes(req.ip)) return res.status(403).send('END Accès refusé');
  const { phoneNumber: tel, text = '' } = req.body;
  const parts = String(text).split('*').filter((x) => x !== '');

  if (!parts.length) return res.send(ACCUEIL);

  if (parts[0] === '3') {
    return res.send('END En cas de danger, appelez le SAMU : 1515\nNdimbal gaaw : woo 1515');
  }

  if (parts[0] === '1' || parts[0] === '2') {
    if (!parts[1]) return res.send(`CON Votre région ?\n${menuRegions(0)}\n8 Autres régions`);
    const r = lireRegion(parts);
    if (r.ecran) return res.send(r.ecran);
    if (!r.region) return res.send('END Choix invalide. Recomposez le code.');
    const liste = await structuresDeRegion(r.region);

    if (parts[0] === '1') {
      const texte = liste.map((s, i) => `${i + 1}. ${s.sigle || s.nom}${s.telephone ? ` ${s.telephone}` : ''}`).join('\n');
      if (tel && env.sms.apiKey) {
        sendSms(tel, `SAMA XHEL - Centres (${r.region}) :\n${texte}\nUrgence : 1515`).catch((e) => console.error('[USSD] SMS :', e.message));
      }
      return res.send(`END ${r.region} :\n${texte}\nListe envoyée par SMS.`.slice(0, 182));
    }

    // 2. Demande de rappel : choisir le centre puis confirmer
    if (!r.suite[0]) {
      return res.send(`CON Quel centre vous rappelle ?\n${liste.map((s, i) => `${i + 1} ${s.sigle || s.nom}`).join('\n')}`.slice(0, 182));
    }
    const choisi = liste[Number(r.suite[0]) - 1];
    if (!choisi || !tel) return res.send('END Choix invalide. Recomposez le code.');
    await withContext(null, async (db) => {
      const idx = indexAveugle(tel);
      // Anti-abus : une demande par numéro et par jour
      const { rowCount } = await db.query(
        "SELECT 1 FROM demandes_rappel WHERE telephone_index = $1 AND created_at > NOW() - INTERVAL '1 day'", [idx]);
      if (rowCount) return;
      await db.query(
        `INSERT INTO demandes_rappel (telephone_chiffre, telephone_index, region, structure_id, canal)
         VALUES ($1, $2, $3, $4, 'USSD')`, [chiffrer(tel), idx, r.region, choisi.id]);
      await notifierStructure(db, choisi.id, ['SECRETAIRE', 'ADMIN_STRUCTURE'], {
        type: 'DEMANDE_RAPPEL', titre: 'Un parent demande à être rappelé',
        corps: `Demande reçue par USSD (${r.region}). Rappelez-le depuis l’onglet Agenda.`, data: {},
      });
    });
    return res.send(`END Merci. ${choisi.sigle || choisi.nom} va vous rappeler.\nDinañu la woo.`);
  }
  return res.send('END Choix invalide. Recomposez le code.');
}

// ── GET /api/rappels — la secrétaire voit les parents à rappeler (numéro déchiffré) ──
async function rappelsAFaire(req, res) {
  const { dechiffrer } = require('../utils/crypto'); // eslint-disable-line global-require
  const data = await withContext(req.user, async (db) => {
    const { rows } = await db.query(
      `SELECT id, telephone_chiffre, region, statut, canal, created_at FROM demandes_rappel
       ORDER BY (statut = 'A_RAPPELER') DESC, created_at DESC LIMIT 100`);
    return rows.map((x) => ({ id: x.id, telephone: dechiffrer(x.telephone_chiffre), region: x.region, statut: x.statut, canal: x.canal, created_at: x.created_at }));
  });
  res.json({ rappels: data });
}

// ── PUT /api/rappels/:id  { statut: RAPPELE | INJOIGNABLE } ──────────────
async function traiterRappel(req, res) {
  const data = await withContext(req.user, async (db) => {
    const { rows: [x] } = await db.query(
      'UPDATE demandes_rappel SET statut = $1, traite_par = $2, traite_le = NOW() WHERE id = $3 RETURNING id, statut',
      [req.body.statut, req.user.id, req.params.id]);
    return x;
  });
  if (!data) return res.status(404).json({ error: 'Demande introuvable', code: 'NOT_FOUND' });
  return res.json({ rappel: data });
}

module.exports = { ussd, rappelsAFaire, traiterRappel, REGIONS };
