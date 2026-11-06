'use strict';
/**
 * ANCRAGE DANS LA BLOCKCHAIN BITCOIN (OpenTimestamps) — mémoire, section 4.3.6.
 *
 * Le journal d'audit est déjà chaîné : chaque maillon contient l'empreinte SHA-256 du précédent.
 * Une fois par jour, l'empreinte du DERNIER maillon est envoyée à des serveurs « calendrier »
 * OpenTimestamps (gratuits, publics). Ils regroupent les empreintes reçues dans un arbre de Merkle
 * et inscrivent sa racine dans une transaction Bitcoin (en quelques heures).
 *
 * Résultat : un fichier de preuve .ots, vérifiable par n'importe qui avec l'outil officiel :
 *     ots upgrade preuve.ots   puis   ots verify preuve.ots
 * Il prouve que l'historique existait tel quel à cette date. Réécrire le journal après coup
 * (même avec un accès administrateur à la base) casserait le lien avec la blockchain.
 * Seuls 32 octets sortent du serveur : aucune donnée personnelle ni médicale.
 */
const { pool } = require('../../config/database');

const CALENDRIERS = (process.env.OTS_CALENDRIERS || 'https://a.pool.opentimestamps.org,https://b.pool.opentimestamps.org')
  .split(',').map((s) => s.trim()).filter(Boolean);

// En-tête officiel d'un fichier .ots (format OpenTimestamps, version 1, hachage SHA-256)
const MAGIC = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');
const VERSION = Buffer.from([0x01]);
const OP_SHA256 = Buffer.from([0x08]);

/** Construit le fichier .ots à partir de la réponse du calendrier (timestamp sérialisé) */
const fichierOts = (empreinte, reponse) => Buffer.concat([MAGIC, VERSION, OP_SHA256, empreinte, reponse]);

async function soumettre(calendrier, empreinte) {
  const r = await fetch(`${calendrier}/digest`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.opentimestamps.v1', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: empreinte,
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`calendrier ${r.status}`);
  const reponse = Buffer.from(await r.arrayBuffer());
  if (!reponse.length || reponse.length > 10_000) throw new Error('réponse du calendrier invalide');
  return reponse;
}

/** Ancre le dernier maillon du journal. Retourne le bilan (un ancrage par calendrier). */
async function ancrer(db = pool) {
  const { rows: [maillon] } = await db.query('SELECT * FROM audit_dernier_maillon()');
  if (!maillon?.hash) return { ancre: false, raison: 'journal vide' };
  const empreinte = Buffer.from(maillon.hash, 'hex');
  const bilan = [];
  for (const cal of CALENDRIERS) {
    try {
      const preuve = fichierOts(empreinte, await soumettre(cal, empreinte));
      await db.query('SELECT ancrage_enregistrer($1, $2, $3, $4, $5, NULL)', [maillon.id, maillon.hash, cal, preuve, 'EN_ATTENTE']);
      bilan.push({ calendrier: cal, statut: 'EN_ATTENTE' });
    } catch (e) {
      await db.query('SELECT ancrage_enregistrer($1, $2, $3, NULL, $4, $5)', [maillon.id, maillon.hash, cal, 'ECHEC', e.message]);
      bilan.push({ calendrier: cal, statut: 'ECHEC', erreur: e.message });
    }
  }
  return { ancre: bilan.some((b) => b.statut === 'EN_ATTENTE'), dernier_audit: Number(maillon.id), empreinte: maillon.hash, bilan };
}

module.exports = { ancrer, fichierOts, MAGIC, CALENDRIERS };
