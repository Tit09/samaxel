'use strict';
/**
 * WhatsApp Business — API Cloud de Meta (graph.facebook.com).
 *
 * Règles de WhatsApp :
 *  • Premier message de l'établissement (rappel, convocation) = MODÈLE approuvé par Meta.
 *    En phase de test : modèle « hello_world » fourni par Meta, gratuit, vers 5 numéros vérifiés.
 *  • Texte libre ou audio : seulement dans les 24 h qui suivent un message du parent.
 * Le parent doit avoir accepté WhatsApp dans son profil (users.whatsapp_accepte).
 */
const env = require('../../config/env');

const configure = () => Boolean(env.whatsapp.token && env.whatsapp.numeroId);
const numero = (tel) => tel.replace(/^\+/, '');

async function poster(corps) {
  if (!configure()) throw new Error('WhatsApp non configuré (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)');
  const r = await fetch(`https://graph.facebook.com/${env.whatsapp.version}/${env.whatsapp.numeroId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...corps }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp : ${data?.error?.message || r.status}`);
  return { id: data?.messages?.[0]?.id || null };
}

/** Rappel / convocation hors fenêtre de 24 h : modèle approuvé */
function envoyerModele(telephone, texte) {
  const { modele, langueModele, modeleAvecTexte } = env.whatsapp;
  return poster({
    to: numero(telephone),
    type: 'template',
    template: {
      name: modele,
      language: { code: langueModele },
      ...(modeleAvecTexte ? { components: [{ type: 'body', parameters: [{ type: 'text', text: texte.slice(0, 1000) }] }] } : {}),
    },
  });
}

/** Réponse dans la fenêtre de 24 h (texte libre) */
const envoyerTexte = (telephone, texte) =>
  poster({ to: numero(telephone), type: 'text', text: { body: texte.slice(0, 4000), preview_url: false } });

module.exports = { envoyerModele, envoyerTexte, configure };
