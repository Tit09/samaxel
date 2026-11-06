'use strict';
/**
 * Caisse, tickets et file d'attente d'un établissement.
 *
 *  [famille]  GET  /portails/:code/tarifs            → prix publics (ticket, consultation…)
 *  [famille]  POST /moi/tickets                      → payer d'avance (Wave / OM) : ticket « À CONFIRMER »
 *  [famille]  GET  /moi/tickets                      → mes tickets (tous établissements)
 *  [caisse]   GET  /caisse/tickets?jour=             → journal de caisse du jour + totaux
 *  [caisse]   POST /caisse/tickets                   → encaisser à l'entrée → ticket numéroté
 *  [caisse]   PUT  /caisse/tickets/:id               → confirmer un paiement en ligne, annuler, terminer
 *  [soignant] POST /caisse/appeler                   → appeler le numéro suivant dans son bureau
 *  [public]   GET  /portails/:code/file              → écran de la salle d'attente (numéros seulement)
 *  [caisse]   GET  /caisse/registre?q=               → registre (patients sans application)
 *  [admin]    POST /caisse/registre/import           → import du fichier Excel existant
 *  [caisse]   GET  /caisse/export?jour=              → journal de caisse en Excel (.xlsx)
 *  [admin]    GET|POST /etablissement/tarifs         → grille des tarifs
 */
const ExcelJS = require('exceljs');
const { pool, ctx } = require('../config/database');
const { chiffrer, dechiffrer, indexAveugle } = require('../utils/crypto');
const { notifier } = require('../services/notification.service');
const { informer } = require('../services/contact.service');
const tempsReel = require('../services/temps-reel.service');
const { notFound, badRequest, forbidden, conflict } = require('../utils/errors');

const MODES = { ESPECES: 'Espèces', WAVE: 'Wave', ORANGE_MONEY: 'Orange Money', GRATUIT: 'Gratuit' };
/** Index aveugle d'un numéro : « 77 111 22 33 », « +221771112233 » → même valeur */
const indexTel = (t) => indexAveugle(String(t).replace(/\D/g, '').replace(/^221(?=\d{9}$)/, ''));
const jourDakar = () => new Date(Date.now()).toLocaleDateString('en-CA', { timeZone: 'Africa/Dakar' });

async function structureParCode(code) {
  const { rows: [s] } = await pool.query(
    "SELECT id, code, nom, sigle, couleur, logo_url FROM structures WHERE code = $1 AND actif AND statut_adhesion = 'PARTENAIRE'", [code]);
  if (!s) throw notFound('Établissement introuvable', 'PORTAIL_INCONNU');
  return s;
}

/** Ticket tel qu'il est montré (reçu) : jamais de donnée de santé, prénom seulement */
function presenterTicket(t, nomPatient) {
  return {
    id: t.id, numero: t.numero, jour: t.jour, statut: t.statut, montant: t.montant,
    mode_paiement: t.mode_paiement, mode_libelle: MODES[t.mode_paiement], reference: t.reference,
    tarif: t.tarif_libelle, orientation: t.orientation, bureau: t.bureau,
    etablissement: t.structure_nom ? { code: t.structure_code, nom: t.structure_nom, couleur: t.structure_couleur, logo_url: t.structure_logo } : undefined,
    patient: nomPatient || undefined,
    encaisse_le: t.encaisse_le, appele_le: t.appele_le, created_at: t.created_at,
    // Contenu du QR code du reçu : vérifiable à l'entrée sans exposer de nom
    qr: `SAMAXHEL|${t.structure_code || ''}|${t.jour instanceof Date ? t.jour.toISOString().slice(0, 10) : t.jour}|${t.numero}|${t.id.slice(0, 8)}`,
  };
}

const SELECT_TICKET = `
  SELECT t.*, ta.libelle AS tarif_libelle, s.code AS structure_code, COALESCE(s.sigle, s.nom) AS structure_nom,
         s.couleur AS structure_couleur, s.logo_url AS structure_logo,
         e.prenom_chiffre, r.prenom_chiffre AS reg_prenom, r.nom_chiffre AS reg_nom, r.numero AS reg_numero
    FROM tickets t
    JOIN tarifs ta ON ta.id = t.tarif_id
    JOIN structures s ON s.id = t.structure_id
    LEFT JOIN enfants e ON e.id = t.personne_id
    LEFT JOIN patients_registre r ON r.id = t.registre_id`;

