// Captures des nouvelles fonctions : vocaux (parent et médecin), ordonnance et pharmacies, groupe des parents,
// candidatures, rappels USSD, supervision. À lancer après scripts/demo-parcours.js du backend.
const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch();
  const res = [];
  const etape = async (nom, f) => { try { await f(); res.push(`✔ ${nom}`); } catch (e) { res.push(`✘ ${nom} — ${e.message.split('\n')[0]}`); } };
  const par = await session(b, 'parent', 412, 'n_parent');
  await etape('parent : assistant vocal', async () => { await par.aller('/assistant', 4000); await par.shot('assistant'); });
  await etape('parent : ordonnances', async () => { await par.aller('/ordonnances', 3500); await par.shot('ordonnances'); });
  await etape('parent : pharmacies', async () => { await par.clicTexte('Trouver une pharmacie', 12000); await par.shot('pharmacies'); });
  await etape('parent : groupe', async () => { await par.aller('/communaute', 3500); await par.shot('communaute'); });
  await etape('parent : accueil', async () => { await par.aller('/accueil', 3000); await par.shot('accueil'); });
  const med = await session(b, 'medecin', 412, 'n_medecin');
  await etape('médecin : dossier et vocaux', async () => {
    await med.clicTexte('Patients'); await med.clicTexte('Ousmane', 3000);
    await med.p.mouse.wheel(0, 900); await med.shot('dossier_haut');
    await med.p.mouse.wheel(0, 900); await med.shot('vocaux');
  });
  await etape('médecin : formulaire ordonnance', async () => {
    await med.p.mouse.wheel(0, -1800); await med.p.waitForTimeout(500);
    await med.clicTexte('Ordonnance', 1500); await med.shot('ordonnance');
  });
  const sec = await session(b, 'secretaire', 412, 'n_secretaire');
  await etape('secrétaire : rappels USSD', async () => { await sec.aller('/pro/agenda', 2500); await sec.clicTexte('À rappeler', 2500); await sec.shot('rappels'); });
  const adm = await session(b, 'admin', 412, 'n_admin');
  await etape('admin : candidature', async () => {
    await adm.aller('/pro/admin', 3000); await adm.shot('equipe');
    await adm.clicTexte('Examiner la candidature', 3000); await adm.shot('candidature');
  });
  const sup = await session(b, 'super', 1280, 'n_super');
  await etape('super-admin : supervision', async () => { await sup.p.waitForTimeout(3000); await sup.shot('supervision'); await sup.p.mouse.wheel(0, 900); await sup.shot('supervision_bas'); });
  console.log(res.join('\n'));
  await b.close();
})();
