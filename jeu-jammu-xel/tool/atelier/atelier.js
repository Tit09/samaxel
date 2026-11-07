// Atelier d'images de JÀMMU XEL : chaque entrée produit un PNG (sprite transparent ou fond).
// Style « sous-verre doux » : contour à l'encre, aplats, motifs wax.
const W = 8; // épaisseur d'encre à l'échelle 512
const L = (o) => `stroke="${E}" stroke-width="${o ?? W}" stroke-linejoin="round" stroke-linecap="round"`;
const PEAU = { awa: '#7A4B2E', amadou: '#6B3F25', modou: '#5E3A24', maam: '#5E3A24', ndeye: '#7A4B2E', voisine: '#6E4329', docteure: '#8A5636' };

// ── Visage en gros plan avec émotion ──────────────────────────────────────
function tete({ qui = 'awa', emo = 'neutre' }) {
  const peau = PEAU[qui];
  const tenue = { awa: 'url(#wax1)', amadou: 'url(#wax3)', modou: '#4D84A3', maam: '#E9E2D3', ndeye: 'url(#wax2)', voisine: 'url(#wax4)', docteure: '#FFF8EA' }[qui];
  const enfant = qui === 'amadou';
  const R = enfant ? 118 : 112;
  let s = `<g ${L()}>`;
  // buste
  s += `<path d="M86 512 C96 420 150 382 256 378 C362 382 416 420 426 512 Z" fill="${tenue}"/>`;
  if (qui === 'docteure') s += `<path d="M206 384 L256 470 L306 384" fill="none"/><circle cx="330" cy="440" r="16" fill="#9AA3A8"/><path d="M226 390 Q200 440 240 470 Q290 500 330 456" fill="none" stroke-width="6"/>`;
  s += `<rect x="226" y="330" width="60" height="62" fill="${peau}"/>`;
  // oreilles + tête
  s += `<ellipse cx="${256 - R + 4}" cy="250" rx="20" ry="28" fill="${peau}"/><ellipse cx="${256 + R - 4}" cy="250" rx="20" ry="28" fill="${peau}"/>`;
  s += `<ellipse cx="256" cy="236" rx="${R}" ry="${R * 1.08}" fill="${peau}"/>`;
  // coiffe
  if (qui === 'awa' || qui === 'voisine' || qui === 'ndeye') {
    const f = qui === 'voisine' ? 'url(#wax4)' : 'url(#wax2)';
    s += `<path d="M140 220 C120 90 392 90 372 220 C330 168 182 168 140 220 Z" fill="${f}"/><path d="M330 130 q70 -60 92 6 q-46 -4 -70 34 z" fill="${f}"/>`;
  } else if (qui === 'maam') {
    s += `<path d="M138 232 C116 92 396 92 374 232 C340 176 172 176 138 232 Z" fill="#E9E2D3"/><path d="M150 230 Q140 300 170 340 M362 230 Q372 300 342 340" fill="none" stroke-width="6"/>`;
  } else if (qui === 'modou') {
    s += `<path d="M150 170 Q256 80 362 170 Q330 140 256 138 Q182 140 150 170 Z" fill="${E}"/>`;
  } else if (qui === 'amadou') {
    s += `<path d="M146 190 Q150 104 256 104 Q362 104 366 190 Q320 150 256 150 Q192 150 146 190 Z" fill="${E}"/>`;
  } else if (qui === 'docteure') {
    s += `<path d="M150 210 Q140 100 256 100 Q372 100 362 210 Q330 150 256 150 Q182 150 150 210 Z" fill="${E}"/><circle cx="256" cy="100" r="34" fill="${E}"/>`;
  }
  // visage selon l'émotion
  const yeux = (ry = 13, dy = 0) => `<ellipse cx="212" cy="${246 + dy}" rx="11" ry="${ry}" fill="${E}" stroke="none"/><ellipse cx="300" cy="${246 + dy}" rx="11" ry="${ry}" fill="${E}" stroke="none"/><circle cx="216" cy="${241 + dy}" r="3.5" fill="#FFF8EA" stroke="none"/><circle cx="304" cy="${241 + dy}" r="3.5" fill="#FFF8EA" stroke="none"/>`;
  const joues = `<circle cx="186" cy="290" r="16" fill="#C9739A" opacity=".35" stroke="none"/><circle cx="326" cy="290" r="16" fill="#C9739A" opacity=".35" stroke="none"/>`;
  if (emo === 'content') s += yeux() + joues + `<path d="M196 206 Q212 196 228 204 M284 204 Q300 196 316 206" fill="none" stroke-width="7"/><path d="M206 294 Q256 346 306 294 Q256 312 206 294 Z" fill="#7A2A1E"/>`;
  else if (emo === 'triste') s += yeux(12, 6) + `<path d="M194 222 Q212 206 230 208 M282 208 Q300 206 318 222" fill="none" stroke-width="7"/><path d="M220 316 Q256 290 292 316" fill="none" stroke-width="8"/><path d="M302 270 q10 20 0 30 q-10 -10 0 -30 z" fill="#8FB4C9" stroke-width="4"/>`;
  else if (emo === 'fache') s += yeux(10, 4) + `<path d="M190 214 L232 228 M322 214 L280 228" fill="none" stroke-width="9"/><path d="M218 312 Q256 296 294 312" fill="none" stroke-width="8"/><path d="M226 312 h60" stroke-width="5"/>`;
  else if (emo === 'peur') s += `<circle cx="212" cy="248" r="20" fill="#FFF8EA"/><circle cx="300" cy="248" r="20" fill="#FFF8EA"/><circle cx="212" cy="250" r="8" fill="${E}" stroke="none"/><circle cx="300" cy="250" r="8" fill="${E}" stroke="none"/><path d="M190 208 Q212 192 232 206 M280 206 Q300 192 322 208" fill="none" stroke-width="7"/><ellipse cx="256" cy="312" rx="20" ry="24" fill="#7A2A1E"/>`;
  else if (emo === 'neutre') s += yeux() + `<path d="M198 208 Q212 202 228 206 M284 206 Q300 202 314 208" fill="none" stroke-width="7"/><path d="M232 306 H280" fill="none" stroke-width="8"/>`;
  else s += yeux() + joues + `<path d="M198 208 Q212 200 228 206 M284 206 Q300 200 314 208" fill="none" stroke-width="7"/><path d="M220 298 Q256 326 292 298" fill="none" stroke-width="8"/>`; // sourire doux
  s += `<path d="M252 260 q-8 26 4 30" fill="none" stroke-width="6"/>`;
  return s + '</g>';
}

