'use strict';
/**
 * ORDONNANCES ET PHARMACIES.
 * Le médecin prescrit (ex. au CEPIAD, un traitement pour apaiser un adulte en crise) ;
 * le parent ou le patient voit alors les pharmacies proches qui ont DÉCLARÉ avoir le médicament.
 *
 * Données réelles uniquement :
 *   - annuaire : 605 pharmacies du Sénégal issues d'OpenStreetMap (licence ODbL, © contributeurs OSM) ;
 *   - disponibilité : seulement celle déclarée par une pharmacie partenaire, avec sa date.
 *     Sans déclaration, on affiche « disponibilité non renseignée — appelez avant de vous déplacer ».
 * Les médicaments réservés à la structure (méthadone, buprénorphine…) ne sont jamais orientés
 * vers une pharmacie de ville : ils sont délivrés par le centre lui-même.
 */
const { pool, ctx } = require('../config/database');
const { chiffrerJson, dechiffrerJson } = require('../utils/crypto');
const { notifier } = require('../services/notification.service');
const { notFound, badRequest } = require('../utils/errors');

// Délivrance réservée au centre de prise en charge (programme national, stupéfiants)
const RESERVES_STRUCTURE = ['methadone', 'méthadone', 'buprenorphine', 'buprénorphine', 'naloxone'];