function nomDe(t, complet = false) {
  if (t.prenom_chiffre) return dechiffrer(t.prenom_chiffre);
  if (t.reg_prenom) return complet ? `${dechiffrer(t.reg_prenom)} ${dechiffrer(t.reg_nom)} (${t.reg_numero})` : dechiffrer(t.reg_prenom);
  return null;
}

async function nouveauTicket(db, { structureId, tarif, statut, parentId, personneId, registreId, rdvId, mode, reference, encaissePar }) {
  const { rows: [{ rang }] } = await db.query('SELECT ticket_prochain_rang($1, $2) AS rang', [structureId, tarif.prefixe]);
  const numero = `${tarif.prefixe}-${String(rang).padStart(3, '0')}`;
  const { rows: [t] } = await db.query(
    `INSERT INTO tickets (structure_id, tarif_id, service_id, rang, numero, montant, parent_id, personne_id, registre_id,
                          rdv_id, mode_paiement, reference, statut, orientation, encaisse_par, encaisse_le)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, CASE WHEN $13 = 'PAYE' THEN NOW() END)
     RETURNING id`,
    [structureId, tarif.id, tarif.service_id, rang, numero, tarif.montant, parentId || null, personneId || null,
      registreId || null, rdvId || null, mode, reference || null, statut, tarif.orientation, encaissePar || null]);
  return (await db.query(`${SELECT_TICKET} WHERE t.id = $1`, [t.id])).rows[0];
}

// ── Tarifs ─────────────────────────────────────────────────────────────────
async function tarifsPublics(req, res) {
  const s = await structureParCode(req.params.code);
  const { rows } = await pool.query(
    `SELECT t.id, t.code, t.libelle, t.montant, t.orientation, t.en_ligne, sv.nom AS service
       FROM tarifs t LEFT JOIN services sv ON sv.id = t.service_id
      WHERE t.structure_id = $1 AND t.actif ORDER BY t.montant`, [s.id]);
  res.json({ etablissement: { code: s.code, nom: s.sigle || s.nom }, tarifs: rows });
}

async function listerTarifs(req, res) {
  const rows = await ctx(req, async (db) => (await db.query(
    'SELECT * FROM tarifs WHERE structure_id = $1 ORDER BY actif DESC, montant', [req.user.structure_id])).rows);
  res.json({ tarifs: rows });
}

async function enregistrerTarif(req, res) {
  const b = req.body;
  const t = await ctx(req, async (db) => (await db.query(
    `INSERT INTO tarifs (structure_id, code, libelle, montant, orientation, prefixe, en_ligne, actif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (structure_id, code) DO UPDATE SET libelle = EXCLUDED.libelle, montant = EXCLUDED.montant,
       orientation = EXCLUDED.orientation, prefixe = EXCLUDED.prefixe, en_ligne = EXCLUDED.en_ligne, actif = EXCLUDED.actif
     RETURNING *`,
    [req.user.structure_id, b.code, b.libelle, b.montant, b.orientation || null, b.prefixe || 'A', b.en_ligne !== false, b.actif !== false])).rows[0]);
  res.status(201).json({ tarif: t });
}

// ── Famille : payer d'avance ───────────────────────────────────────────────
async function acheterEnLigne(req, res) {
  const b = req.body;
  const s = await structureParCode(b.etablissement);
  const ticket = await ctx(req, async (db) => {
    const { rows: [tarif] } = await db.query('SELECT * FROM tarifs WHERE id = $1 AND structure_id = $2 AND actif AND en_ligne', [b.tarif_id, s.id]);
    if (!tarif) throw badRequest('Ce tarif ne se paie pas en ligne', 'TARIF_INVALIDE');
    const { rowCount } = await db.query('SELECT 1 FROM enfants WHERE id = $1 AND parent_id = $2', [b.personne_id, req.user.id]);
    if (!rowCount) throw forbidden('Personne inconnue', 'NOT_ALLOWED');
    return nouveauTicket(db, {
      structureId: s.id, tarif, statut: 'A_CONFIRMER', parentId: req.user.id, personneId: b.personne_id,
      rdvId: b.rdv_id, mode: b.mode_paiement, reference: b.reference,
    });
  });
  // La caisse est prévenue : elle vérifie la transaction sur son téléphone Wave / OM puis confirme
  await ctx(req, async (db) => {
    const { rows } = await db.query(
      "SELECT user_id FROM membres_structure WHERE structure_id = $1 AND statut = 'ACTIF' AND role IN ('SECRETAIRE','ADMIN_STRUCTURE')", [s.id]);
    for (const m of rows) {
      await notifier(db, m.user_id, { type: 'TICKET_EN_LIGNE', titre: `Paiement à vérifier : ticket ${ticket.numero}`,
        corps: `${MODES[ticket.mode_paiement]} · ${ticket.montant} F · réf. ${ticket.reference || '—'}`, data: { ticket_id: ticket.id } });
      tempsReel.emettre(m.user_id, 'caisse:maj', { ticket_id: ticket.id });
    }
  }).catch(() => {});
  res.status(201).json({
    ticket: presenterTicket(ticket, nomDe(ticket)),
    message: `Ticket ${ticket.numero} réservé. Présentez-le à la caisse : elle confirme votre paiement ${MODES[ticket.mode_paiement]}.`,
  });
}

