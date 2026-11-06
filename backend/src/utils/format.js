'use strict';
const { dechiffrer, dechiffrerJson } = require('./crypto');

/** Âge en mois à partir du mois de naissance (date du 1er du mois) */
function ageEnMois(moisNaissance, ref = new Date()) {
  if (!moisNaissance) return null;
  const d = new Date(moisNaissance);
  return (ref.getUTCFullYear() - d.getUTCFullYear()) * 12 + (ref.getUTCMonth() - d.getUTCMonth());
}

/** « 3 ans 2 mois » / « 18 mois » */
function ageLisible(mois) {
  if (mois === null || mois === undefined) return null;
  if (mois < 24) return `${mois} mois`;
  const a = Math.floor(mois / 12);
  const m = mois % 12;
  return m ? `${a} ans ${m} mois` : `${a} ans`;
}

function enfantPublic(row) {
  if (!row) return null;
  const age = ageEnMois(row.mois_naissance);
  return {
    id: row.id,
    parent_id: row.parent_id,
    prenom: dechiffrer(row.prenom_chiffre),
    nom: dechiffrer(row.nom_chiffre),
    date_naissance: dechiffrer(row.date_naissance_chiffre),
    age_mois: age,
    age_lisible: ageLisible(age),
    sexe: row.sexe,
    region: row.region,
    langue_maison: row.langue_maison,
    scolarise: row.scolarise,
    lien: row.lien || 'ENFANT',
    archive: row.archive,
    created_at: row.created_at,
  };
}

function userPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    role_global: row.role_global,
    nom: row.nom,
    prenom: row.prenom,
    email: row.email,
    telephone: row.telephone,
    langue: row.langue,
    region: row.region,
    photo_url: row.photo_url,
    verifie: row.verifie,
    mfa_enabled: row.mfa_enabled,
    has_public_key: Boolean(row.public_key),
    created_at: row.created_at,
  };
}

function depistagePublic(row, { avecReponses = false } = {}) {
  return {
    id: row.id,
    enfant_id: row.enfant_id,
    questionnaire_code: row.questionnaire_code,
    questionnaire_version: row.questionnaire_version,
    score: row.score,
    score_max: row.score_max,
    niveau: row.niveau,
    alertes: row.alertes,
    triage: row.triage,
    created_at: row.created_at,
    ...(avecReponses ? { reponses: dechiffrerJson(row.reponses_chiffre) } : {}),
  };
}

function consultationPublic(row, { pourParent = false } = {}) {
  const base = {
    id: row.id,
    structure_id: row.structure_id,
    structure_nom: row.structure_nom,
    rdv_id: row.rdv_id,
    suivi_id: row.suivi_id,
    enfant_id: row.enfant_id,
    professionnel_id: row.professionnel_id,
    professionnel_nom: row.professionnel_nom,
    date_consultation: row.date_consultation,
    type: row.type,
    statut: row.statut,
    motif: dechiffrer(row.motif_chiffre),
    recommandations: dechiffrer(row.recommandations_chiffre),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (pourParent) return base;
  return {
    ...base,
    observations: dechiffrer(row.observations_chiffre),
    diagnostic_code: row.diagnostic_code,
    visible_parent: row.visible_parent,
  };
}

/** Convertit un texte en mois_naissance (1er du mois) — « 2022-05-17 » → « 2022-05-01 » */
function premierDuMois(dateIso) {
  const d = new Date(dateIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

module.exports = {
  ageEnMois, ageLisible, enfantPublic, userPublic, depistagePublic, consultationPublic, premierDuMois,
};