const normaliserDci = (d) => String(d).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function distanceKm(a, b) {
  const R = 6371; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── POST /api/ordonnances  (médecin) ──────────────────────────────────────
async function prescrire(req, res) {
  const { enfant_id: enfantId, consultation_id: consultationId, lignes } = req.body;
  const data = await ctx(req, async (db) => {
    const { rows: [s] } = await db.query(
      "SELECT parent_id FROM suivis WHERE enfant_id = $1 AND structure_id = $2 AND statut = 'ACTIF'", [enfantId, req.user.structure_id]);
    if (!s) throw notFound('Ce patient n’est pas suivi par votre structure');
    const dci = [...new Set(lignes.map((l) => normaliserDci(l.dci)))];
    const reserve = dci.some((d) => RESERVES_STRUCTURE.map(normaliserDci).includes(d));
    const { rows: [o] } = await db.query(
      `INSERT INTO ordonnances (consultation_id, structure_id, enfant_id, parent_id, prescripteur_id, lignes_chiffrees, dci, delivrance_structure)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, dci, delivrance_structure, created_at`,
      [consultationId || null, req.user.structure_id, enfantId, s.parent_id, req.user.id, chiffrerJson(lignes), dci, reserve]);
    await notifier(db, s.parent_id, {
      type: 'ORDONNANCE', titre: 'Nouvelle ordonnance', corps: 'Le médecin a fait une ordonnance. Ouvrez-la pour trouver une pharmacie.',
      data: { ordonnance_id: o.id },
    });
    return o;
  });
  res.status(201).json({ ordonnance: data });
}

// ── GET /api/ordonnances?enfant_id= ───────────────────────────────────────
async function lister(req, res) {
  const data = await ctx(req, async (db) => {
    const p = []; let w = '';
    if (req.validQuery.enfant_id) { p.push(req.validQuery.enfant_id); w = 'WHERE o.enfant_id = $1'; }
    const { rows } = await db.query(
      `SELECT o.*, u.prenom || ' ' || u.nom AS prescripteur, s.nom AS structure_nom, s.telephone AS structure_telephone
       FROM ordonnances o JOIN users u ON u.id = o.prescripteur_id JOIN structures s ON s.id = o.structure_id
       ${w} ORDER BY o.created_at DESC LIMIT 50`, p);
    return rows.map((o) => ({
      id: o.id, enfant_id: o.enfant_id, prescripteur: o.prescripteur, structure_nom: o.structure_nom,
      structure_telephone: o.structure_telephone, lignes: dechiffrerJson(o.lignes_chiffrees), dci: o.dci,
      delivrance_structure: o.delivrance_structure, created_at: o.created_at,
    }));
  });
  res.json({ ordonnances: data });
}

// ── GET /api/pharmacies?dci=a,b&lat=&lng=&region=&q= ──────────────────────
async function chercher(req, res) {
  const { dci, lat, lng, region, q, limit } = req.validQuery;
  const liste = dci ? [...new Set(dci.split(',').map(normaliserDci).filter(Boolean))] : [];
  if (liste.some((d) => RESERVES_STRUCTURE.map(normaliserDci).includes(d))) {
    return res.json({ pharmacies: [], reserve_structure: true,
      message: 'Ce médicament est délivré uniquement par le centre qui vous suit (programme national). Adressez-vous à lui.' });
  }
  const p = []; const cond = ['p.actif'];
  if (region) { p.push(region); cond.push(`p.region = $${p.length}`); }
  if (q) { p.push(`%${q}%`); cond.push(`(p.nom ILIKE $${p.length} OR p.commune ILIKE $${p.length})`); }
  p.push(liste);
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE(json_agg(json_build_object('dci', s.dci, 'disponible', s.disponible, 'mis_a_jour_le', s.mis_a_jour_le))
              FILTER (WHERE s.dci = ANY($${p.length})), '[]') AS stocks
     FROM pharmacies p LEFT JOIN pharmacie_stocks s ON s.pharmacie_id = p.id
     WHERE ${cond.join(' AND ')} GROUP BY p.id`, p);
  const ici = lat !== undefined && lng !== undefined ? { lat, lng } : null;
  const resultats = rows.map((ph) => {
    const declares = ph.stocks.filter((s) => s.disponible).map((s) => s.dci);
    const km = ici && ph.latitude ? distanceKm(ici, { lat: Number(ph.latitude), lng: Number(ph.longitude) }) : null;
    return {
      id: ph.id, nom: ph.nom, region: ph.region, commune: ph.commune, adresse: ph.adresse, telephone: ph.telephone,
      latitude: ph.latitude && Number(ph.latitude), longitude: ph.longitude && Number(ph.longitude),
      partenaire: ph.partenaire, de_garde: ph.de_garde, distance_km: km === null ? null : Math.round(km * 10) / 10,
      disponibilite: !liste.length ? null
        : (declares.length === liste.length ? 'DECLAREE' : (ph.stocks.length ? 'PARTIELLE' : 'NON_RENSEIGNEE')),
      stocks: ph.stocks, source: ph.source,
    };
  });
  const rang = { DECLAREE: 0, PARTIELLE: 1, NON_RENSEIGNEE: 2, null: 2 };
  resultats.sort((a, b) => rang[a.disponibilite] - rang[b.disponibilite] || (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  return res.json({
    pharmacies: resultats.slice(0, limit), total: resultats.length,
    attribution: 'Annuaire des pharmacies : © contributeurs OpenStreetMap (ODbL). Disponibilités déclarées par les pharmacies partenaires.',
  });
}

// ── PUT /api/pharmacies/:id/stocks  (super-admin, en attendant le portail pharmacien) ──
async function declarerStock(req, res) {
  const { dci, disponible } = req.body;
  const data = await ctx(req, async (db) => {
    const { rowCount } = await db.query('SELECT 1 FROM pharmacies WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Pharmacie introuvable');
    const { rows: [s] } = await db.query(
      `INSERT INTO pharmacie_stocks (pharmacie_id, dci, disponible, declare_par) VALUES ($1, $2, $3, $4)
       ON CONFLICT (pharmacie_id, dci) DO UPDATE SET disponible = EXCLUDED.disponible, mis_a_jour_le = NOW(), declare_par = EXCLUDED.declare_par
       RETURNING *`, [req.params.id, normaliserDci(dci), disponible, req.user.id]);
    await db.query('UPDATE pharmacies SET partenaire = true WHERE id = $1', [req.params.id]);
    return s;
  });
  if (!data) throw badRequest('Déclaration impossible');
  res.json({ stock: data });
}

module.exports = { prescrire, lister, chercher, declarerStock, RESERVES_STRUCTURE };
