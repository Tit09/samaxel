'use strict';
/**
 * Dons (site vitrine) — paiement Wave / Orange Money / carte.
 *  • Avec un compte marchand Wave (WAVE_API_KEY) : création d'une session Wave Checkout,
 *    confirmation par webhook signé.
 *  • Sans compte marchand : redirection vers le lien de paiement Wave configuré,
 *    le don reste « INITIE » jusqu'à confirmation manuelle par le super-administrateur.
 * Transparence : seuls les montants agrégés sont publics, jamais l'identité des donateurs.
 */
const crypto = require('crypto');
const { pool } = require('../config/database');
const env = require('../config/env');
const { badRequest, HttpError, unauthorized } = require('../utils/errors');

const REPARTITION = [
  { poste: 'Prise en charge des familles vulnérables (séances, bilans)', pourcentage: 70 },
  { poste: 'Infrastructure et hébergement de la plateforme', pourcentage: 20 },
  { poste: 'Formation des parents et des professionnels', pourcentage: 10 },
];
const OBJECTIF_ANNUEL = 50_000_000;

// ── POST /api/dons ─────────────────────────────────────────────────────────
async function initier(req, res) {
  const b = req.body;
  const { rows: [don] } = await pool.query(
    `INSERT INTO dons (montant, moyen, donateur_nom, donateur_email, anonyme)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, montant, moyen, statut, created_at`,
    [b.montant, b.moyen, b.anonyme ? null : b.nom || null, b.email || null, b.anonyme !== false]);

  if (b.moyen === 'WAVE' && env.wave.apiKey) {
    const r = await fetch('https://api.wave.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.wave.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: String(b.montant), currency: 'XOF', client_reference: don.id,
        success_url: env.wave.successUrl, error_url: env.wave.errorUrl,
      }),
    });
    if (!r.ok) throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'Le service de paiement est indisponible, réessayez plus tard');
    const session = await r.json();
    await pool.query('UPDATE dons SET reference_externe = $1 WHERE id = $2', [session.id, don.id]);
    return res.status(201).json({ don, paiement: { url: session.wave_launch_url, fournisseur: 'WAVE' } });
  }
  if (b.moyen === 'WAVE' && env.wave.lienPaiement) {
    return res.status(201).json({
      don, paiement: { url: env.wave.lienPaiement, fournisseur: 'WAVE', montant_a_saisir: b.montant, reference: don.id.slice(0, 8) },
    });
  }
  // Orange Money : lien de paiement marchand (ORANGE_MONEY_LIEN_PAIEMENT), même principe que le lien Wave
  if (b.moyen === 'ORANGE_MONEY' && process.env.ORANGE_MONEY_LIEN_PAIEMENT) {
    return res.status(201).json({
      don, paiement: { url: process.env.ORANGE_MONEY_LIEN_PAIEMENT, fournisseur: 'ORANGE_MONEY', montant_a_saisir: b.montant, reference: don.id.slice(0, 8) },
    });
  }
  throw badRequest('Ce moyen de paiement n’est pas encore ouvert. Réessayez bientôt.', 'PAYMENT_METHOD_UNAVAILABLE');
}

// ── POST /api/dons/webhook/wave  (appelé par Wave) ─────────────────────────
async function webhookWave(req, res) {
  const signature = req.headers['wave-signature'] || '';
  if (!env.wave.webhookSecret) throw unauthorized('Webhook non configuré');
  // Format Wave : t=<timestamp>,v1=<HMAC-SHA256 de « timestamp + corps brut »> — à vérifier
  // dans la documentation Wave Business lors de l'ouverture du compte marchand.
  const parts = Object.fromEntries(signature.split(',').map((x) => x.split('=')));
  const attendu = crypto.createHmac('sha256', env.wave.webhookSecret)
    .update(`${parts.t}${req.rawBody || ''}`).digest('hex');
  const recu = Buffer.from(parts.v1 || '');
  if (recu.length !== attendu.length || !crypto.timingSafeEqual(Buffer.from(attendu), recu)) {
    throw unauthorized('Signature invalide', 'INVALID_SIGNATURE');
  }
  const evt = req.body;
  if (evt.type === 'checkout.session.completed') {
    await pool.query(
      "UPDATE dons SET statut = 'PAYE', paye_at = NOW() WHERE id = $1 AND statut = 'INITIE'",
      [evt.data?.client_reference]);
  }
  res.json({ recu: true });
}

// ── PUT /api/dons/:id/confirmer  (super-admin, paiement par lien simple) ───
async function confirmer(req, res) {
  const { rowCount } = await pool.query(
    "UPDATE dons SET statut = 'PAYE', paye_at = NOW() WHERE id = $1 AND statut = 'INITIE'", [req.params.id]);
  if (!rowCount) throw badRequest('Don introuvable ou déjà confirmé', 'NOT_FOUND');
  res.json({ message: 'Don confirmé' });
}

// ── GET /api/dons/transparence  (public) ───────────────────────────────────
async function transparence(_req, res) {
  const { rows: [t] } = await pool.query(
    `SELECT coalesce(sum(montant), 0)::bigint AS total, count(*)::int AS nombre
     FROM dons WHERE statut = 'PAYE' AND paye_at >= date_trunc('year', NOW())`);
  const total = Number(t.total);
  res.json({
    annee: new Date().getFullYear(),
    objectif: OBJECTIF_ANNUEL,
    collecte: total,
    nombre_dons: t.nombre,
    progression_pct: Math.min(100, Math.round((total / OBJECTIF_ANNUEL) * 100)),
    repartition: REPARTITION.map((r) => ({ ...r, montant: Math.round((total * r.pourcentage) / 100) })),
  });
}

module.exports = { initier, webhookWave, confirmer, transparence };
