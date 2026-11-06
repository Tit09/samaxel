'use strict';
/**
 * Studio des voix : de VRAIES voix (locuteurs natifs) pour le guide vocal.
 *
 *   GET    /api/voix/catalogue              (public)       → quelles phrases ont une voix enregistrée, par langue
 *   POST   /api/admin/voix/:langue/:cle     (super-admin)  → enregistre la voix d'une phrase (audio brut)
 *   DELETE /api/admin/voix/:langue/:cle     (super-admin)  → retire une voix
 *   GET    /media-voix/<langue>/<cle>.<ext> (public)       → le fichier audio
 *
 * L'application joue en priorité la voix enregistrée ici, puis la voix de synthèse intégrée,
 * puis, à défaut, lit le texte en français. Le sérère, absent des modèles de synthèse,
 * passe uniquement par ce studio. Fichiers gardés dans le volume de données (/app/donnees/voix).
 */
const fs = require('fs');
const path = require('path');
const { badRequest, notFound } = require('../utils/errors');

const DOSSIER = process.env.VOIX_DIR || path.join(__dirname, '..', '..', 'donnees', 'voix');
const LANGUES = ['wo', 'ff', 'srr', 'dyo', 'mnk', 'bm', 'fr', 'en'];
const TYPES = {
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/m4a': 'm4a',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};
const EXTS = [...new Set(Object.values(TYPES))];
const CLE = /^[a-z0-9_]{2,60}$/;

function verifier(langue, cle) {
  if (!LANGUES.includes(langue)) throw badRequest('Langue inconnue', 'LANGUE_INCONNUE');
  if (!CLE.test(cle)) throw badRequest('Clé de phrase invalide', 'CLE_INVALIDE');
}

/**
 * Chemin d'un fichier de voix, construit UNIQUEMENT à partir d'une langue de la liste fermée
 * et d'une clé [a-z0-9_] (aucun « .. » ni « / » possible), puis contrôlé : le chemin final doit
 * rester dans le dossier des voix (défense en profondeur contre la traversée de répertoires).
 */
function cheminVoix(langue, cle, ext) {
  verifier(langue, cle);
  if (ext !== undefined && !EXTS.includes(ext)) throw badRequest('Format audio non pris en charge', 'FORMAT_AUDIO');
  const base = path.resolve(DOSSIER);
  // nosemgrep: javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal -- entrées validées par liste blanche et contrôle de préfixe ci-dessous
  const cible = path.resolve(base, langue, ext === undefined ? '' : `${cle}.${ext}`);
  if (cible !== base && !cible.startsWith(base + path.sep)) throw badRequest('Chemin refusé', 'CHEMIN_INVALIDE');
  return cible;
}

function catalogue(req, res) {
  const fichiers = {};
  let maj = 0;
  for (const l of LANGUES) {
    const d = path.join(DOSSIER, l);
    if (!fs.existsSync(d)) continue;
    fichiers[l] = {};
    for (const f of fs.readdirSync(d)) {
      const m = /^([a-z0-9_]+)\.([a-z0-9]+)$/.exec(f);
      if (!m || !EXTS.includes(m[2])) continue;
      fichiers[l][m[1]] = `/media-voix/${l}/${f}`;
      maj = Math.max(maj, fs.statSync(path.join(d, f)).mtimeMs);
    }
  }
  res.set('Cache-Control', 'no-cache');
  res.json({ maj: Math.round(maj), fichiers });
}

function enregistrer(req, res) {
  const { langue, cle } = req.params;
  verifier(langue, cle);
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw badRequest('Format audio non pris en charge', 'FORMAT_AUDIO');
  if (!Buffer.isBuffer(req.body) || req.body.length < 1500) throw badRequest('Enregistrement vide ou trop court', 'AUDIO_VIDE');
  fs.mkdirSync(cheminVoix(langue, cle), { recursive: true });
  for (const e of EXTS) fs.rmSync(cheminVoix(langue, cle, e), { force: true });
  fs.writeFileSync(cheminVoix(langue, cle, ext), req.body);
  res.status(201).json({ url: `/media-voix/${langue}/${cle}.${ext}`, octets: req.body.length });
}

function supprimer(req, res) {
  const { langue, cle } = req.params;
  verifier(langue, cle);
  let n = 0;
  for (const e of EXTS) {
    const f = cheminVoix(langue, cle, e);
    if (fs.existsSync(f)) { fs.rmSync(f); n++; }
  }
  if (!n) throw notFound('Aucune voix pour cette phrase');
  res.json({ supprime: true });
}

module.exports = { catalogue, enregistrer, supprimer, DOSSIER };
