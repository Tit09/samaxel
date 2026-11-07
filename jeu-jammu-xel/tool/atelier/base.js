const E='#22243A', P='#F2E2BF';
// ── Motifs (pagnes wax, natte) et texture papier ─────────────────────────
const defs=`<defs>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .13  0 0 0 0 .14  0 0 0 0 .23  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<pattern id="wax1" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#4D84A3"/><circle cx="11" cy="11" r="6" fill="#DDA23B" stroke="${E}" stroke-width="1.5"/><circle cx="11" cy="11" r="2" fill="${E}"/></pattern>
<pattern id="wax2" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#B4532E"/><path d="M0 10 L5 4 L10 10 L15 4 L20 10" fill="none" stroke="#F2E2BF" stroke-width="2"/><path d="M0 18 L5 12 L10 18 L15 12 L20 18" fill="none" stroke="${E}" stroke-width="1.5"/></pattern>
<pattern id="wax3" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#557A46"/><rect x="4" y="4" width="8" height="8" transform="rotate(45 8 8)" fill="#E8CF9B" stroke="${E}" stroke-width="1.2"/></pattern>
<pattern id="wax4" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#6C5A8C"/><circle cx="4" cy="4" r="2.4" fill="#F2E2BF"/><circle cx="13" cy="13" r="2.4" fill="#DDA23B"/></pattern>
<pattern id="natte" width="24" height="12" patternUnits="userSpaceOnUse"><rect width="24" height="12" fill="#E8CF9B"/><rect width="24" height="4" fill="#B4532E"/><rect y="8" width="24" height="2" fill="#557A46"/></pattern>
<pattern id="tole" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#9AA3A8"/><line x1="0" y1="0" x2="0" y2="10" stroke="${E}" stroke-width="1.4"/></pattern>
</defs>`;
const grain=`<rect width="1280" height="720" filter="url(#grain)" fill="#fff"/>`;

