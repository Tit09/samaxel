'use strict';
/**
 * IA DE DÉTECTION D'ACCÈS ANORMAUX — mémoire, section 4.3.6.
 *
 * Chaque professionnel a une « habitude » apprise sur ses 30 derniers jours (journal d'audit) :
 * nombre de dossiers ouverts par heure et heures de travail habituelles. L'heure en cours est
 * comparée à cette habitude :
 *   • VOLUME_INHABITUEL  : lectures bien au-dessus de la moyenne (score z = (x − moyenne) / écart-type)
 *                          → exfiltration, compte volé, curiosité sur des dossiers sans lien de soin ;
 *   • HORAIRE_INHABITUEL : activité à une heure jamais ou presque jamais utilisée (ex. 3 h du matin) ;
 *   • REFUS_REPETES      : nombreux accès refusés (tentatives d'ouvrir des dossiers d'une autre structure) ;
 *   • NOUVELLE_ADRESSE_IP: connexion depuis une adresse jamais vue (signalement simple).
 * Sans historique suffisant (nouveau compte), des seuils fixes prudents s'appliquent.
 * L'IA ALERTE, elle ne bloque pas : l'administrateur décide (faux positif ou incident confirmé).
 */

const SEUILS = {
  zVolume: 3,          // 3 écarts-types au-dessus de l'habitude
  minLectures: 15,     // en dessous, jamais d'alerte de volume (bruit)
  lecturesSansHisto: 40, // compte sans historique : seuil fixe par heure
  partHeureRare: 0.02, // heure utilisée dans moins de 2 % des tranches d'activité
  minJoursHisto: 5,    // historique minimal pour juger l'horaire
  refus: 10,           // accès refusés dans l'heure
};

/**
 * @param {{lectures:number, refus:number, heure:number, ips_nouvelles:number, moyenne:number,
 *          ecart:number, jours_historique:number, part_heure:number}} p profil d'accès (compteurs)
 * @returns {{type:string, score:number, details:object}[]}
 */
function evaluer(p) {
  const alertes = [];
  const moyenne = Number(p.moyenne) || 0;
  const ecart = Math.max(Number(p.ecart) || 0, 1); // évite la division par zéro sur un historique très régulier
  const z = (p.lectures - moyenne) / ecart;
  const avecHisto = p.jours_historique >= SEUILS.minJoursHisto;

  if (p.lectures >= SEUILS.minLectures && ((avecHisto && z >= SEUILS.zVolume) || (!avecHisto && p.lectures >= SEUILS.lecturesSansHisto))) {
    alertes.push({ type: 'VOLUME_INHABITUEL', score: Math.round((avecHisto ? z : p.lectures) * 100) / 100,
      details: { lectures_heure: p.lectures, habitude_par_heure: Math.round(moyenne * 10) / 10, historique_jours: p.jours_historique } });
  }
  if (avecHisto && p.lectures > 0 && Number(p.part_heure) < SEUILS.partHeureRare) {
    alertes.push({ type: 'HORAIRE_INHABITUEL', score: Math.round((1 - Number(p.part_heure)) * 100) / 100,
      details: { heure: p.heure, part_habituelle: Number(p.part_heure) } });
  }
  if (p.refus >= SEUILS.refus) {
    alertes.push({ type: 'REFUS_REPETES', score: p.refus, details: { refus_heure: p.refus } });
  }
  if (avecHisto && p.ips_nouvelles > 0) {
    alertes.push({ type: 'NOUVELLE_ADRESSE_IP', score: p.ips_nouvelles, details: { adresses_nouvelles: p.ips_nouvelles } });
  }
  return alertes;
}

module.exports = { evaluer, SEUILS };