async function mesTickets(req, res) {
  const rows = await ctx(req, async (db) => (await db.query(
    `${SELECT_TICKET} WHERE t.parent_id = $1 ${req.query.etablissement ? 'AND s.code = $2' : ''}
      ORDER BY t.created_at DESC LIMIT 50`,
    req.query.etablissement ? [req.user.id, req.query.etablissement] : [req.user.id])).rows);
  res.json({ tickets: rows.map((t) => presenterTicket(t, nomDe(t))) });
}

// ── Caisse de l'entrée ─────────────────────────────────────────────────────
async function journal(req, res) {
  const jour = req.query.jour || jourDakar();
  const rows = await ctx(req, async (db) => (await db.query(
    `${SELECT_TICKET} WHERE t.structure_id = $1 AND t.jour = $2 ORDER BY t.rang DESC, t.created_at DESC`,
    [req.user.structure_id, jour])).rows);
  const totaux = { ESPECES: 0, WAVE: 0, ORANGE_MONEY: 0, GRATUIT: 0 };
  let total = 0;
  for (const t of rows) {
    if (['PAYE', 'APPELE', 'EN_CONSULTATION', 'TERMINE'].includes(t.statut)) { totaux[t.mode_paiement] += t.montant; total += t.montant; }
  }
  res.json({
    jour, total, totaux,
    tickets: rows.map((t) => presenterTicket(t, nomDe(t, true))),
    a_confirmer: rows.filter((t) => t.statut === 'A_CONFIRMER').length,
    en_attente: rows.filter((t) => t.statut === 'PAYE').length,
  });
}

