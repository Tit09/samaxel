/* Écran de la salle d'attente : /etablissement/<code>/file — à afficher sur une télévision.
   Numéros uniquement ; un nouveau numéro appelé est annoncé à voix haute. */
(function () {
  const API = window.SAMA_CONFIG.API;
  const code = (location.pathname.match(/\/etablissement\/([a-z0-9-]+)/) || [])[1];
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let dernier = null;

  fetch(`${API}/portails/${code}`).then((r) => r.json()).then(({ etablissement: e }) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(e.couleur || '')) document.documentElement.style.setProperty('--teinte', e.couleur);
    $('#nom').textContent = `${e.sigle || e.nom} — salle d’attente`;
    if (e.logo_url) $('#logo').innerHTML = `<img src="${esc(API.replace(/\/api$/, '') + e.logo_url)}" alt="">`;
  }).catch(() => {});

  function annoncer(a) {
    if (!('speechSynthesis' in window)) return;
    const n = a.numero.replace('-', ' ');
    const u = new SpeechSynthesisUtterance(`Numéro ${n}, ${a.bureau ? `présentez-vous au ${a.bureau}` : 'présentez-vous'}.`);
    u.lang = 'fr-FR'; u.rate = 0.85; speechSynthesis.speak(u);
  }

  function rafraichir() {
    fetch(`${API}/portails/${code}/file`).then((r) => r.json()).then((f) => {
      const premier = f.appeles[0];
      const nouveau = premier && `${premier.numero}|${premier.appele_le}` !== dernier;
      $('#appeles').innerHTML = f.appeles.length
        ? f.appeles.map((a, i) => `<p class="ecran__appel ${i === 0 && nouveau ? 'ecran__appel--nouveau' : ''}"><strong>${esc(a.numero)}</strong><span>${esc(a.bureau || '')}</span></p>`).join('')
        : '<p class="ecran__appel"><span>Aucun numéro appelé pour l’instant</span></p>';
      $('#attente').innerHTML = f.en_attente.map((n) => `<li>${esc(n)}</li>`).join('') || '<li>—</li>';
      if (nouveau && dernier !== null) annoncer(premier);
      if (premier) dernier = `${premier.numero}|${premier.appele_le}`; else if (dernier === null) dernier = '';
    }).catch(() => {});
    $('#heure').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  rafraichir();
  setInterval(rafraichir, 4000);
}());
