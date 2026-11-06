module.exports = async ({ p, shot, clicTexte }) => {
  await p.goto('http://localhost:8080/#/pro/admin'); await p.waitForTimeout(3500); await shot('equipe');
  await clicTexte('Statistiques'); await shot('stats');
  await p.goto('http://localhost:8080/#/pro/profil'); await p.waitForTimeout(3000); await shot('profil');
};
