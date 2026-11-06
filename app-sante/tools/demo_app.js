// Démonstration vidéo de l'application Santé (un clip par rôle). Prérequis : backend, ia-voix, app web sur :8080.
// VIDEO_DIR=/chemin node tools/demo_app.js /chemin/vocal_wolof.wav
const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${process.argv[2]}`] });
  const pause = (p, ms) => p.waitForTimeout(ms);
  const defile = async (p, dy, fois = 1) => { for (let i = 0; i < fois; i++) { await p.mouse.move(206, 430); await p.mouse.wheel(0, dy); await pause(p, 900); } };

  // 1. Parent qui ne lit pas
  const par = await session(b, 'parent', 412, 'demo1_parent');
  await par.clicTexte('Wolof').catch(() => {});   // le parent parle wolof
  await pause(par.p, 1500);
  await par.clicTexte('Parler à SAMA XHEL', 2500);
  await par.clic('Appuyez et parlez', { attente: 7500 });
  await par.clic('Envoyer le message vocal', { attente: 10000 });
  await par.clicTexte('Voir les centres', 4000);
  await defile(par.p, 300, 3);
  await par.aller('/ordonnances', 3500);
  await par.clicTexte('Trouver une pharmacie', 9000);
  await defile(par.p, 350, 3);
  await par.aller('/communaute', 4000);
  await par.p.context().close();

  // 2. Médecin
  const med = await session(b, 'medecin', 412, 'demo2_medecin');
  await med.clicTexte('Patients', 2500);
  await med.clicTexte('Ousmane', 3500);
  await defile(med.p, 300, 6);
  await med.clicTexte('Ordonnance', 3000);
  await med.p.context().close();

  // 3. Secrétaire : rappels USSD
  const sec = await session(b, 'secretaire', 412, 'demo3_secretaire');
  await sec.aller('/pro/agenda', 2500);
  await sec.clicTexte('À rappeler', 4000);
  await sec.p.context().close();

  // 4. Administrateur : candidature
  const adm = await session(b, 'admin', 412, 'demo4_admin');
  await adm.aller('/pro/admin', 3500);
  await adm.clicTexte('Examiner la candidature', 3500);
  await defile(adm.p, 300, 3);
  await adm.p.context().close();

  // 5. Super-administrateur : supervision
  const sup = await session(b, 'super', 1280, 'demo5_super');
  await pause(sup.p, 3000);
  for (let i = 0; i < 4; i++) { await sup.p.mouse.move(640, 450); await sup.p.mouse.wheel(0, 300); await pause(sup.p, 1200); }
  await sup.p.context().close();
  await b.close();
  console.log('ok');
})().catch((e) => { console.error(e.message); process.exit(1); });
