'use strict';
/**
 * Prépare un parcours de démonstration réaliste via l'API (pour la soutenance et les captures) :
 * test de repérage → demande de prise en charge → acceptation par le médecin → vocal du parent →
 * ordonnance → demande de rappel USSD. Nécessite OTP_CONSOLE=true (codes lus dans le journal).
 * Usage : node scripts/demo-parcours.js [fichier_audio.wav] [journal_backend]
 */
const fs = require('fs');
const API = process.env.API || 'http://localhost:3001/api';
const AUDIO = process.argv[2];
const JOURNAL = process.argv[3] || '/home/claude/backend.log';

async function req(methode, chemin, { jeton, corps, structure, brut, type } = {}) {
  const h = {};
  if (jeton) h.Authorization = `Bearer ${jeton}`;
  if (structure) h['X-Structure-Id'] = structure;
  if (corps) h['Content-Type'] = 'application/json';
  if (brut) h['Content-Type'] = type;
  const r = await fetch(API + chemin, { method: methode, headers: h, body: brut || (corps && JSON.stringify(corps)) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${methode} ${chemin} → ${r.status} ${JSON.stringify(d)}`);
  return d;
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function connexionPro(email) {
  const r = await req('POST', '/auth/login', { corps: { identifier: email, password: 'Demo@2026sx' } });
  await attendre(300);
  const code = [...fs.readFileSync(JOURNAL, 'utf8').matchAll(/\[OTP:mfa\][^\n]*(?:→|->) (\d{6})/g)].pop()[1];
  return req('POST', '/auth/mfa/verify', { corps: { mfa_token: r.mfa_token, code } });
}

(async () => {
  const parent = await req('POST', '/auth/login', { corps: { identifier: 'parent@samaxhel.sn', password: 'Demo@2026sx' } });
  const P = parent.token;
  const { enfants } = await req('GET', '/enfants', { jeton: P });
  const enfant = enfants[0];
  const q = await req('GET', '/questionnaires/TSA');
  const reponses = Object.fromEntries(q.questionnaire.questions.map((x) => [x.id, x.id === 12 ? 1 : 2]));
  const dep = await req('POST', '/depistages', { jeton: P, corps: { questionnaire_code: 'TSA', enfant_id: enfant.id, reponses } });
  const { structures } = await req('GET', '/structures?partenaire=true');
  const kx = structures.find((s) => /Keur Xaleyi/.test(s.nom));
  const suivi = await req('POST', '/suivis', { jeton: P, corps: { enfant_id: enfant.id, structure_id: kx.id, depistage_id: dep.depistage.id, motif: 'Il ne parle pas encore et ne répond pas à son prénom.' } });
  console.log('Dossier', suivi.suivi.numero_dossier, suivi.suivi.priorite);
  const med = await connexionPro('medecin@samaxhel.sn');
  await req('PUT', `/suivis/${suivi.suivi.id}`, { jeton: med.token, structure: kx.id, corps: { statut: 'ACTIF' } });
  if (AUDIO) {
    const v = await req('POST', `/vocaux?langue=wo&enfant_id=${enfant.id}`, { jeton: P, brut: fs.readFileSync(AUDIO), type: 'audio/wav' });
    console.log('Vocal :', v.message.intention, '«', v.message.transcription, '» transmis à', v.transmis_a);
  }
  await req('POST', '/ordonnances', { jeton: med.token, structure: kx.id, corps: { enfant_id: enfant.id, lignes: [
    { dci: 'Rispéridone', forme: 'solution buvable 1 mg/ml', posologie: '0,25 mg le soir', duree: '1 mois' },
  ] } });
  await req('POST', '/rendez-vous', { jeton: P, corps: { enfant_id: enfant.id, structure_id: kx.id, type: 'TELECONSULTATION', motif: 'Suivi après le bilan' } });
  await req('POST', '/communaute', { jeton: P, corps: { texte: 'Bonjour à tous, mon fils a 2 ans et demi. Le test m’a aidée à comprendre qu’il fallait consulter. Courage aux parents !' } });
  const form = (text) => fetch(`${API}/ussd`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ sessionId: 'demo', serviceCode: '*384*7788#', phoneNumber: '+221775550101', text }) }).then((r) => r.text());
  for (const t of ['', '2', '2*1', '2*1*1']) console.log(`USSD « ${t} » →`, (await form(t)).replace(/\n/g, ' | '));
  console.log('Parcours de démonstration prêt.');
})().catch((e) => { console.error(e.message); process.exit(1); });
