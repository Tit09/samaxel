'use strict';
/**
 * Export HL7 FHIR R4 (interopérabilité hospitalière).
 * GET /api/fhir/Patient/:id/$everything → Bundle (Patient, Observation, Encounter)
 * Réservé aux cliniciens de la structure qui suit l'enfant (RLS).
 */
const { ctx } = require('../config/database');
const { dechiffrer } = require('../utils/crypto');
const { notFound } = require('../utils/errors');

const SYSTEME_DOSSIER = 'https://samaxhel.sn/fhir/numero-dossier';
const LOINC_PHQ9 = '44261-6';

async function everything(req, res) {
  const bundle = await ctx(req, async (db) => {
    const { rows: [e] } = await db.query('SELECT * FROM enfants WHERE id = $1', [req.params.id]);
    if (!e) throw notFound('Patient introuvable');
    const { rows: suivis } = await db.query('SELECT numero_dossier FROM suivis WHERE enfant_id = $1 AND structure_id = $2', [e.id, req.user.structure_id]);
    const { rows: deps } = await db.query('SELECT * FROM depistages WHERE enfant_id = $1 ORDER BY created_at', [e.id]);
    const { rows: cons } = await db.query('SELECT * FROM consultations WHERE enfant_id = $1 ORDER BY date_consultation', [e.id]);

    const patientRef = `Patient/${e.id}`;
    const entries = [{
      resource: {
        resourceType: 'Patient',
        id: e.id,
        identifier: suivis.map((s) => ({ system: SYSTEME_DOSSIER, value: s.numero_dossier })),
        name: [{ family: dechiffrer(e.nom_chiffre), given: [dechiffrer(e.prenom_chiffre)] }],
        gender: e.sexe === 'M' ? 'male' : 'female',
        birthDate: dechiffrer(e.date_naissance_chiffre),
        communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: e.langue_maison }] } }],
      },
    }];
    for (const d of deps) {
      entries.push({
        resource: {
          resourceType: 'Observation',
          id: d.id,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
          code: {
            coding: d.questionnaire_code === 'DEPRESSION'
              ? [{ system: 'http://loinc.org', code: LOINC_PHQ9, display: 'PHQ-9 total score' }]
              : [{ system: 'https://samaxhel.sn/fhir/questionnaire', code: d.questionnaire_code }],
            text: `Repérage ${d.questionnaire_code}`,
          },
          subject: { reference: patientRef },
          effectiveDateTime: d.created_at,
          valueInteger: d.score,
          interpretation: [{ text: d.niveau }],
          note: d.alertes.length ? [{ text: `Signaux d'alerte : ${d.alertes.join(', ')}` }] : undefined,
        },
      });
    }
    for (const c of cons) {
      entries.push({
        resource: {
          resourceType: 'Encounter',
          id: c.id,
          status: { PLANIFIEE: 'planned', EN_COURS: 'in-progress', TERMINEE: 'finished', ANNULEE: 'cancelled' }[c.statut],
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: c.type === 'TELECONSULTATION' ? 'VR' : 'AMB',
          },
          subject: { reference: patientRef },
          period: { start: c.date_consultation },
          reasonCode: c.diagnostic_code ? [{ coding: [{ system: 'http://id.who.int/icd/release/11/mms', code: c.diagnostic_code }] }] : undefined,
        },
      });
    }
    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: entries.map((x) => ({ fullUrl: `urn:uuid:${x.resource.id}`, ...x })),
    };
  });
  res.type('application/fhir+json').send(JSON.stringify(bundle));
}

module.exports = { everything };
