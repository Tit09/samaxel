// Parent qui ne lit pas : il parle en wolof (micro simulé avec un vrai enregistrement wolof),
// l'IA vocale transcrit, l'assistant répond et propose d'ouvrir la carte des centres.
const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${process.argv[2]}`] });
  const par = await session(b, 'parent', 412, 'assistant');
  await par.clicTexte('Wolof').catch(() => {});
  await par.clicTexte('Parler à SAMA XHEL', 2500);
  await par.shot('vide');
  await par.clic('Appuyez et parlez', { attente: 7500 });
  await par.shot('enregistrement');
  await par.clic('Envoyer le message vocal', { attente: 9000 });
  await par.shot('reponse');
  await par.clicTexte('Voir les centres', 3000);
  await par.shot('carte_ouverte');
  console.log('erreurs', par.erreurs.slice(0, 6));
  await b.close();
})();
