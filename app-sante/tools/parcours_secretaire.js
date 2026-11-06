module.exports = async ({ p, shot, clicTexte }) => {
  await clicTexte('Dossiers'); await shot('dossiers');
  await clicTexte('Ousmane'); await shot('dossier_sans_medical');
  await p.goto('http://localhost:8080/#/pro/agenda'); await p.waitForTimeout(3000); await shot('agenda');
};
