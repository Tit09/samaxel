/* Portail public d'un établissement : /etablissement/<code>
   Tout ce qui s'affiche vient de l'API publique (/api/portails/<code>, /tarifs, /file).
   Les boutons ouvrent l'application web dans la « maison » de cet établissement. */
(function () {
  const API = window.SAMA_CONFIG.API;
  const BASE = API.replace(/\/api$/, '');
  const code = (location.pathname.match(/\/etablissement\/([a-z0-9-]+)/) || [])[1];
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICONE = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="12" width="32" height="30" rx="4" fill="currentColor" opacity=".18"/><path d="M21 18h6v6h6v6h-6v6h-6v-6h-6v-6h6z" fill="currentColor"/></svg>';
  const fcfa = (n) => `${Number(n).toLocaleString('fr-FR')} F`;
  const get = (p) => fetch(API + p).then((r) => (r.ok ? r.json() : Promise.reject(r)));

  if (!code) { $('#nom').textContent = 'Établissement introuvable'; return; }

  function appliquerTeinte(c) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(c || '')) return;
    document.documentElement.style.setProperty('--teinte', c);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', c);
  }

  get(`/portails/${code}`).then(({ etablissement: e, services }) => {
    document.title = `${e.sigle || e.nom} — portail SAMA XHEL`;
    appliquerTeinte(e.couleur);
    const logo = e.logo_url ? `<img src="${esc(BASE + e.logo_url)}" alt="Logo ${esc(e.sigle || e.nom)}">` : ICONE;
    $('#logo').innerHTML = logo;
    $('#logo-petit').innerHTML = logo;
    $('#nom-court').textContent = e.sigle || e.nom;
    $('#nom').textContent = e.nom;
    $('#rattache').textContent = e.parent ? `${e.parent.nom}` : '';
    $('#infos').innerHTML = [
      e.adresse || e.commune ? `<li>📍 ${esc([e.adresse, e.commune, e.region].filter(Boolean).join(', '))}</li>` : '',
      e.horaires ? `<li>🕘 ${esc(e.horaires)}</li>` : '',
      e.telephone ? `<li>📞 <a href="tel:${esc(e.telephone.replace(/\s/g, ''))}">${esc(e.telephone)}</a></li>` : '',
    ].join('');
    if (e.en_ligne) {
      $('#portes').hidden = false;
      $('#parcours').hidden = false;
      $('#file-section').hidden = false;
      $('#ecran-file').href = `/etablissement/${code}/file`;
      // Le site présente l'établissement ; la connexion se fait dans l'application, pas sur le site
      $('#nom-porte').textContent = e.sigle || e.nom;
      $('#p-apk').href = window.SAMA_CONFIG.LIEN_APK;
      $('#p-web').href = `/app/#/portail/${code}`;
      $('#offre').hidden = false;
      $('#description').textContent = e.description || '';
      $('#services').innerHTML = services.length
        ? services.map((s) => `<li><strong>${esc(s.nom)}</strong>${s.specialite ? `<span>${esc(s.specialite)}</span>` : ''}</li>`).join('')
        : '<li>Consultations et suivi</li>';
      get(`/portails/${code}/tarifs`).then((t) => {
        $('#tarifs').innerHTML = t.tarifs.map((x) => `<tr><th scope="row">${esc(x.libelle)}${x.en_ligne ? '<small>payable dans l’application</small>' : ''}</th><td>${fcfa(x.montant)}</td></tr>`).join('');
      }).catch(() => {});
      rafraichirFile();
      setInterval(rafraichirFile, 8000);
    } else {
      $('#hors-ligne').hidden = false;
      if (e.telephone) $('#appeler').href = `tel:${e.telephone.replace(/\s/g, '')}`; else $('#appeler').hidden = true;
    }
  }).catch(() => { $('#nom').textContent = 'Établissement introuvable'; });

  function rafraichirFile() {
    get(`/portails/${code}/file`).then((f) => {
      $('#file-appeles').innerHTML = f.appeles.length
        ? f.appeles.slice(0, 3).map((a) => `<p class="appel"><strong>${esc(a.numero)}</strong><span>${esc(a.bureau || '')}</span></p>`).join('')
          + `<p class="note">${f.en_attente.length} personne(s) en attente</p>`
        : `<p class="note">Aucun numéro appelé pour l’instant. ${f.en_attente.length} en attente.</p>`;
    }).catch(() => {});
  }

  // Lecture à voix haute (voix du navigateur) pour les personnes qui ne lisent pas
  $('#ecouter').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const t = `${$('#nom').textContent}. Pour être suivi ici, installez l’application SAMA XHEL et choisissez cet hôpital, ou venez à la caisse de l’entrée payer votre ticket. On vous indiquera le bureau où aller.`;
    const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 0.9;
    speechSynthesis.speak(u);
  });
}());