// ── Pictogrammes (512) ───────────────────────────────────────────────────
const disque = (c = '#F2E2BF') => `<circle cx="256" cy="256" r="236" fill="${c}" ${L()}/>`;
const PICTO = {
  // routine
  j_reveil: () => disque('#F7DC9A') + `<g ${L()}><circle cx="256" cy="210" r="70" fill="#DDA23B"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M256 110 v-34" transform="rotate(${a} 256 210)"/>`).join('')}<rect x="96" y="300" width="320" height="80" rx="20" fill="url(#wax1)"/><rect x="110" y="270" width="110" height="50" rx="22" fill="#FFF8EA"/><rect x="96" y="380" width="22" height="50" fill="#8A6E57"/><rect x="394" y="380" width="22" height="50" fill="#8A6E57"/></g>`,
  j_laver: () => disque('#CFE3EC') + `<g ${L()}><path d="M150 250 h212 l-24 180 h-164 z" fill="#9AA3A8"/><ellipse cx="256" cy="250" rx="106" ry="28" fill="#4D84A3"/><path d="M190 250 q30 -60 66 -110 q36 50 66 110" fill="none" stroke="#4D84A3" stroke-width="10"/>${[[200, 160], [312, 170], [256, 120]].map(([x, y]) => `<path d="M${x} ${y} q14 24 0 40 q-14 -16 0 -40z" fill="#8FB4C9" stroke-width="5"/>`).join('')}</g>`,
  j_habiller: () => disque('#F2E2BF') + `<g ${L()}><path d="M180 120 L120 170 L150 220 L178 200 L170 420 H342 L334 200 L362 220 L392 170 L332 120 Q256 160 180 120 Z" fill="url(#wax2)"/><path d="M226 128 Q256 170 286 128" fill="none"/></g>`,
  j_manger: () => disque('#F7DC9A') + `<g ${L()}><path d="M106 250 h300 q-20 150 -150 150 q-130 0 -150 -150 z" fill="#B4532E"/><path d="M120 250 q136 -70 272 0 z" fill="#F2E2BF"/>${[[200, 228], [250, 214], [300, 226], [230, 240], [280, 240]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#557A46" stroke-width="4"/>`).join('')}<path d="M360 150 l40 -50" stroke-width="12"/></g>`,
  j_ecole: () => disque('#E8CF9B') + `<g ${L()}><rect x="110" y="200" width="292" height="200" fill="#E5B86A"/><path d="M90 206 L256 110 L422 206 Z" fill="#B4532E"/><rect x="226" y="300" width="60" height="100" fill="#4D84A3"/><rect x="140" y="250" width="60" height="44" fill="#FFF8EA"/><rect x="312" y="250" width="60" height="44" fill="#FFF8EA"/><path d="M256 110 V60 h50 v26 h-50" fill="#557A46"/></g>`,
  j_jouer: () => disque('#DCE3C2') + `<g ${L()}><circle cx="256" cy="270" r="140" fill="#FFF8EA"/><path d="M256 222 l46 33 l-18 54 h-56 l-18 -54 z" fill="${E}"/><path d="M256 222 V132 M302 255 l84 -28 M284 309 l52 72 M228 309 l-52 72 M210 255 l-84 -28" fill="none" stroke-width="6"/><path d="M226 134 q30 -6 60 0 l-8 20 h-44 z M380 214 q16 26 12 58 l-20 -6 l-6 -40 z M132 214 q-16 26 -12 58 l20 -6 l6 -40 z M200 394 q28 18 56 18 v-22 l-40 -14 z M312 394 q-28 18 -56 18 v-22 l40 -14 z" fill="${E}" stroke-width="4"/></g>`,
  j_dormir: () => disque('#B9A9C9') + `<g ${L()}><path d="M330 110 a110 110 0 1 0 90 170 a90 90 0 0 1 -90 -170 z" fill="#F7DC9A"/><text x="150" y="190" font-family="Andika" font-weight="700" font-size="80" fill="${E}" stroke="none">z</text><text x="196" y="140" font-family="Andika" font-weight="700" font-size="56" fill="${E}" stroke="none">z</text></g>`,
  // objets à associer
  p_theiere: () => `<g ${L()}><path d="M150 430 L170 300 L342 300 L362 430 Z" fill="#555B61"/><rect x="130" y="420" width="252" height="34" rx="8" fill="#B4532E"/><path d="M180 300 q-6 -120 76 -126 q82 6 76 126 z" fill="#4D84A3"/><path d="M330 240 q80 -10 96 -86" fill="none" stroke-width="14"/><circle cx="256" cy="160" r="20" fill="#DDA23B"/><path d="M180 230 q-60 0 -60 50" fill="none" stroke-width="12"/></g>`,
  p_mouton: () => mouton(230, 360, 3.4),
  p_ballon: () => `<g ${L()}><circle cx="256" cy="270" r="170" fill="#FFF8EA"/><path d="M256 222 l46 33 l-18 54 h-56 l-18 -54 z" fill="${E}"/><path d="M256 222 V132 M302 255 l84 -28 M284 309 l52 72 M228 309 l-52 72 M210 255 l-84 -28" fill="none" stroke-width="6"/><path d="M226 134 q30 -6 60 0 l-8 20 h-44 z M380 214 q16 26 12 58 l-20 -6 l-6 -40 z M132 214 q-16 26 -12 58 l20 -6 l6 -40 z M200 394 q28 18 56 18 v-22 l-40 -14 z M312 394 q-28 18 -56 18 v-22 l40 -14 z" fill="${E}" stroke-width="4"/></g>`,
  p_car: () => `<g ${L()}><path d="M70 360 V200 Q70 150 130 150 H400 Q446 150 450 210 L456 360 Z" fill="#DDA23B"/><path d="M70 270 H456" stroke-width="10"/><rect x="100" y="180" width="70" height="60" fill="#8FB4C9"/><rect x="190" y="180" width="70" height="60" fill="#8FB4C9"/><rect x="280" y="180" width="70" height="60" fill="#8FB4C9"/><rect x="370" y="180" width="60" height="60" fill="#8FB4C9"/><path d="M90 300 h340" stroke="#4D84A3" stroke-width="16"/><circle cx="150" cy="370" r="40" fill="${E}"/><circle cx="380" cy="370" r="40" fill="${E}"/><circle cx="150" cy="370" r="14" fill="#9AA3A8"/><circle cx="380" cy="370" r="14" fill="#9AA3A8"/><path d="M200 150 q56 -50 112 0" fill="none"/></g>`,
  p_mangue: () => `<g ${L()}><path d="M256 110 C390 110 430 280 330 390 C250 470 120 420 120 300 C120 200 170 110 256 110 Z" fill="#DDA23B"/><path d="M256 110 C230 160 200 200 150 230" fill="none" stroke="#B4532E" stroke-width="6"/><path d="M256 110 q30 -50 90 -50 q-20 50 -90 50" fill="#557A46"/></g>`,
  p_poisson: () => `<g ${L()}><path d="M80 256 C160 140 320 140 390 256 C320 372 160 372 80 256 Z" fill="#4D84A3"/><path d="M390 256 L460 180 V332 Z" fill="#4D84A3"/><circle cx="150" cy="240" r="16" fill="#FFF8EA"/><circle cx="150" cy="240" r="6" fill="${E}" stroke="none"/><path d="M210 200 q30 56 0 112 M260 196 q30 60 0 120" fill="none" stroke-width="6"/></g>`,
  p_calebasse: () => `<g ${L()}><path d="M70 230 H442 C442 380 360 450 256 450 C152 450 70 380 70 230 Z" fill="#DDA23B"/><ellipse cx="256" cy="230" rx="186" ry="40" fill="#B4532E"/><path d="M110 300 Q256 340 402 300" fill="none" stroke-width="6"/><path d="M140 360 l20 -20 l20 20 l20 -20 l20 20 l20 -20 l20 20 l20 -20 l20 20 l20 -20 l20 20 l20 -20 l20 20" fill="none" stroke-width="5"/></g>`,
  p_tambour: () => `<g ${L()}><path d="M170 110 H342 L310 440 H202 Z" fill="#8A6E57"/><ellipse cx="256" cy="110" rx="86" ry="26" fill="#F2E2BF"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${180 + i * 30} 130 L${215 + i * 16} 300" fill="none" stroke-width="5"/>`).join('')}<path d="M206 300 H306" stroke-width="10"/><rect x="230" y="40" width="16" height="70" rx="6" fill="#DDA23B" transform="rotate(-25 238 75)"/></g>`,
  p_baobab: () => baobab(256, 480, 1.05),
  // tableau de communication
  c_oui: () => disque('#9DBB7E') + `<path d="M150 266 L226 340 L366 180" fill="none" ${L(40)}/><path d="M150 266 L226 340 L366 180" fill="none" stroke="#FFF8EA" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`,
  c_non: () => disque('#E5A08A') + `<path d="M170 170 L342 342 M342 170 L170 342" fill="none" ${L(40)}/><path d="M170 170 L342 342 M342 170 L170 342" stroke="#FFF8EA" stroke-width="22" stroke-linecap="round"/>`,
  c_faim: () => PICTO.j_manger(),
  c_soif: () => disque('#CFE3EC') + `<g ${L()}><path d="M180 130 H332 L310 420 H202 Z" fill="#FFF8EA"/><path d="M190 230 H322 L310 420 H202 Z" fill="#8FB4C9"/><path d="M290 110 L330 60" stroke-width="14"/></g>`,
  c_toilettes: () => disque('#E8CF9B') + `<g ${L()}><rect x="170" y="110" width="110" height="130" rx="14" fill="#FFF8EA"/><path d="M150 250 H360 Q360 340 290 350 V420 H210 V350 Q150 340 150 250 Z" fill="#FFF8EA"/><ellipse cx="255" cy="252" rx="100" ry="20" fill="#CFE3EC"/></g>`,
  c_mal: () => disque('#F2E2BF') + `<g ${L()}><path d="M150 420 C150 300 190 230 256 230 C322 230 362 300 362 420 Z" fill="url(#wax3)"/><circle cx="256" cy="160" r="70" fill="#6B3F25"/><path d="M226 186 q30 -18 60 0" fill="none" stroke-width="6"/><circle cx="232" cy="150" r="7" fill="${E}" stroke="none"/><circle cx="280" cy="150" r="7" fill="${E}" stroke="none"/><rect x="300" y="300" width="90" height="40" rx="16" fill="#FFF8EA" transform="rotate(-30 345 320)"/><path d="M330 300 l20 40 M352 290 l20 40" stroke-width="4" transform="rotate(-30 345 320)"/><path d="M400 210 l30 -30 M410 250 l40 -6" stroke="#B4532E" stroke-width="10"/></g>`,
  c_pause: () => disque('#DCE3C2') + `<g ${L()}><path d="M196 420 V230 Q196 210 214 210 Q232 210 232 230 V150 Q232 130 252 130 Q272 130 272 150 V140 Q272 120 292 120 Q312 120 312 140 V170 Q312 150 332 150 Q352 150 352 170 V330 Q352 420 270 420 Z M196 300 Q170 270 150 290 Q140 300 160 330 L196 380" fill="#7A4B2E"/></g>`,
  c_aide: () => disque('#F7DC9A') + personne({ x: 200, y: 430, s: 1.25, tenue: 'url(#wax1)', coiffe: 'foulard', bras: 'leve' }) + personne({ x: 340, y: 450, s: 0.85, tenue: 'url(#wax3)', coiffe: 'enfant', peau: '#6B3F25' }),
  c_jouer: () => PICTO.j_jouer(),
  c_fatigue: () => PICTO.j_dormir(),
  c_peur: () => disque('#B9A9C9') + tete({ qui: 'amadou', emo: 'peur' }).replace('<g ', '<g transform="translate(56 60) scale(.78)" '),
  c_bruit: () => disque('#E5A08A') + `<g ${L()}><path d="M120 210 h60 l70 -60 v212 l-70 -60 h-60 z" fill="#FFF8EA"/><path d="M300 190 q40 66 0 132 M340 150 q76 106 0 212 M380 120 q100 136 0 272" fill="none" stroke-width="14"/></g>`,
  // tuiles des activités
  t_emotions: () => disque('#F7DC9A') + tete({ qui: 'amadou', emo: 'content' }).replace('<g ', '<g transform="translate(56 60) scale(.78)" '),
  t_journee: () => PICTO.j_reveil(),
  t_pareil: () => disque('#DCE3C2') + `<g transform="translate(40 120) scale(.42)">${PICTO.p_mangue()}</g><g transform="translate(256 120) scale(.42)">${PICTO.p_mangue()}</g><path d="M200 400 h112" ${L(14)}/><path d="M200 420 h112" ${L(14)}/>`,
  t_parler: () => disque('#CFE3EC') + `<g ${L()}><path d="M90 130 H422 V330 H250 L170 400 V330 H90 Z" fill="#FFF8EA"/><rect x="130" y="170" width="70" height="70" rx="12" fill="#9DBB7E"/><rect x="220" y="170" width="70" height="70" rx="12" fill="#F7DC9A"/><rect x="310" y="170" width="70" height="70" rx="12" fill="#E5A08A"/></g>`,
  t_respirer: () => disque('#DCE3C2') + `<g transform="translate(256 256)" ${L()}>${[0, 72, 144, 216, 288].map((a) => `<path d="M0 0 C-50 -60 -44 -160 0 -190 C44 -160 50 -60 0 0Z" fill="#557A46" transform="rotate(${a})"/>`).join('')}<circle r="34" fill="#DDA23B"/></g>`,
  icone: () => `<rect width="512" height="512" rx="110" fill="#DDA23B"/><rect x="14" y="14" width="484" height="484" rx="98" fill="#F2E2BF" ${L(14)}/><path d="M40 380 Q256 330 472 380 V450 Q472 484 438 484 H74 Q40 484 40 450 Z" fill="#E2B977"/>` + baobab(256, 440, 0.82),
  // avatar de Xel (assistant) : une feuille de baobab qui sourit
  xel: () => disque('#9DBB7E') + `<g ${L()}><path d="M256 450 C120 380 110 190 256 80 C402 190 392 380 256 450 Z" fill="#557A46"/><path d="M256 440 V130" fill="none" stroke-width="6"/><circle cx="214" cy="250" r="16" fill="#FFF8EA"/><circle cx="298" cy="250" r="16" fill="#FFF8EA"/><circle cx="214" cy="252" r="7" fill="${E}" stroke="none"/><circle cx="298" cy="252" r="7" fill="${E}" stroke="none"/><path d="M214 310 Q256 344 298 310" fill="none" stroke-width="8"/></g>`,
};
// lieux du Pénc (icônes simples réutilisées)
['infini', 'lanterne', 'cadre', 'feuille', 'maisonI', 'carnet', 'langue', 'hp', 'pause'].forEach((k) => {
  PICTO['i_' + k] = () => `<g transform="scale(12.8)">${ic[k].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`;
});

// ── Fonds de scène (1600 × 900) ──────────────────────────────────────────
const cour = (contenu) => `<rect width="1600" height="900" fill="#F3D9A4"/>
 <rect x="0" y="60" width="1600" height="300" fill="#E5B86A" ${L(4)}/>
 ${[...Array(21)].map((_, i) => `<rect x="${i * 80}" y="48" width="80" height="18" fill="#D9A55B" ${L(4)}/>`).join('')}
 <g ${L(4)}><rect x="1260" y="120" width="140" height="240" fill="#4D84A3"/><rect x="1274" y="134" width="112" height="212" fill="none"/><circle cx="1368" cy="240" r="7" fill="#DDA23B"/></g>
 <g ${L(4)}><path d="M190 362 L206 140 L242 140 L258 362Z" fill="#8A6E57"/>${[[110, 100, 90], [230, 60, 100], [340, 104, 80], [40, 150, 70]].map(([a, b, r]) => `<ellipse cx="${a}" cy="${b}" rx="${r}" ry="${r * 0.7}" fill="#557A46"/>`).join('')}</g>
 <g ${L(3)}>${[[1100, 110], [1130, 136], [1160, 108], [1186, 150], [1090, 160]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="16" fill="#C9739A"/>`).join('')}<path d="M1050 362 C1076 280 1120 210 1166 140" fill="none" stroke-width="6"/></g>
 <rect x="0" y="360" width="1600" height="540" fill="#EAD2A0"/><path d="M0 360 H1600" ${L(4)}/>
 ${contenu}`;
const voitures = (x, y, s = 1) => ['#B4532E', '#4D84A3', '#DDA23B', '#557A46', '#B4532E', '#6C5A8C', '#4D84A3'].map((c, i) => `<g transform="translate(${x + i * 40 * s} ${y}) scale(${s})" ${L(3)}><rect x="-16" y="-12" width="32" height="16" rx="4" fill="${c}"/><circle cx="-8" cy="7" r="5" fill="${E}"/><circle cx="8" cy="7" r="5" fill="${E}"/></g>`).join('');
const FOND = {
  f_penc: () => `<rect width="1600" height="900" fill="#EFC98A"/><rect width="1600" height="380" fill="#F3D9A4"/>
   <path d="M0 320 Q400 260 800 300 T1600 290 V900 H0Z" fill="#E2B977" ${L(4)}/>
   <g ${L(4)}><path d="M750 590 C650 500 410 410 190 370 L150 410 C380 450 590 540 700 625Z" fill="#F2DDB0"/>
   <path d="M800 550 C830 470 920 380 1020 330 L1080 336 C980 400 890 490 875 562Z" fill="#F2DDB0"/>
   <path d="M875 590 C1000 510 1200 420 1425 375 L1462 415 C1240 462 1050 550 925 632Z" fill="#F2DDB0"/></g>
   ${maison(210, 375, 0.95)}<g ${L(4)}><rect x="50" y="312" width="88" height="63" fill="#D9A55B"/><rect x="288" y="328" width="75" height="47" fill="#D9A55B"/></g>
   <g transform="translate(1050 335)" ${L(4)}><ellipse cx="-60" cy="-40" rx="60" ry="36" fill="#557A46"/><ellipse cx="50" cy="-48" rx="66" ry="40" fill="#6A8F55"/><ellipse cx="0" cy="-70" rx="50" ry="32" fill="#557A46"/><rect x="-40" y="-30" width="80" height="34" fill="#DDA23B"/><path d="M-50 -30 L0 -58 L50 -30Z" fill="#B4532E"/></g>
   <g transform="translate(1390 375)" ${L(4)}>${[0, 1, 2].map((i) => `<g transform="translate(${i * 86 - 86} 0)"><rect x="-37" y="-58" width="74" height="58" fill="#E9D8B4"/><path d="M-46 -58 L0 -95 L46 -58Z" fill="${['url(#wax2)', 'url(#wax1)', 'url(#wax3)'][i]}"/><rect x="-30" y="-30" width="60" height="12" fill="#8A6E57"/>${[0, 1, 2].map((j) => `<circle cx="${j * 17 - 17}" cy="-38" r="6" fill="${['#B4532E', '#DDA23B', '#557A46'][j]}"/>`).join('')}</g>`).join('')}</g>
   <ellipse cx="800" cy="700" rx="410" ry="136" fill="#E8CF9B" ${L(4)}/>
   ${baobab(800, 700, 1.0)}${banc(590, 725, 1.25)}${banc(1010, 725, 1.25)}${banc(700, 812, 1.1)}${banc(910, 812, 1.1)}
   ${personne({ x: 550, y: 700, s: 0.6, tenue: '#E9E2D3', coiffe: 'kufi', assis: true, bras: 'genoux', peau: '#5E3A24' })}
   ${personne({ x: 1052, y: 700, s: 0.6, tenue: 'url(#wax4)', coiffe: 'foulard', assis: true, bras: 'genoux' })}
   <g ${L(4)} transform="translate(150 750)"><ellipse cx="0" cy="50" rx="138" ry="42" fill="#9DBB7E"/>${[[-75, 12], [-25, 0], [37, 10], [88, 25]].map(([a, b]) => `<path d="M${a} ${b + 38} q-18 -50 0 -70 q18 20 0 70z" fill="#557A46"/>`).join('')}</g>
   ${maison(1440, 800, 0.7, '#9BC0D3', '#B4532E')}`,
  f_cour: () => cour(`<rect x="420" y="430" width="560" height="190" fill="url(#natte)" ${L(4)} transform="skewX(-12)"/>
   ${personne({ x: 560, y: 540, s: 0.78, tenue: 'url(#wax3)', coiffe: 'enfant', assis: true, bras: 'genoux', peau: '#6B3F25' })}
   ${voitures(650, 548, 1.05)}
   ${personne({ x: 1180, y: 590, s: 1.05, tenue: 'url(#wax1)', coiffe: 'foulard', assis: true, bras: 'genoux' })}
   <g ${L(4)}><rect x="1120" y="592" width="120" height="22" fill="#8A6E57"/><rect x="1130" y="614" width="14" height="26" fill="#8A6E57"/><rect x="1216" y="614" width="14" height="26" fill="#8A6E57"/></g>
   ${theiere(1340, 640, 1.1)}${mouton(1480, 470, 0.95)}`),
  f_voisine: () => cour(`<rect x="420" y="430" width="560" height="190" fill="url(#natte)" ${L(4)} transform="skewX(-12)"/>
   ${personne({ x: 560, y: 540, s: 0.78, tenue: 'url(#wax3)', coiffe: 'enfant', assis: true, bras: 'genoux', peau: '#6B3F25' })}${voitures(650, 548, 1.05)}
   ${personne({ x: 1060, y: 640, s: 1.05, tenue: 'url(#wax1)', coiffe: 'foulard' })}
   ${personne({ x: 1300, y: 640, s: 1.05, tenue: 'url(#wax4)', coiffe: 'foulard', bras: 'leve', peau: '#6E4329' })}`),
  f_marche: () => `<rect width="1600" height="900" fill="#F3D9A4"/>
   <g ${L(4)}>${[0, 1, 2, 3, 4].map((i) => `<g transform="translate(${170 + i * 320} 380)"><rect x="-130" y="-150" width="260" height="150" fill="#E9D8B4"/><path d="M-150 -150 L0 -230 L150 -150Z" fill="${['url(#wax2)', 'url(#wax1)', 'url(#wax3)', 'url(#wax4)', 'url(#wax2)'][i]}"/><rect x="-110" y="-70" width="220" height="24" fill="#8A6E57"/>${[0, 1, 2, 3, 4].map((j) => `<circle cx="${j * 44 - 88}" cy="-84" r="14" fill="${['#B4532E', '#DDA23B', '#557A46', '#DDA23B', '#B4532E'][j]}"/>`).join('')}</g>`).join('')}</g>
   <rect x="0" y="380" width="1600" height="520" fill="#E2B977"/><path d="M0 380 H1600" ${L(4)}/>
   ${[[180, 560, '#E9E2D3', 'kufi'], [360, 540, 'url(#wax2)', 'foulard'], [1400, 560, 'url(#wax4)', 'foulard'], [1240, 540, '#4D84A3', 'kufi']].map(([x, y, t, c]) => personne({ x, y, s: 0.8, tenue: t, coiffe: c, peau: '#6E4329' })).join('')}
   <g ${L(4)} opacity=".9">${[[620, 200], [980, 180], [800, 140]].map(([x, y]) => `<path d="M${x} ${y} q30 -30 0 -60 M${x + 26} ${y + 6} q46 -46 0 -92" fill="none" stroke="#B4532E" stroke-width="7"/>`).join('')}</g>
   ${personne({ x: 820, y: 720, s: 1.15, tenue: 'url(#wax1)', coiffe: 'foulard' })}
   ${personne({ x: 690, y: 740, s: 0.75, tenue: 'url(#wax3)', coiffe: 'enfant', bras: 'leve', peau: '#6B3F25' })}`,
  f_centre: () => `<rect width="1600" height="900" fill="#DCE8EE"/>
   <rect x="0" y="0" width="1600" height="560" fill="#E6EFF3" ${L(4)}/><rect x="0" y="560" width="1600" height="340" fill="#CFDDE3"/>
   <g ${L(4)}><rect x="140" y="120" width="300" height="210" fill="#FFF8EA"/><path d="M170 300 l80 -110 l60 70 l40 -40 l60 80z" fill="#9DBB7E"/><circle cx="380" cy="170" r="22" fill="#DDA23B"/>
   <rect x="1180" y="100" width="260" height="380" fill="#9BC0D3"/><rect x="1200" y="120" width="220" height="340" fill="none"/>
   <rect x="520" y="520" width="560" height="40" fill="#8A6E57"/><rect x="540" y="560" width="24" height="200" fill="#8A6E57"/><rect x="1036" y="560" width="24" height="200" fill="#8A6E57"/>
   <rect x="620" y="470" width="120" height="50" rx="6" fill="#FFF8EA"/><path d="M640 486 h80 M640 502 h60" stroke-width="4"/></g>
   ${personne({ x: 900, y: 600, s: 1.1, tenue: '#FFF8EA', coiffe: 'foulard', peau: '#8A5636' })}
   ${personne({ x: 360, y: 760, s: 1.05, tenue: 'url(#wax1)', coiffe: 'foulard' })}
   ${personne({ x: 480, y: 780, s: 0.7, tenue: 'url(#wax3)', coiffe: 'enfant', peau: '#6B3F25' })}`,
  f_penc_fin: () => FOND.f_penc().replace('</svg>', '') + `${personne({ x: 690, y: 820, s: 0.62, tenue: 'url(#wax3)', coiffe: 'enfant', peau: '#6B3F25' })}${personne({ x: 900, y: 830, s: 0.6, tenue: 'url(#wax2)', coiffe: 'enfant', peau: '#7A4B2E' })}${personne({ x: 1000, y: 840, s: 0.58, tenue: 'url(#wax4)', coiffe: 'enfant', peau: '#5E3A24' })}${voitures(740, 850, 0.9)}`,
  f_chambre: () => `<rect width="1600" height="900" fill="#B9A9C9"/>
   <rect x="0" y="0" width="1600" height="590" fill="#CFC2D9" ${L(4)}/>
   <g ${L(4)}><rect x="1030" y="110" width="320" height="250" fill="#F6C98B"/><path d="M1030 110 h160 v250 h-160z" fill="#E9A85E"/><path d="M1190 110 V360"/>
   <rect x="1000" y="86" width="50" height="300" fill="url(#wax4)"/><rect x="1330" y="86" width="50" height="300" fill="url(#wax4)"/>
   <rect x="150" y="450" width="650" height="140" rx="14" fill="#8A6E57"/><rect x="175" y="400" width="600" height="76" rx="18" fill="url(#wax4)"/><rect x="186" y="376" width="150" height="54" rx="20" fill="#F2E2BF"/>
   <rect x="380" y="136" width="250" height="176" fill="#F2E2BF"/><path d="M400 290 l62 -76 l50 50 l38 -38 l50 64z" fill="#557A46"/><circle cx="575" cy="180" r="18" fill="#DDA23B"/>
   <g transform="translate(700 425)"><rect x="-20" y="-36" width="40" height="68" rx="8" fill="${E}"/><rect x="-14" y="-27" width="28" height="46" fill="#8FB4C9"/><circle cx="18" cy="-38" r="14" fill="#B4532E"/></g></g>
   ${personne({ x: 525, y: 470, s: 0.88, tenue: '#4D84A3', coiffe: 'kufi', assis: true, bras: 'genoux', peau: '#5E3A24', bouche: 'neutre' })}`,
  f_maam: () => cour(`<g ${L(4)}><rect x="560" y="150" width="380" height="160" fill="#8A6E57"/>${[0, 1, 2, 3].map((i) => `<rect x="${580 + i * 90}" y="170" width="70" height="90" fill="#FFF8EA"/><circle cx="${615 + i * 90}" cy="205" r="16" fill="#7A4B2E"/><path d="M${590 + i * 90} 255 q25 -26 50 0" fill="#557A46"/>`).join('')}</g>
   ${personne({ x: 820, y: 640, s: 1.05, tenue: '#E9E2D3', coiffe: 'gris', canne: true, peau: '#5E3A24' })}
   ${personne({ x: 1060, y: 640, s: 0.9, tenue: 'url(#wax2)', coiffe: 'foulard' })}
   ${theiere(1340, 640, 1.1)}`),
  f_jardin: () => `<rect width="1600" height="900" fill="#DCE3C2"/><path d="M0 590 Q400 540 800 575 T1600 560 V900 H0Z" fill="#9DBB7E" ${L(4)}/>
   ${[[100, 800, 1.2], [1500, 800, 1.3], [400, 850, 0.8], [1250, 860, 0.8]].map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})" ${L(4)}>${[-30, 0, 30].map((a, i) => `<path d="M${a} 0 q-18 -70 0 -110 q18 40 0 110z" fill="${i % 2 ? '#6A8F55' : '#557A46'}"/>`).join('')}</g>`).join('')}`,
  f_ressources: () => `<rect width="1600" height="900" fill="#E9D8B4"/><rect x="0" y="0" width="1600" height="640" fill="#F2E2BF" ${L(4)}/>
   <g ${L(4)}>${[0, 1, 2].map((r) => `<rect x="80" y="${120 + r * 160}" width="380" height="16" fill="#8A6E57"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${96 + i * 58}" y="${40 + r * 160}" width="44" height="80" fill="${['#B4532E', '#4D84A3', '#DDA23B', '#557A46', '#6C5A8C', '#B4532E'][i]}"/>`).join('')}`).join('')}
   <rect x="1180" y="90" width="320" height="420" fill="#9BC0D3"/><rect x="1200" y="110" width="280" height="380" fill="none"/></g>`,
};
