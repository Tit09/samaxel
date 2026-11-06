module.exports = async ({ p, shot, clic, clicTexte }) => {
  await clic('Profil', { role: 'tab' }).catch(() => clicTexte('Profil'));
  await shot('profil');
  await clic('Accueil', { role: 'tab' }).catch(() => clicTexte('Accueil'));
  // ── Test de repérage autisme pour Ousmane
  await clicTexte('Faire un test');
  await clicTexte('Ousmane (');
  await shot('choix_test');
  await clicTexte('Autisme (Trouble');
  await shot('question1');
  const reponses = ['Rarement', 'Rarement', 'Rarement', 'Rarement', 'Rarement', 'Rarement', 'Parfois', 'Rarement', 'Souvent', 'Souvent', 'Très souvent', 'Oui'];
  for (let i = 0; i < reponses.length; i++) {
    await clic(reponses[i], { exact: true, attente: 900 });
    if (i === 11) await shot('alerte_regression');
  }
  await clic('Voir le résultat', { attente: 4000 });
  await shot('resultat');
  await p.mouse.wheel(0, 700); await shot('resultat_orientation');
  await clic('Demander une prise en charge', { attente: 2500 });
  await shot('demande_envoyee');
  // ── Rendez-vous et humeur
  await p.goto('http://localhost:8080/#/rendez-vous'); await p.waitForTimeout(3000);
  await shot('rendez_vous');
  await p.goto('http://localhost:8080/#/humeur'); await p.waitForTimeout(3000);
  await shot('humeur');
};