// ── Éléments dessinés (style sous-verre : contour à l'encre, aplats) ─────
const sw=3;
function baobab(x,y,s=1){const br=[[-40,-230,-150,-310],[-20,-240,-70,-370],[0,-240,5,-410],[25,-240,80,-360],[40,-230,155,-300]];
return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${E}" stroke-width="${sw/s}" stroke-linejoin="round" stroke-linecap="round">
 ${br.map(([a,b,c,d])=>`<path d="M${a} ${b} L${c} ${d}" stroke="${E}" stroke-width="${30}"/><path d="M${a} ${b} L${c} ${d}" stroke="#8A6E57" stroke-width="${30-2*sw/s}"/>`).join('')}
 <path d="M-78 0 C-66 -70 -58 -150 -56 -235 Q0 -258 56 -235 C58 -150 66 -70 78 0 Q0 10 -78 0Z" fill="#8A6E57"/>
 <path d="M-30 -40 C-24 -90 -26 -140 -20 -190 M24 -60 C20 -110 26 -150 20 -200" fill="none" stroke-width="${2/s}"/>
 ${[[-150,-305,62],[-70,-370,64],[5,-412,60],[80,-362,66],[155,-298,62],[-115,-345,40],[125,-340,42]].map(([a,b,r])=>`<ellipse cx="${a}" cy="${b}" rx="${r}" ry="${r*.6}" fill="#557A46"/>`).join('')}
 ${[[-80,-330],[-150,-275],[90,-325],[150,-270],[10,-375]].map(([a,b])=>`<path d="M${a} ${b} q6 14 0 26 q-6 -12 0 -26z" fill="#E8CF9B" stroke-width="${1.5/s}"/>`).join('')}
</g>`}
function personne(o){ // o: x,y,s,peau,tenue,coiffe('foulard'|'kufi'|'enfant'|'gris'),assis,canne,regard
 const {x,y,s=1,peau='#7A4B2E',tenue='url(#wax1)',coiffe='foulard',assis=false,canne=false,bras='bas',bouche='sourire'}=o;
 const corps=assis?`<path d="M-34 -120 C-40 -80 -48 -40 -54 0 L54 0 C48 -40 40 -80 34 -120 Q0 -134 -34 -120Z" fill="${tenue}"/>
   <path d="M-54 0 Q0 18 54 0 L64 26 Q0 40 -64 26Z" fill="${tenue}"/>`:
  `<path d="M-34 -120 C-44 -70 -52 -30 -58 30 L58 30 C52 -30 44 -70 34 -120 Q0 -134 -34 -120Z" fill="${tenue}"/>
   <rect x="-26" y="30" width="18" height="10" rx="4" fill="${E}"/><rect x="8" y="30" width="18" height="10" rx="4" fill="${E}"/>`;
 const brasD = bras==='bas'?`<path d="M-34 -112 Q-58 -70 -50 -20" fill="none" stroke="${tenue}" stroke-width="18" stroke-linecap="round"/><path d="M-34 -112 Q-58 -70 -50 -20" fill="none" stroke="${E}" stroke-width="${sw}" stroke-dasharray="0" opacity="0"/><circle cx="-50" cy="-16" r="8" fill="${peau}"/>
   <path d="M34 -112 Q58 -70 50 -20" fill="none" stroke="${tenue}" stroke-width="18" stroke-linecap="round"/><circle cx="50" cy="-16" r="8" fill="${peau}"/>`
  : bras==='genoux'?`<circle cx="-30" cy="-6" r="8" fill="${peau}"/><circle cx="30" cy="-6" r="8" fill="${peau}"/>`
  : `<path d="M34 -112 Q70 -110 86 -140" fill="none" stroke="${tenue}" stroke-width="18" stroke-linecap="round"/><circle cx="88" cy="-146" r="8" fill="${peau}"/><circle cx="-44" cy="-20" r="8" fill="${peau}"/>`;
 let tete=`<rect x="-9" y="-140" width="18" height="16" fill="${peau}"/><ellipse cx="0" cy="-168" rx="27" ry="31" fill="${peau}"/>
   <circle cx="-9" cy="-170" r="3" fill="${E}" stroke="none"/><circle cx="9" cy="-170" r="3" fill="${E}" stroke="none"/>${bouche==='sourire'?'<path d="M-8 -154 Q0 -148 8 -154" fill="none"/>':'<path d="M-7 -152 H7" fill="none"/>'}`;
 if(coiffe==='foulard') tete+=`<path d="M-30 -172 C-36 -214 36 -214 30 -172 C20 -186 -20 -186 -30 -172Z" fill="url(#wax2)"/><path d="M18 -202 q22 -18 30 4 q-16 -2 -24 10z" fill="url(#wax2)"/>`;
 if(coiffe==='gris') tete+=`<path d="M-30 -170 C-36 -214 36 -214 30 -170 C22 -184 -22 -184 -30 -170Z" fill="#E9E2D3"/><path d="M-12 -158 l-3 4 M12 -158 l3 4" fill="none" stroke-width="1.5"/>`;
 if(coiffe==='kufi') tete+=`<path d="M-26 -184 Q0 -214 26 -184 Z" fill="#F2E2BF"/>`;
 if(coiffe==='enfant') tete+=`<path d="M-26 -178 Q-24 -202 0 -201 Q24 -202 26 -178 Q14 -192 0 -190 Q-14 -192 -26 -178Z" fill="${E}"/>`;
 const c = canne?`<path d="M62 -60 L70 32 M62 -60 q-12 -6 -14 6" fill="none" stroke="#8A6E57" stroke-width="6" stroke-linecap="round"/>`:'';
 return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${E}" stroke-width="${sw/s}" stroke-linejoin="round" stroke-linecap="round">${c}${corps}${brasD}${tete}</g>`;
}
function maison(x,y,s=1,mur='#E5B86A',volet='#4D84A3'){return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${E}" stroke-width="${sw/s}" stroke-linejoin="round">
 <rect x="-110" y="-120" width="220" height="120" fill="${mur}"/>
 <path d="M-126 -118 L-100 -170 L100 -170 L126 -118Z" fill="url(#tole)"/>
 <rect x="-30" y="-78" width="44" height="78" fill="#8A6E57"/><circle cx="6" cy="-38" r="3" fill="${E}"/>
 <rect x="40" y="-90" width="44" height="40" fill="#F2E2BF"/><rect x="30" y="-90" width="10" height="40" fill="${volet}"/><rect x="84" y="-90" width="10" height="40" fill="${volet}"/>
 <rect x="-96" y="-90" width="44" height="40" fill="#F2E2BF"/><rect x="-106" y="-90" width="10" height="40" fill="${volet}"/><rect x="-52" y="-90" width="10" height="40" fill="${volet}"/>
</g>`}
function banc(x,y,s=1){return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${E}" stroke-width="${sw/s}"><rect x="-60" y="-26" width="120" height="12" rx="3" fill="#8A6E57"/><rect x="-52" y="-14" width="10" height="20" fill="#8A6E57"/><rect x="42" y="-14" width="10" height="20" fill="#8A6E57"/></g>`}
function mouton(x,y,s=1){return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${E}" stroke-width="${sw/s}" stroke-linejoin="round">
 <rect x="-30" y="-8" width="8" height="26" fill="${E}"/><rect x="22" y="-8" width="8" height="26" fill="${E}"/>
 <path d="M-46 -20 q-6 -30 20 -34 q10 -18 30 -8 q22 -10 32 10 q20 6 12 30 q-10 14 -40 12 q-40 6 -54 -10z" fill="#F7F1E3"/>
 <path d="M38 -40 q26 -6 30 16 q-4 18 -22 16 q-14 -4 -8 -32z" fill="#3B302A"/><path d="M50 -38 q-12 -16 -22 -2" fill="none" stroke-width="${5/s}"/><circle cx="58" cy="-26" r="2.5" fill="#F2E2BF" stroke="none"/>
</g>`}
function theiere(x,y,s=1){return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${E}" stroke-width="${sw/s}" stroke-linejoin="round">
 <path d="M-26 0 L-20 -26 L20 -26 L26 0Z" fill="#555B61"/><rect x="-30" y="-6" width="60" height="8" fill="#B4532E"/>
 <path d="M-16 -26 q-2 -26 16 -28 q18 2 16 28z" fill="#4D84A3"/><path d="M14 -40 q18 -4 22 -18" fill="none"/><circle cx="0" cy="-58" r="4" fill="#DDA23B"/>
 <path d="M-8 -66 q-6 -10 2 -18 M6 -66 q6 -10 -2 -20" fill="none" stroke-width="${2/s}" opacity=".6"/>
</g>`}
// Icônes (contour + aplat)
const ic={
 infini:`<svg viewBox="0 0 40 40"><path d="M20 20 C14 10 4 10 4 20 C4 30 14 30 20 20 C26 10 36 10 36 20 C36 30 26 30 20 20Z" fill="none" stroke="${E}" stroke-width="7"/><path d="M20 20 C14 10 4 10 4 20 C4 30 14 30 20 20 C26 10 36 10 36 20 C36 30 26 30 20 20Z" fill="none" stroke="#DDA23B" stroke-width="3.5"/></svg>`,
 lanterne:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M14 8 h12 l2 4 h-16z" fill="#8A6E57"/><path d="M12 12 h16 l2 18 h-20z" fill="#DDA23B"/><path d="M17 17 q3 -5 6 0 q2 5 -3 9 q-5 -4 -3 -9z" fill="#FFF8EA"/><rect x="9" y="30" width="22" height="5" rx="2" fill="#8A6E57"/><path d="M17 8 q3 -6 6 0" fill="none"/></svg>`,
 cadre:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><rect x="5" y="7" width="30" height="26" rx="3" fill="#B4532E"/><rect x="10" y="12" width="20" height="16" fill="#F2E2BF"/><circle cx="16" cy="19" r="3" fill="#7A4B2E"/><circle cx="24" cy="20" r="2.4" fill="#7A4B2E"/><path d="M11 28 q5 -7 10 0 q4 -5 8 0" fill="#557A46"/></svg>`,
 feuille:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M20 35 C6 26 6 10 20 4 C34 10 34 26 20 35Z" fill="#557A46"/><path d="M20 33 V9 M20 18 l-6 -4 M20 24 l7 -5" fill="none"/></svg>`,
 maisonI:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M5 18 L20 6 L35 18 V35 H5Z" fill="#4D84A3"/><circle cx="20" cy="17" r="2.4" fill="#FFF8EA"/><rect x="18" y="22" width="4" height="9" fill="#FFF8EA"/></svg>`,
 pause:`<svg viewBox="0 0 40 40"><rect x="10" y="8" width="7" height="24" rx="2" fill="${E}"/><rect x="23" y="8" width="7" height="24" rx="2" fill="${E}"/></svg>`,
 carnet:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><rect x="8" y="5" width="25" height="31" rx="3" fill="#B4532E"/><rect x="12" y="5" width="3" height="31" fill="${E}"/><rect x="18" y="12" width="11" height="7" fill="#F2E2BF"/></svg>`,
 langue:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M5 8 h20 v14 h-10 l-6 6 v-6 h-4z" fill="#DDA23B"/><path d="M17 18 h18 v13 h-4 v5 l-6 -5 h-8z" fill="#4D84A3"/></svg>`,
 hp:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.6" stroke-linejoin="round"><path d="M6 15 h7 l9 -8 v26 l-9 -8 h-7z" fill="#FFF8EA"/><path d="M27 13 q5 7 0 14 M31 9 q9 11 0 22" fill="none" stroke-linecap="round"/></svg>`,
 oeil:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4"><path d="M3 20 Q20 4 37 20 Q20 36 3 20Z" fill="#FFF8EA"/><circle cx="20" cy="20" r="7" fill="#4D84A3"/><circle cx="20" cy="20" r="3" fill="${E}"/></svg>`,
 coeur:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M20 34 C4 24 4 8 14 8 C18 8 20 12 20 12 C20 12 22 8 26 8 C36 8 36 24 20 34Z" fill="#B4532E"/></svg>`,
 sablier:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M10 5 h20 M10 35 h20 M12 5 q0 11 8 15 q-8 4 -8 15 M28 5 q0 11 -8 15 q8 4 8 15" fill="#E8CF9B"/><path d="M15 32 q5 -6 10 0z" fill="#DDA23B"/></svg>`,
 crayon:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><rect x="6" y="6" width="22" height="28" rx="2" fill="#FFF8EA"/><path d="M11 13 h12 M11 19 h12 M11 25 h7" /><path d="M24 30 l10 -16 l4 3 l-10 16 l-5 2z" fill="#DDA23B"/></svg>`,
 loupe:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.6"><circle cx="17" cy="17" r="10" fill="#FFF8EA"/><path d="M25 25 l10 10" stroke-width="5" stroke-linecap="round"/></svg>`,
 oreille:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><circle cx="20" cy="20" r="12" fill="#7A4B2E"/><rect x="4" y="13" width="7" height="14" rx="3" fill="#DDA23B"/><rect x="29" y="13" width="7" height="14" rx="3" fill="#DDA23B"/><path d="M6 13 Q20 -2 34 13" fill="none" stroke-width="3"/></svg>`,
 voitures:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2"><rect x="2" y="16" width="10" height="7" rx="2" fill="#B4532E"/><rect x="15" y="16" width="10" height="7" rx="2" fill="#4D84A3"/><rect x="28" y="16" width="10" height="7" rx="2" fill="#DDA23B"/><path d="M2 28 h36" stroke-dasharray="3 3"/></svg>`,
 bulle:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M5 8 h30 v18 h-16 l-8 7 v-7 h-6z" fill="#FFF8EA"/><path d="M12 15 h4 M19 15 h4 M26 15 h2" stroke-width="3" stroke-linecap="round"/></svg>`,
 carte:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><path d="M20 36 C10 24 8 18 8 14 a12 12 0 0 1 24 0 c0 4 -2 10 -12 22z" fill="#B4532E"/><circle cx="20" cy="14" r="4.5" fill="#FFF8EA"/></svg>`,
 telephone:`<svg viewBox="0 0 40 40" stroke="${E}" stroke-width="2.4" stroke-linejoin="round"><rect x="11" y="4" width="18" height="32" rx="4" fill="#4D84A3"/><rect x="14" y="9" width="12" height="20" fill="#FFF8EA"/><circle cx="20" cy="32" r="1.6" fill="${E}"/></svg>`,
};

