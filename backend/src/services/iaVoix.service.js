'use strict';
/**
 * Client du service interne d'IA vocale (../ia-voix, FastAPI + Meta MMS).
 * Le service tourne sur NOTRE serveur : la voix des parents ne part chez aucun fournisseur étranger.
 */
const env = require('../config/env');

const LANGUES_TRANSCRITES = ['wo', 'ff', 'dyo', 'mnk', 'bm', 'fr', 'en']; // le sérère n'a pas encore de modèle

async function transcrire(audio, type, langue) {
  if (!env.iaVoix.url) return { indisponible: 'service d’IA vocale non configuré' };
  if (!LANGUES_TRANSCRITES.includes(langue)) return { indisponible: `pas de modèle de reconnaissance pour « ${langue} »` };
  const form = new FormData();
  form.set('audio', new Blob([audio], { type }), 'vocal');
  form.set('langue', langue);
  try {
    const r = await fetch(`${env.iaVoix.url}/transcrire`, {
      method: 'POST', body: form, headers: { 'X-Cle-Service': env.iaVoix.cle }, signal: AbortSignal.timeout(60000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { indisponible: data.detail || `erreur ${r.status}` };
    return data; // { texte, confiance, duree_s, temps_s, modele }
  } catch (e) {
    return { indisponible: `service injoignable (${e.name})` };
  }
}

module.exports = { transcrire, LANGUES_TRANSCRITES };