async function encaisser(req, res) {
  const b = req.body;
  const ticket = await ctx(req, async (db) => {
    const { rows: [tarif] } = await db.query('SELECT * FROM tarifs WHERE id = $1 AND structure_id = $2 AND actif', [b.tarif_id, req.user.structure_id]);
    if (!tarif) throw badRequest('Tarif inconnu', 'TARIF_INVALIDE');
    let registreId = b.registre_id;
    if (!registreId && !b.personne_id) {
      if (!b.patient?.prenom || !b.patient?.nom) throw badRequest('Indiquez le prénom et le nom du patient', 'PATIENT_MANQUANT');
      registreId = (await db.query(
        `INSERT INTO patients_registre (structure_id, prenom_chiffre, nom_chiffre, telephone_chiffre, telephone_index,
                                        date_naissance, sexe, cree_par)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [req.user.structure_id, chiffrer(b.patient.prenom), chiffrer(b.patient.nom),
          b.patient.telephone ? chiffrer(b.patient.telephone) : null, b.patient.telephone ? indexTel(b.patient.telephone) : null,
          b.patient.date_naissance || null, b.patient.sexe || null, req.user.id])).rows[0].id;
    }
    let parentId = null;
    if (b.personne_id) {
      // Personne déjà suivie ici avec l'application (dossier dans CET établissement)
      const { rows: [sv] } = await db.query(
        "SELECT parent_id FROM suivis WHERE enfant_id = $1 AND structure_id = $2 AND statut IN ('DEMANDE','ACTIF')",
        [b.personne_id, req.user.structure_id]);
      if (!sv) throw badRequest('Cette personne n’a pas de dossier ici', 'NO_SUIVI');
      parentId = sv.parent_id;
    }
    return nouveauTicket(db, {
      structureId: req.user.structure_id, tarif, statut: 'PAYE', parentId, personneId: b.personne_id,
      registreId, mode: b.mode_paiement, reference: b.reference, encaissePar: req.user.id,
    });
  });
  res.status(201).json({ ticket: presenterTicket(ticket, nomDe(ticket, true)) });
}

async function modifierTicket(req, res) {
  const { action, bureau } = req.body;
  const SUIVANT = {
    CONFIRMER: { de: ['A_CONFIRMER'], vers: 'PAYE' },
    REFUSER: { de: ['A_CONFIRMER'], vers: 'REFUSE' },
    ANNULER: { de: ['A_CONFIRMER', 'PAYE'], vers: 'ANNULE' },
    APPELER: { de: ['PAYE', 'APPELE'], vers: 'APPELE' },
    RECEVOIR: { de: ['APPELE', 'PAYE'], vers: 'EN_CONSULTATION' },
    TERMINER: { de: ['APPELE', 'EN_CONSULTATION', 'PAYE'], vers: 'TERMINE' },
  }[action];
  if (['CONFIRMER', 'REFUSER', 'ANNULER'].includes(action) && !['SECRETAIRE', 'ADMIN_STRUCTURE'].includes(req.user.role)) {
    throw forbidden('Seule la caisse peut faire cette opération', 'NOT_ALLOWED');
  }
  const t = await ctx(req, async (db) => {
    const { rows: [avant] } = await db.query('SELECT * FROM tickets WHERE id = $1 AND structure_id = $2 FOR UPDATE', [req.params.id, req.user.structure_id]);
    if (!avant) throw notFound('Ticket introuvable');
    if (!SUIVANT.de.includes(avant.statut)) throw conflict(`Ticket ${avant.numero} : opération impossible (${avant.statut})`, 'STATUT_INVALIDE');
    await db.query(
      `UPDATE tickets SET statut = $2,
         encaisse_par = CASE WHEN $3 = 'CONFIRMER' THEN $4 ELSE encaisse_par END,
         encaisse_le  = CASE WHEN $3 = 'CONFIRMER' THEN NOW() ELSE encaisse_le END,
         appele_par   = CASE WHEN $3 = 'APPELER' THEN $4 ELSE appele_par END,
         appele_le    = CASE WHEN $3 = 'APPELER' THEN NOW() ELSE appele_le END,
         bureau       = COALESCE($5, bureau)
       WHERE id = $1`, [avant.id, SUIVANT.vers, action, req.user.id, bureau || null]);
    return (await db.query(`${SELECT_TICKET} WHERE t.id = $1`, [avant.id])).rows[0];
  });
  await prevenir(req, t, action);
  res.json({ ticket: presenterTicket(t, nomDe(t, true)) });
}

/** Le patient qui a l'application est prévenu (notification + Telegram/SMS) */
async function prevenir(req, t, action) {
  if (!t.parent_id) return;
  const messages = {
    CONFIRMER: [`Ticket ${t.numero} payé`, `Votre paiement est confirmé. ${t.orientation ? `Allez : ${t.orientation}.` : ''} Attendez l’appel de votre numéro.`],
    REFUSER: [`Ticket ${t.numero} non confirmé`, 'La caisse n’a pas trouvé votre paiement. Passez à la caisse de l’entrée.'],
    APPELER: [`C’est votre tour : ${t.numero}`, `Présentez-vous ${t.bureau ? `au ${t.bureau}` : 'au bureau indiqué'}.`],
  }[action];
  if (!messages) return;
  tempsReel.emettre(t.parent_id, 'ticket:maj', { id: t.id, numero: t.numero, statut: t.statut, bureau: t.bureau });
  await ctx(req, (db) => notifier(db, t.parent_id, {
    type: 'TICKET', titre: messages[0], corps: messages[1], data: { ticket_id: t.id },
  })).catch(() => {});
  if (action === 'APPELER') informer(t.parent_id, messages[0], messages[1], { type: 'TICKET' }).catch(() => {});
}

/** Le soignant appelle le prochain numéro payé (le plus ancien) dans son bureau */
async function appelerSuivant(req, res) {
  const t = await ctx(req, async (db) => {
    const { rows: [suivant] } = await db.query(
      `SELECT id FROM tickets WHERE structure_id = $1 AND jour = $2 AND statut = 'PAYE'
        ${req.body.prefixe ? "AND numero LIKE $3 || '-%'" : ''}
        ORDER BY rang LIMIT 1 FOR UPDATE SKIP LOCKED`,
      req.body.prefixe ? [req.user.structure_id, jourDakar(), req.body.prefixe] : [req.user.structure_id, jourDakar()]);
    if (!suivant) return null;
    await db.query("UPDATE tickets SET statut = 'APPELE', appele_par = $2, appele_le = NOW(), bureau = $3 WHERE id = $1",
      [suivant.id, req.user.id, req.body.bureau]);
    return (await db.query(`${SELECT_TICKET} WHERE t.id = $1`, [suivant.id])).rows[0];
  });
  if (!t) return res.json({ ticket: null, message: 'Personne en attente.' });
  await prevenir(req, t, 'APPELER');
  res.json({ ticket: presenterTicket(t, nomDe(t, true)) });
}

async function filePublique(req, res) {
  await structureParCode(req.params.code);
  const { rows } = await pool.query('SELECT * FROM file_publique($1)', [req.params.code]);
  res.set('Cache-Control', 'no-store');
  res.json({
    appeles: rows.filter((r) => r.statut !== 'PAYE').slice(0, 6),
    en_attente: rows.filter((r) => r.statut === 'PAYE').map((r) => r.numero),
  });
}

// ── Registre (remplace le fichier Excel) ───────────────────────────────────
async function registre(req, res) {
  const q = (req.query.q || '').trim();
  const rows = await ctx(req, async (db) => {
    if (/^\+?\d[\d\s]{6,}$/.test(q)) {
      return (await db.query('SELECT * FROM patients_registre WHERE structure_id = $1 AND telephone_index = $2 LIMIT 20',
        [req.user.structure_id, indexTel(q)])).rows;
    }
    if (/^R-\d+$/i.test(q)) {
      return (await db.query('SELECT * FROM patients_registre WHERE structure_id = $1 AND numero = $2', [req.user.structure_id, q.toUpperCase()])).rows;
    }
    return (await db.query('SELECT * FROM patients_registre WHERE structure_id = $1 ORDER BY created_at DESC LIMIT 200', [req.user.structure_id])).rows;
  });
  let patients = rows.map((r) => ({
    id: r.id, numero: r.numero, prenom: dechiffrer(r.prenom_chiffre), nom: dechiffrer(r.nom_chiffre),
    telephone: r.telephone_chiffre ? dechiffrer(r.telephone_chiffre) : null, date_naissance: r.date_naissance, sexe: r.sexe, origine: r.origine,
  }));
  // Recherche par nom : faite APRÈS déchiffrement, en mémoire (les noms ne sont jamais en clair en base)
  if (q && !/^\+?\d/.test(q) && !/^R-\d+$/i.test(q)) {
    const n = q.toLowerCase();
    patients = patients.filter((p) => `${p.prenom} ${p.nom}`.toLowerCase().includes(n));
  }
  res.json({ patients });
}

const COLONNES = {
  prenom: ['prenom', 'prénom', 'first name'], nom: ['nom', 'name', 'last name', 'nom de famille'],
  telephone: ['telephone', 'téléphone', 'tel', 'tél', 'contact', 'numero', 'numéro'],
  date_naissance: ['date de naissance', 'date naissance', 'naissance', 'ddn', 'né le', 'ne le'],
  sexe: ['sexe', 'genre'], notes: ['observation', 'observations', 'notes', 'motif', 'remarque'],
};
const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Import du fichier Excel (ou CSV) que l'établissement tenait jusqu'ici */
async function importer(req, res) {
  if (!req.body?.length) throw badRequest('Fichier vide', 'FICHIER_VIDE');
  const wb = new ExcelJS.Workbook();
  try {
    if ((req.headers['content-type'] || '').includes('csv')) {
      const { Readable } = require('stream');
      await wb.csv.read(Readable.from(req.body.toString('utf8')));
    } else {
      await wb.xlsx.load(req.body);
    }
  } catch {
    throw badRequest('Fichier illisible : envoyez un fichier Excel (.xlsx) ou CSV', 'FICHIER_ILLISIBLE');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest('Feuille vide', 'FICHIER_VIDE');
  // Repérer les colonnes d'après la ligne d'en-tête (noms libres, accents tolérés)
  const entete = {};
  ws.getRow(1).eachCell((c, i) => {
    const v = norm(c.text);
    for (const [cle, noms] of Object.entries(COLONNES)) if (noms.includes(v)) entete[cle] = i;
  });
  if (!entete.prenom || !entete.nom) {
    throw badRequest('Il faut au moins les colonnes « Prénom » et « Nom » sur la première ligne', 'COLONNES_MANQUANTES');
  }
  const lignes = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const val = (k) => (entete[k] ? row.getCell(entete[k]) : null);
    const prenom = val('prenom')?.text?.trim();
    const nom = val('nom')?.text?.trim();
    if (!prenom || !nom) return;
    let ddn = val('date_naissance')?.value;
    if (ddn instanceof Date) ddn = ddn.toISOString().slice(0, 10);
    else if (typeof ddn === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(ddn.trim())) {
      const [j, m, a] = ddn.trim().split('/'); ddn = `${a}-${m}-${j}`;
    } else ddn = null;
    const sexe = norm(val('sexe')?.text)[0];
    lignes.push({ prenom, nom, telephone: val('telephone')?.text?.replace(/\s/g, '') || null, ddn,
      sexe: sexe === 'm' || sexe === 'h' ? 'M' : sexe === 'f' ? 'F' : null, notes: val('notes')?.text || null });
  });
  if (lignes.length > 5000) throw badRequest('5 000 lignes au maximum par import', 'TROP_DE_LIGNES');
  const n = await ctx(req, async (db) => {
    for (const l of lignes) {
      await db.query(
        `INSERT INTO patients_registre (structure_id, prenom_chiffre, nom_chiffre, telephone_chiffre, telephone_index,
                                        date_naissance, sexe, notes_chiffre, origine, cree_par)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IMPORT_EXCEL',$9)`,
        [req.user.structure_id, chiffrer(l.prenom), chiffrer(l.nom), l.telephone ? chiffrer(l.telephone) : null,
          l.telephone ? indexTel(l.telephone) : null, l.ddn, l.sexe, l.notes ? chiffrer(l.notes) : null, req.user.id]);
    }
    return lignes.length;
  });
  res.status(201).json({ importes: n, message: `${n} patient(s) ajouté(s) au registre, noms et téléphones chiffrés.` });
}

/** Journal de caisse du jour en Excel (pour la comptabilité de l'hôpital) */
async function exporter(req, res) {
  const jour = req.query.jour || jourDakar();
  const rows = await ctx(req, async (db) => (await db.query(
    `${SELECT_TICKET} WHERE t.structure_id = $1 AND t.jour = $2 ORDER BY t.rang`, [req.user.structure_id, jour])).rows);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAMA XHEL';
  const ws = wb.addWorksheet(`Caisse ${jour}`);
  ws.columns = [
    { header: 'N° ticket', key: 'numero', width: 11 }, { header: 'Heure', key: 'heure', width: 8 },
    { header: 'Patient', key: 'patient', width: 30 }, { header: 'Prestation', key: 'tarif', width: 28 },
    { header: 'Montant (F CFA)', key: 'montant', width: 15 }, { header: 'Paiement', key: 'mode', width: 14 },
    { header: 'Référence', key: 'reference', width: 18 }, { header: 'Statut', key: 'statut', width: 16 },
    { header: 'Bureau', key: 'bureau', width: 14 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF187A3B' } };
  for (const t of rows) {
    ws.addRow({
      numero: t.numero, heure: new Date(t.created_at).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Dakar', hour: '2-digit', minute: '2-digit' }),
      patient: nomDe(t, true), tarif: t.tarif_libelle, montant: t.montant, mode: MODES[t.mode_paiement],
      reference: t.reference, statut: t.statut, bureau: t.bureau,
    });
  }
  const valides = rows.filter((t) => !['ANNULE', 'REFUSE', 'A_CONFIRMER'].includes(t.statut));
  ws.addRow({});
  const total = ws.addRow({ tarif: 'TOTAL ENCAISSÉ', montant: valides.reduce((a, t) => a + t.montant, 0) });
  total.font = { bold: true };
  ws.getColumn('montant').numFmt = '#,##0';
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="caisse-${jour}.xlsx"`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
}

module.exports = {
  tarifsPublics, listerTarifs, enregistrerTarif, acheterEnLigne, mesTickets, journal, encaisser,
  modifierTicket, appelerSuivant, filePublique, registre, importer, exporter,
};
