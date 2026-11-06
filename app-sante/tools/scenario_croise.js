// Scénario croisé parent ↔ médecin : rendez-vous vidéo + messagerie chiffrée de bout en bout.
const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch();
  const med = await session(b, 'medecin', 412, 'x_medecin');
  const par = await session(b, 'parent', 412, 'x_parent');
  const etape = async (nom, f) => { try { await f(); console.log('✔', nom); } catch (e) { console.log('✘', nom, '—', e.message.split('\n')[0]); } };

  const SAUTER_RDV = false;
  if (!SAUTER_RDV) await etape('parent demande un RDV vidéo', async () => {
    await par.aller('/rendez-vous');
    await par.clicTexte('Demander un rendez-vous');
    await par.clicTexte('Enfant et structure');
    await par.clicTexte('Ousmane —');
    await par.clicTexte('Vidéo');
    await par.saisir('Motif (facultatif)', 'Suivi après le bilan, mon mari travaille à Touba');
    await par.shot('demande_rdv');
    await par.clicTexte('Envoyer la demande', 2500);
    await par.shot('rdv_envoye');
  });
  await etape('parent écrit au médecin (chiffré)', async () => {
    await par.aller('/messages');
    await par.clicTexte('Écrire à un soignant');
    await par.clicTexte('Structure');
    await par.clicTexte('Keur Xaleyi (Ousmane)');
    await par.shot('choix_soignant');
    await par.clicTexte('Moussa', 3500);
    await par.saisir('Votre message…', 'Bonjour docteur, Ousmane a perdu encore un mot cette semaine. Est-ce normal ?');
    await par.clic('Envoyer', { attente: 2500 });
    await par.shot('message_envoye');
  });
  if (!SAUTER_RDV) await etape('médecin confirme le RDV', async () => {
    await med.aller('/pro/agenda');
    await med.shot('agenda_demande');
    await med.clicTexte('Confirmer');
    await med.clicTexte('OK'); await med.clicTexte('OK');
    await med.shot('choix_soignant');
    await med.clicTexte('Confirmer', 2500);
    await med.clicTexte('À venir');
    await med.shot('rdv_confirme');
  });
  await etape('médecin lit et répond', async () => {
    await med.aller('/pro/messages');
    await med.shot('conversations');
    await med.clicTexte('Aminata', 4000);
    await med.shot('message_dechiffre');
    await med.saisir('Votre message…', 'Bonjour Madame Diallo. Notez ce que vous observez ; nous en parlerons à la vidéo. Ce n’est pas une urgence vitale.');
    await med.clic('Envoyer', { attente: 2500 });
    await med.shot('reponse');
  });
  await etape('parent voit la réponse et le bouton Rejoindre', async () => {
    await par.aller('/messages', 3000);
    await par.clicTexte('Moussa', 4000);
    await par.shot('reponse_recue');
    await par.aller('/rendez-vous');
    await par.shot('rdv_rejoindre');
  });
  console.log('Erreurs console médecin :', med.erreurs.slice(0, 5), ' parent :', par.erreurs.slice(0, 5));
  await b.close();
})();
