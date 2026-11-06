/* SAMA XHEL — site vitrine, relié à l'API publique de SAMA XHEL Santé.
   Aucune donnée personnelle n'est stockée dans le navigateur. */
(function () {
  'use strict';
  const CFG = window.SAMA_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(chemin, { methode = 'GET', corps, entetes = {}, brut } = {}) {
    const r = await fetch(CFG.API + chemin, {
      method: methode,
      headers: brut ? entetes : { 'Content-Type': 'application/json', ...entetes },
      body: brut || (corps ? JSON.stringify(corps) : undefined),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = Array.isArray(d.details) ? ` (${d.details.map((x) => x.message || x).join(', ')})` : '';
      throw new Error((d.error || `Le service ne répond pas (erreur ${r.status}).`) + detail);
    }
    return d;
  }

  const TROUBLES = {
    TSA: 'Autisme', TDAH: 'TDAH', DI: 'Déficience intellectuelle', LANGAGE: 'Langage', DYS: 'Troubles « dys »',
    MOTEUR: 'Moteur', EPILEPSIE: 'Épilepsie', DEPRESSION: 'Dépression', ANXIETE: 'Anxiété', ADDICTION: 'Addictions',
    PSYCHIATRIE_ADULTE: 'Psychiatrie adulte', DEMENCE: 'Mémoire', TRAUMA: 'Traumatismes', TRISOMIE: 'Trisomie 21',
  };
  const TYPES = {
    HOPITAL: 'Hôpital', CENTRE_SANTE: 'Centre de santé', CENTRE_SPECIALISE: 'Centre spécialisé', ECOLE_INCLUSIVE: 'École inclusive',
    ECOLE_SPECIALISEE: 'École spécialisée', CABINET: 'Cabinet', ASSOCIATION: 'Association', CENTRE_ADDICTOLOGIE: 'Addictologie',
    CLINIQUE: 'Clinique', EHPAD: 'Maison de retraite',
  };
  const BASE = CFG.API.replace(/\/api\/?$/, '');
  const media = (u) => (!u ? null : /^https?:/.test(u) ? u : BASE + u);

  // ── Menu mobile ───────────────────────────────────────────────────────
  const boutonMenu = $('.menu-bouton');
  boutonMenu.addEventListener('click', () => {
    const ouvert = $('#menu').classList.toggle('ouvert');
    boutonMenu.setAttribute('aria-expanded', String(ouvert));
  });
  $('#menu').addEventListener('click', (e) => { if (e.target.tagName === 'A') $('#menu').classList.remove('ouvert'); });
  $('#lien-apk').href = CFG.LIEN_APK;
  $('#lien-apk-ancien').href = CFG.LIEN_APK_ANCIEN;
  // QR code : le téléphone télécharge l'APK depuis la même adresse que cette page
  try {
    const qr = qrcode(0, 'M');
    qr.addData(new URL(CFG.LIEN_APK, location.href).href);
    qr.make();
    $('#qr-apk').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  } catch (_) { $('#qr-apk').closest('figure').hidden = true; }

  // ── Diaporama de l'accueil, lu à voix haute ─────────────────────────
  const DIAPOS = [
    ['autisme', 'Autisme', 'Comprendre, accompagner, inclure. Votre enfant a sa place.'],
    ['tdah', 'TDAH', 'Agitation, inattention : ce n’est pas un caprice. On peut aider.'],
    ['down', 'Trisomie 21', 'Avec un suivi tôt, chaque enfant progresse.'],
    ['depression', 'Dépression', 'La tristesse qui dure se soigne. Vous n’êtes pas seul.'],
    ['anxiete', 'Stress et anxiété', 'Parler à quelqu’un, c’est déjà commencer à aller mieux.'],
    ['bipolaire', 'Troubles de l’humeur', 'Les hauts et les bas extrêmes se soignent aussi.'],
    ['addictions', 'Addictions', 'Drogue, alcool, écrans : une aide existe, sans jugement.'],
    ['traumatisme', 'Traumatismes', 'Après un choc, on peut retrouver la paix.'],
    ['memoire', 'Mémoire et personnes âgées', 'Ne pas oublier d’accompagner nos aînés.'],
  ];
  const pistes = $('#diapos');
  pistes.innerHTML = DIAPOS.map(([img], i) => `<div class="diapo${i ? '' : ' active'}" style="background-image:url('images/troubles/${img}.webp')"></div>`).join('');
  $('#diapo-points').innerHTML = DIAPOS.map(([, t], i) => `<button type="button" role="tab" aria-label="${esc(t)}" aria-selected="${!i}"></button>`).join('');
  let diapo = 0; let voix = false; let audio = null;
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function lire() {
    if (!voix) return;
    window.speechSynthesis?.cancel(); audio?.pause();
    const langue = $('#langue-voix').value;
    const [, titre, phrase] = DIAPOS[diapo];
    // Langues nationales : fichiers enregistrés (validés par des locuteurs natifs) quand ils existent
    if (langue !== 'fr' && langue !== 'en') {
      audio = new Audio(`voix/${langue}/diapo_${DIAPOS[diapo][0]}.mp3`);
      audio.play().catch(() => parler(`${titre}. ${phrase}`, 'fr-FR'));
      return;
    }
    parler(`${titre}. ${phrase}`, langue === 'en' ? 'en-US' : 'fr-FR');
  }
  function parler(texte, lang) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(texte); u.lang = lang; u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }
  function montrer(i) {
    diapo = (i + DIAPOS.length) % DIAPOS.length;
    pistes.querySelectorAll('.diapo').forEach((d, k) => d.classList.toggle('active', k === diapo));
    $('#diapo-points').querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === diapo)));
    $('#diapo-titre').textContent = DIAPOS[diapo][1];
    $('#diapo-phrase').textContent = DIAPOS[diapo][2];
    lire();
  }
  $('#diapo-points').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) montrer([...b.parentNode.children].indexOf(b)); });
  let minuterieDiapo = reduit ? null : setInterval(() => montrer(diapo + 1), 7000);
  $('#diaporama').addEventListener('mouseenter', () => { clearInterval(minuterieDiapo); minuterieDiapo = null; });
  $('#diaporama').addEventListener('mouseleave', () => { if (!reduit && !minuterieDiapo) minuterieDiapo = setInterval(() => montrer(diapo + 1), 7000); });
  $('#ecouter').addEventListener('click', () => {
    voix = !voix;
    $('#ecouter').setAttribute('aria-pressed', String(voix));
    $('#ecouter span').textContent = voix ? 'Arrêter la voix' : 'Écouter';
    if (voix) lire(); else { window.speechSynthesis?.cancel(); audio?.pause(); }
  });
  $('#langue-voix').addEventListener('change', lire);

  // Portes « Pour moi / mon enfant / un parent âgé » → annuaire filtré
  document.querySelectorAll('.porte').forEach((a) => a.addEventListener('click', () => {
    $('#f-public').value = a.dataset.public;
    setTimeout(chercher, 50);
  }));

  // ── Carte : MapLibre GL + OpenFreeMap (gratuit, sans clé, données OpenStreetMap) ──
  const carte = new maplibregl.Map({
    container: 'carte',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [-14.6, 14.45], zoom: 5.6, minZoom: 4,
    cooperativeGestures: true,           // la page défile normalement ; on zoome avec Ctrl/deux doigts
    attributionControl: { compact: true },
  });
  carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  carte.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false } }), 'top-left');
  const carteChargee = new Promise((ok) => carte.on('load', ok));
  carteChargee.then(() => {
    carte.addSource('structures', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 42, clusterMaxZoom: 11 });
    carte.addLayer({ id: 'grappes', type: 'circle', source: 'structures', filter: ['has', 'point_count'],
      paint: { 'circle-color': '#1F7A3E', 'circle-opacity': 0.88, 'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 15, 26], 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
    carte.addLayer({ id: 'grappes-n', type: 'symbol', source: 'structures', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#fff' } });
    carte.addLayer({ id: 'points', type: 'circle', source: 'structures', filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': ['case', ['get', 'enLigne'], '#1F7A3E', '#27355F'], 'circle-radius': ['case', ['get', 'enLigne'], 9, 7],
        'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
    carte.on('click', 'grappes', async (e) => {
      const f = e.features[0];
      const z = await carte.getSource('structures').getClusterExpansionZoom(f.properties.cluster_id);
      carte.easeTo({ center: f.geometry.coordinates, zoom: z });
    });
    carte.on('click', 'points', (e) => {
      const p = e.features[0].properties;
      new maplibregl.Popup({ offset: 12 }).setLngLat(e.features[0].geometry.coordinates)
        .setHTML(`<strong>${esc(p.nom)}</strong><br>${esc(p.type)} · ${esc(p.region)}${p.telephone ? `<br><a href="tel:${esc(p.telephone.replace(/\s/g, ''))}">${esc(p.telephone)}</a>` : ''}`)
        .addTo(carte);
    });
    ['grappes', 'points'].forEach((c) => {
      carte.on('mouseenter', c, () => { carte.getCanvas().style.cursor = 'pointer'; });
      carte.on('mouseleave', c, () => { carte.getCanvas().style.cursor = ''; });
    });
  });
  const SANS_ADRESSE = location.protocol === 'file:';

  /** Vignette : photo de la structure, sinon tuile OpenStreetMap du lieu réel */
  function tuileOsm(lat, lng, z = 16) {
    const n = 2 ** z;
    const x = Math.floor(((lng + 180) / 360) * n);
    const r = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    return SANS_ADRESSE ? `https://a.tile.openstreetmap.fr/osmfr/${z}/${x}/${y}.png` : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }
  function visuel(s) {
    const lat = Number(s.latitude); const lng = Number(s.longitude);
    const repli = s.latitude ? tuileOsm(lat, lng) : 'images/embleme.png';
    const src = s.photo_url || repli;
    return `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-repli="${esc(repli)}" onerror="if(this.src!==this.dataset.repli){this.src=this.dataset.repli}">`;
  }

  function carteHtml(s, extra = {}) {
    const tel = s.telephone ? `<a href="tel:${esc(s.telephone.replace(/\s/g, ''))}">Appeler</a>` : '';
    const itin = s.latitude ? `<a href="https://www.openstreetmap.org/directions?to=${s.latitude},${s.longitude}" target="_blank" rel="noopener">Itinéraire</a>` : '';
    const troubles = (s.troubles || []).slice(0, 4).map((t) => `<span class="badge">${esc(TROUBLES[t] || t)}</span>`).join('');
    return `<li class="structure${s.partenaire ? ' structure--partenaire' : ''}">
      <div class="structure__visuel">${visuel(s)}</div>
      <div class="structure__corps">
        <h3>${esc(s.nom)}</h3>
        <p class="structure__meta">${esc(TYPES[s.type] || s.type)} · ${esc(s.commune || s.region)}${extra.distance != null ? ` · ${extra.distance} km` : ''}${extra.score != null ? ` · pertinence ${extra.score}/100` : ''}</p>
        <div class="badges">${s.partenaire ? '<span class="badge badge--partenaire">Sur SAMA XHEL</span>' : ''}${troubles}</div>
        ${extra.raisons ? `<ul class="raisons">${extra.raisons.slice(0, 3).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        <div class="structure__actions">${tel}${itin}</div>
        ${s.photo_url && s.photo_credit ? `<p class="structure__credit">Photo : ${esc(s.photo_credit)}</p>` : ''}
      </div></li>`;
  }

  function afficher(liste, titre) {
    const avecGps = liste.filter((s) => s.latitude);
    carteChargee.then(() => {
      carte.getSource('structures').setData({ type: 'FeatureCollection', features: avecGps.map((s) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [Number(s.longitude), Number(s.latitude)] },
        properties: { nom: s.nom, type: TYPES[s.type] || s.type, region: s.region, telephone: s.telephone || '', enLigne: Boolean(s.partenaire) },
      })) });
      if (avecGps.length) {
        const b = new maplibregl.LngLatBounds();
        avecGps.forEach((s) => b.extend([Number(s.longitude), Number(s.latitude)]));
        carte.fitBounds(b, { padding: 50, maxZoom: 12, duration: 600 });
      }
    });
    $('#resultats-titre').textContent = titre;
  }
  function lister(liste, extras) {
    $('#liste-structures').innerHTML = liste.slice(0, 80).map((s, i) => carteHtml(s, extras ? extras[i] : {})).join('')
      || '<li>Aucune structure ne correspond. Élargissez la recherche (région ou trouble).</li>';
  }

  // ── Secours hors connexion : si l'API ne répond pas, on cherche dans la copie publique embarquée ──
  const SECOURS = window.SAMA_SECOURS || null;
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function km(a, b) {
    const R = 6371; const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
  }
  function chercherLocal(f, pos) {
    let l = SECOURS.structures.filter((s) => (!f.region || s.region === f.region)
      && (!f.trouble || (s.troubles || []).includes(f.trouble)) && (!f.type || s.type === f.type)
      && (!f.public || (s.publics || ['ENFANT']).includes(f.public))
      && (!f.q || norm(`${s.nom} ${s.commune} ${s.region}`).includes(norm(f.q))));
    l = l.map((s) => ({ ...s, distance_km: pos && s.latitude ? km(pos, { lat: Number(s.latitude), lng: Number(s.longitude) }) : null }));
    l.sort((a, b) => (pos ? (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9) : (b.partenaire - a.partenaire) || a.nom.localeCompare(b.nom)));
    return l;
  }
  function orienterLocal(region, troubles) {
    return SECOURS.structures.map((s) => {
      const communs = troubles.filter((t) => (s.troubles || []).includes(t));
      const raisons = [];
      let score = 0;
      if (communs.length) { score += 50; raisons.push(`Prend en charge : ${communs.join(', ')}`); }
      if (s.region === region) { score += 30; raisons.push(`Dans votre région (${region})`); }
      if (s.partenaire) { score += 20; raisons.push('Partenaire SAMA XHEL'); }
      return { structure: s, score, raisons };
    }).filter((r) => r.score >= 50).sort((a, b) => b.score - a.score).slice(0, 10);
  }
  const noteSecours = ' — mode hors connexion (copie du 26/10/2026)';

  let position = null;
  async function chercher() {
    const p = new URLSearchParams({ limit: '500' });
    const f = { public: $('#f-public').value, region: $('#f-region').value, trouble: $('#f-trouble').value, type: $('#f-type').value, q: $('#f-q').value.trim() };
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    if (position) { p.set('lat', position.lat); p.set('lng', position.lng); }
    $('#resultats-titre').textContent = 'Recherche…';
    try {
      const d = await api(`/structures?${p}`);
      afficher(d.structures, `${d.total} structure${d.total > 1 ? 's' : ''}${position ? ', les plus proches en premier' : ''}`);
      lister(d.structures, d.structures.map((s) => ({ distance: s.distance_km })));
    } catch (e) {
      if (!SECOURS) { $('#resultats-titre').textContent = `Impossible de charger les structures : ${e.message}`; return; }
      const l = chercherLocal(f, position);
      afficher(l, `${l.length} structure${l.length > 1 ? 's' : ''}${noteSecours}`);
      lister(l, l.map((s) => ({ distance: s.distance_km })));
    }
  }
  let minuteur;
  ['#f-public', '#f-region', '#f-trouble', '#f-type'].forEach((s) => $(s).addEventListener('change', chercher));
  $('#f-q').addEventListener('input', () => { clearTimeout(minuteur); minuteur = setTimeout(chercher, 350); });
  $('#f-proche').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    $('#f-proche').disabled = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $('#f-proche').disabled = false;
      chercher();
    }, () => { $('#f-proche').disabled = false; $('#resultats-titre').textContent = 'Position refusée : choisissez votre région.'; }, { timeout: 8000 });
  });

  // ── Données de référence ─────────────────────────────────────────────
  api('/structures/meta').catch((e) => { if (SECOURS) return SECOURS.meta; throw e; }).then((m) => {
    const opts = m.regions.map((r) => `<option>${esc(r)}</option>`).join('');
    $('#f-region').insertAdjacentHTML('beforeend', opts);
    $('#f-trouble').insertAdjacentHTML('beforeend', Object.entries(m.troubles).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join(''));
  }).catch(() => {});
  chercher();
  api('/structures?partenaire=true&limit=50').catch((e) => { if (SECOURS) return { structures: SECOURS.structures.filter((x) => x.partenaire) }; throw e; }).then((d) => {
    $('#pro-structure').insertAdjacentHTML('beforeend', d.structures.map((s) => `<option value="${s.id}">${esc(s.nom)}</option>`).join(''));
  }).catch(() => {});

  // ── Portails des établissements (logo si partenaire, sinon icône hôpital) ──
  const ICONE_HOPITAL = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>';
  api('/portails?en_ligne=true&limit=12').then((d) => {
    $('#portails').innerHTML = d.etablissements.map((e) => `<li class="portail" style="--teinte:${esc(e.couleur || '#1F7A3E')}"><a class="portail__lien" href="/etablissement/${esc(e.code)}" aria-label="Portail de ${esc(e.nom)}"></a>
      <span class="portail__logo">${e.logo_url ? `<img src="${esc(media(e.logo_url))}" alt="" loading="lazy">` : ICONE_HOPITAL}</span>
      <span class="portail__corps"><strong>${esc(e.nom)}</strong><small>${esc([e.parent?.nom, e.commune || e.region].filter(Boolean).join(' · '))}</small></span>
      <span class="portail__code">code : ${esc(e.code)}</span></li>`).join('');
  }).catch(() => { $('#portails').innerHTML = '<li class="note">Les portails s’afficheront quand le serveur sera joignable.</li>'; });

  // ── Test de repérage anonyme ─────────────────────────────────────────
  async function listerTests() {
    try {
      const d = await api(`/questionnaires?age_mois=${$('#test-age').value}`);
      $('#test-liste').innerHTML = d.questionnaires.map((q) => `<li><button type="button" data-code="${q.code}">
        <span class="icone" aria-hidden="true">${esc(q.icone)}</span>
        <span><strong>${esc(q.titre)}</strong>${esc(q.description)} — ${q.nb_questions} questions</span></button></li>`).join('')
        || '<li>Aucun test pour cet âge.</li>';
    } catch (e) {
      $('#test-liste').innerHTML = `<li>${esc(e.message)}</li>`;
    }
  }
  $('#test-age').addEventListener('change', listerTests);
  listerTests();

  let test = null;
  $('#test-liste').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-code]');
    if (!b) return;
    const d = await api(`/questionnaires/${b.dataset.code}`);
    test = { q: d.questionnaire, i: 0, reponses: {} };
    $('#test-choix').hidden = true; $('#test-resultat').hidden = true; $('#test-questions').hidden = false;
    question();
  });

  function question() {
    const { q, i } = test;
    const qu = q.questions[i];
    $('#test-questions').innerHTML = `<div class="question">
      <div class="progression" role="progressbar" aria-valuemin="0" aria-valuemax="${q.questions.length}" aria-valuenow="${i}"><span style="width:${(i / q.questions.length) * 100}%"></span></div>
      <p class="note">Question ${i + 1} sur ${q.questions.length}${q.consigne && i === 0 ? ` — ${esc(q.consigne)}` : ''}</p>
      <p class="q">${esc(qu.texte)}</p>
      <div class="reponses">${qu.options.map((o) => `<button type="button" data-v="${o.valeur}">${esc(o.libelle)}</button>`).join('')}</div>
      ${i > 0 ? '<p><button type="button" class="bouton bouton--clair bouton--petit" data-retour>Question précédente</button></p>' : ''}
    </div>`;
    $('#test-questions .reponses button').focus();
  }

  $('#test-questions').addEventListener('click', async (e) => {
    if (e.target.matches('[data-retour]')) { test.i--; question(); return; }
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    test.reponses[test.q.questions[test.i].id] = Number(b.dataset.v);
    if (test.i < test.q.questions.length - 1) { test.i++; question(); return; }
    $('#test-questions').innerHTML = '<p>Calcul du résultat…</p>';
    try {
      const d = await api(`/questionnaires/${test.q.code}/evaluer`, {
        methode: 'POST', corps: { reponses: test.reponses, age_mois: Number($('#test-age').value), region: $('#f-region').value || undefined },
      });
      resultat(d);
    } catch (err) {
      $('#test-questions').innerHTML = `<p class="message message--erreur">${esc(err.message)}</p>`;
    }
  });

  function resultat(d) {
    const r = d.resultat;
    const titres = { FAIBLE: 'Peu de signes aujourd’hui', MODERE: 'Quelques signes à surveiller', ELEVE: 'Plusieurs signes importants' };
    $('#test-questions').hidden = true;
    $('#test-resultat').hidden = false;
    $('#test-resultat').innerHTML = `
      <div class="resultat resultat--${r.niveau}"><h3>${titres[r.niveau]}</h3><p>${esc(r.conseil)}</p>
      <p class="note">Ce résultat n’est pas un diagnostic. Seul un professionnel de santé peut le poser.</p></div>
      ${(r.alertes || []).map((a) => `<p class="alerte">${esc(a.message)}</p>`).join('')}
      ${d.recommandations.length ? `<h3>Structures conseillées</h3><ul class="cartes-structures">${d.recommandations
    .map((x) => carteHtml(x.structure, { score: x.score, distance: x.distance_km, raisons: x.raisons })).join('')}</ul>` : ''}
      <p style="margin-top:16px"><button type="button" class="bouton bouton--clair" id="test-recommencer">Faire un autre test</button></p>`;
    $('#test-recommencer').addEventListener('click', () => { $('#test-resultat').hidden = true; $('#test-choix').hidden = false; });
    $('#test-resultat').scrollIntoView({ block: 'start' });
  }

  // ── Candidature d'un professionnel ───────────────────────────────────
  const formPro = $('#form-pro');
  const msgPro = (t, ok) => { $('#pro-message').textContent = t; $('#pro-message').className = `message ${ok ? 'message--ok' : 'message--erreur'}`; };
  let emailPro = null;
  formPro.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(formPro);
    const role = f.get('role');
    const fichiers = ['DIPLOME', 'IDENTITE', 'ORDRE'].map((t) => [t, formPro.elements[t].files[0]]).filter(([, x]) => x);
    if (role === 'MEDECIN' && !formPro.elements.ORDRE.files[0]) return msgPro('Pour un médecin, l’attestation d’inscription à l’Ordre est obligatoire.');
    if (!formPro.checkValidity()) { formPro.reportValidity(); return undefined; }
    const tropLourd = fichiers.find(([, x]) => x.size > 5 * 1024 * 1024);
    if (tropLourd) return msgPro(`${tropLourd[1].name} dépasse 5 Mo.`);
    const bouton = formPro.querySelector('button[type=submit]');
    bouton.disabled = true;
    try {
      msgPro('Envoi de la candidature…', true);
      const corps = {
        prenom: f.get('prenom'), nom: f.get('nom'), email: f.get('email'), telephone: f.get('telephone'), password: f.get('password'),
        structure_id: f.get('structure_id'), role, specialite: f.get('specialite'),
      };
      if (f.get('numero_ordre')) corps.numero_ordre = f.get('numero_ordre');
      const r = await api('/auth/register-professionnel', { methode: 'POST', corps });
      for (const [type, fichier] of fichiers) {
        msgPro(`Envoi de la pièce : ${fichier.name}…`, true);
        await api(`/candidatures/pieces?type=${type}&nom=${encodeURIComponent(fichier.name.slice(0, 100))}`, {
          methode: 'POST', brut: fichier, entetes: { 'Content-Type': fichier.type, 'X-Jeton-Depot': r.jeton_depot },
        });
      }
      emailPro = corps.email;
      $('#pro-etape-1').hidden = true; $('#pro-etape-2').hidden = false;
      msgPro('Candidature et pièces reçues. Activez votre compte avec le code reçu par e-mail.', true);
    } catch (err) {
      msgPro(err.message);
    } finally {
      bouton.disabled = false;
    }
    return undefined;
  });
  $('#pro-activer').addEventListener('click', async () => {
    try {
      const r = await api('/auth/verify', { methode: 'POST', corps: { identifier: emailPro, code: formPro.elements.code.value.trim() } });
      $('#pro-etape-2').hidden = true;
      msgPro(r.message || 'Compte activé. La structure va vérifier vos pièces et vous convoquer à un entretien.', true);
      // Montre tout de suite le suivi du dossier (informations du compte et étapes)
      const f = new FormData(formPro);
      api('/auth/candidature/statut', { methode: 'POST', corps: { identifier: emailPro, password: f.get('password') } })
        .then((d) => { $('#dlg-pro').close(); afficherSuivi(d); ouvrir('dlg-suivi'); }).catch(() => {});
    } catch (err) {
      msgPro(err.message);
    }
  });

  // ── Dons (transparence publique) ─────────────────────────────────────
  const fcfa = (n) => `${Number(n).toLocaleString('fr-FR')} F CFA`;
  api('/dons/transparence').then((t) => {
    $('#transparence').innerHTML = `<strong>${fcfa(t.collecte)}</strong> collectés en ${t.annee} sur un objectif de ${fcfa(t.objectif)} (${t.nombre_dons} dons)
      <div class="jauge" role="progressbar" aria-valuenow="${t.progression_pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${t.progression_pct}%"></span></div>
      <span class="note">${t.repartition.map((x) => `${esc(x.poste)} : ${x.pourcentage} %`).join(' — ')}</span>`;
  }).catch(() => { $('#transparence').hidden = true; });
  // ── Fenêtres (popups) ─────────────────────────────────────────────────
  const ouvrir = (id) => { const d = document.getElementById(id); if (d && !d.open) d.showModal(); return d; };
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-ouvrir]');
    if (o) { e.preventDefault(); ouvrir(o.dataset.ouvrir); }
    const f = e.target.closest('[data-fermer]');
    if (f) f.closest('dialog')?.close();
  });
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  $('#annee').textContent = new Date().getFullYear();
  // iPhone / iPad : le bouton Android ouvre l'information « bientôt disponible »
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    $('#lien-apk').addEventListener('click', (e) => { e.preventDefault(); ouvrir('dlg-iphone'); });
  }

  // ── Dons : Wave Business ou Orange Money, puis remerciement ──────────
  $('#form-don').addEventListener('submit', (e) => {
    e.preventDefault();
    const montant = Number(new FormData(e.target).get('montant'));
    const moyen = e.submitter?.value || 'WAVE';
    api('/dons', { methode: 'POST', corps: { montant, moyen, anonyme: true } }).catch(() => {}); // trace du don (montant seulement)
    if (moyen === 'WAVE') {
      window.open(CFG.LIEN_WAVE, '_blank', 'noopener');
      $('#wave-montant').textContent = fcfa(montant);
      ouvrir('dlg-wave');
    } else {
      $('#om-montant').textContent = fcfa(montant);
      ouvrir('dlg-om');
    }
  });
  const merci = () => {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    ouvrir('dlg-merci');
    confettis($('#confettis'));
  };
  $('#wave-fait').addEventListener('click', merci);
  $('#om-fait').addEventListener('click', merci);

  /** Confettis aux couleurs du Sénégal (respecte « réduire les animations ») */
  function confettis(canvas) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    const r = canvas.parentElement.getBoundingClientRect();
    canvas.width = r.width; canvas.height = r.height;
    const couleurs = ['#00853F', '#FDEF42', '#E31B23', '#1F7A3E', '#E7A21F'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height, v: 2 + Math.random() * 3,
      a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.2, t: 6 + Math.random() * 6, c: couleurs[Math.floor(Math.random() * couleurs.length)],
    }));
    const debut = performance.now();
    (function image(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.y += p.v; p.x += Math.sin(p.a) * 1.2; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.t / 2, -p.t / 4, p.t, p.t / 2); ctx.restore();
      });
      if (t - debut < 4500) requestAnimationFrame(image); else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }(debut));
  }

  // ── Suivre mon dossier (soignant candidat) ───────────────────────────
  const ETAT = { EN_ATTENTE: 'En vérification', CONVOQUE: 'Convoqué à un entretien', ACTIF: 'Validé', REFUSE: 'Non retenu', SUSPENDU: 'Suspendu' };
  function afficherSuivi(d) {
    const c = d.compte;
    $('#suivi-resultat').innerHTML = `
      <div class="compte"><strong>${esc(c.prenom)} ${esc(c.nom)}</strong><span>${esc(c.email || '')} · ${esc(c.telephone || '')}</span></div>
      ${d.candidatures.map((x) => `<div class="dossier">
        <h3>${esc(x.structure)} <small>${esc(x.role.toLowerCase())}${x.specialite ? ` · ${esc(x.specialite)}` : ''}</small></h3>
        <ol class="frise">${d.etapes.map((t, i) => `<li class="${i + 1 < x.etape ? 'fait' : i + 1 === x.etape ? 'encours' : ''}">${esc(t)}</li>`).join('')}</ol>
        <p class="statut statut--${x.statut}">${ETAT[x.statut] || x.statut}${x.convocation_date ? ` — le ${new Date(x.convocation_date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}, ${esc(x.convocation_lieu || '')}` : ''}${x.decision_motif ? ` — ${esc(x.decision_motif)}` : ''}</p>
        ${x.statut === 'ACTIF' ? `<p>Vous pouvez vous connecter dans l’application, par le portail de l’établissement (code : <strong>${esc(x.code)}</strong>).</p>` : ''}
      </div>`).join('') || '<p>Aucune candidature pour ce compte.</p>'}
      <h3>Pièces déposées</h3>
      <ul class="pieces-liste">${d.pieces.map((p) => `<li>${esc(p.nom_fichier)} — <em>${esc(p.statut.replace('_', ' ').toLowerCase())}</em></li>`).join('') || '<li>Aucune</li>'}</ul>
      <p class="note">Vous pouvez postuler dans d’autres établissements : la carte « Où être suivi » les liste tous.</p>`;
    $('#suivi-resultat').hidden = false;
    $('#form-suivi').hidden = true;
  }
  $('#form-suivi').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      afficherSuivi(await api('/auth/candidature/statut', { methode: 'POST', corps: { identifier: f.get('identifier'), password: f.get('password') } }));
    } catch (err) {
      $('#suivi-message').className = 'message message--erreur'; $('#suivi-message').textContent = err.message;
    }
  });

  // ── Invitation du personnel : lien …/#invitation=<jeton> ──────────────
  const jetonInvitation = (location.hash.match(/invitation=([A-Za-z0-9_-]{20,64})/) || [])[1];
  if (jetonInvitation) {
    api(`/invitations/${jetonInvitation}`).then((d) => {
      $('#inv-texte').innerHTML = `<strong>${esc(d.etablissement.nom)}</strong> vous invite comme <strong>${esc(d.libelle)}</strong>. Créez votre compte : vous n’aurez accès qu’à cet établissement.`;
      const champ = d.destinataire.includes('@') ? 'email' : 'telephone';
      $(`#form-invitation [name=${champ}]`).value = d.destinataire;
      ouvrir('dlg-invitation');
    }).catch((err) => { $('#inv-texte').textContent = err.message; $('#form-invitation').hidden = true; ouvrir('dlg-invitation'); });
    $('#form-invitation').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => String(v).trim()));
      try {
        const r = await api(`/invitations/${jetonInvitation}/accepter`, { methode: 'POST', corps: f });
        $('#inv-message').className = 'message message--ok'; $('#inv-message').textContent = r.message;
        e.target.querySelector('button').disabled = true;
        history.replaceState(null, '', location.pathname);
      } catch (err) {
        $('#inv-message').className = 'message message--erreur'; $('#inv-message').textContent = err.message;
      }
    });
  }

  // ── Assistant du site : guide par mots-clés (aucune IA externe, aucune donnée envoyée) ──
  const REPONSES = [
    { mots: ['telecharg', 'apk', 'install', 'android', 'application', 'appli', 'app'], texte: 'Pour installer SAMA XHEL sur Android : touchez « Télécharger pour Android », ouvrez le fichier, autorisez l’installation si Android le demande, puis « Installer ». Sur ordinateur, scannez le QR code avec votre téléphone.', action: ['Aller au téléchargement', '#application'] },
    { mots: ['iphone', 'ios', 'apple', 'ipad'], texte: 'La version iPhone arrive bientôt sur l’App Store. En attendant, SAMA XHEL fonctionne dans Safari.', action: ['Ouvrir la version web', '/app/'] },
    { mots: ['centre', 'hopital', 'hôpital', 'structure', 'trouver', 'ou aller', 'près', 'pres', 'seet'], texte: 'La carte liste les établissements de santé mentale de tout le Sénégal. Choisissez « Pour » (enfant, adulte, personne âgée) et votre région.', action: ['Ouvrir la carte', '#trouver'] },
    { mots: ['test', 'autis', 'tdah', 'depress', 'anxi', 'memoire', 'mémoire', 'repérage', 'reperage', 'signe'], texte: 'Les tests de repérage sont gratuits et anonymes, pour un enfant, un adulte ou une personne âgée. Ce n’est pas un diagnostic : ils disent s’il faut consulter et où.', action: ['Faire un test', '#test'] },
    { mots: ['urgence', 'danger', 'suicide', 'mourir', 'musiba', 'samu'], texte: 'En cas de danger immédiat, appelez le SAMU au 1515, tout de suite.', action: ['Appeler le 1515', 'tel:1515'] },
    { mots: ['medecin', 'médecin', 'soignant', 'candidat', 'psycholog', 'orthophon', 'emploi', 'travaill'], texte: 'Vous êtes soignant ? Déposez votre candidature (diplôme, pièce d’identité, Ordre des médecins) puis suivez votre dossier en ligne.', action: ['Déposer ma candidature', 'dlg-pro'] },
    { mots: ['hopital', 'établissement', 'etablissement', 'directeur', 'adhésion', 'adhesion', 'portail', 'créer mon'], texte: 'Chaque établissement a son portail, son logo et ses comptes. Pour rejoindre SAMA XHEL : demande, pièces, visite sur place, puis ouverture du portail.', action: ['Voir les étapes', '#etablissements'] },
    { mots: ['don', 'wave', 'orange money', 'payer', 'aider', 'soutenir'], texte: 'Vous pouvez aider une famille à payer ses séances, par Wave ou Orange Money. Les montants sont publiés, jamais les noms.', action: ['Faire un don', '#soutenir'] },
    { mots: ['langue', 'wolof', 'pulaar', 'serer', 'sérère', 'lire', 'voix'], texte: 'Pas besoin de savoir lire : l’application parle wolof, pulaar, sérère, diola, mandinka, bambara, français et anglais, et comprend les messages vocaux.', action: ['En savoir plus', '#sans-lire'] },
    { mots: ['données', 'donnees', 'sécurité', 'securite', 'confidentiel', 'secret', 'cdp'], texte: 'Les données de santé sont chiffrées, chaque établissement ne voit que ses patients, et tout accès est tracé (loi n° 2008-12, CDP).' },
  ];
  const SUGGESTIONS = ['Télécharger l’application', 'Trouver un centre', 'Faire un test', 'Je suis médecin', 'J’ai un iPhone'];
  const fil = $('#assistant-fil');
  const bulle = (texte, qui, action) => {
    const b = document.createElement('div');
    b.className = `bulle bulle--${qui}`;
    b.textContent = texte;
    if (action) {
      const a = document.createElement(action[1].startsWith('dlg-') ? 'button' : 'a');
      a.className = 'bulle__action'; a.textContent = action[0];
      if (action[1].startsWith('dlg-')) { a.type = 'button'; a.addEventListener('click', () => ouvrir(action[1])); } else a.href = action[1];
      b.appendChild(a);
    }
    fil.appendChild(b); fil.scrollTop = fil.scrollHeight;
  };
  function repondre(question) {
    bulle(question, 'moi');
    const n = norm(question);
    const r = REPONSES.map((x) => ({ x, score: x.mots.filter((m) => n.includes(norm(m))).length })).sort((a, b) => b.score - a.score)[0];
    setTimeout(() => (r.score
      ? bulle(r.x.texte, 'lui', r.x.action)
      : bulle('Je n’ai pas bien compris. Essayez : « télécharger », « trouver un centre », « faire un test », « je suis médecin », « don ». Pour parler à quelqu’un : +221 77 470 21 57.', 'lui')), 350);
  }
  $('#assistant-suggestions').innerHTML = SUGGESTIONS.map((t) => `<button type="button">${esc(t)}</button>`).join('');
  $('#assistant-suggestions').addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') repondre(e.target.textContent); });
  $('#assistant-form').addEventListener('submit', (e) => { e.preventDefault(); const t = $('#assistant-texte').value.trim(); if (t) { repondre(t); $('#assistant-texte').value = ''; } });
  const basculer = (ouvert) => {
    $('#assistant').hidden = !ouvert;
    $('#assistant-ouvrir').setAttribute('aria-expanded', String(ouvert));
    if (ouvert && !fil.childElementCount) bulle('Bonjour 👋 Je suis l’assistant de SAMA XHEL. Que cherchez-vous ?', 'lui');
    if (ouvert) $('#assistant-texte').focus();
  };
  $('#assistant-ouvrir').addEventListener('click', () => basculer($('#assistant').hidden));
  $('#assistant-fermer').addEventListener('click', () => basculer(false));
}());
