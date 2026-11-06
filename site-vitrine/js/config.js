/* Configuration du site — seule chose à changer au déploiement.
   Le site n'a pas de base de données : il lit l'API publique de SAMA XHEL Santé.

   • Site servi par le serveur SAMA XHEL lui-même (PC de test ou serveur en ligne) :
     l'API est à la même adresse → « /api ».
   • Fichier ouvert par double-clic (file://) : l'API tourne sur ce même ordinateur, port 3001. */
(function () {
  const local = location.protocol === 'file:' || !location.hostname;
  // Servi par le serveur SAMA XHEL (port 3001, tunnel HTTPS ou domaine) : même adresse. Serveurs de test statiques : port 3001 à côté.
  const memeServeur = !local && !['5500', '8080', '8090'].includes(location.port);
  window.SAMA_CONFIG = {
    API: local ? 'http://localhost:3001/api'
      : memeServeur ? `${location.origin}/api`
        : `${location.protocol}//${location.hostname}:3001/api`,
    // Fichiers servis par le serveur SAMA XHEL (dossier backend/public/telechargements)
    LIEN_APK: `${local ? 'http://localhost:3001' : memeServeur ? '' : `${location.protocol}//${location.hostname}:3001`}/telechargements/SAMA-XHEL-Sante.apk`,
    // Dons : lien marchand Wave Business, numéro de l'agent Orange Money
    LIEN_WAVE: 'https://pay.wave.com/m/M_sn_GUIRN49SXtRv/c/sn/',
    NUMERO_OM: '+221774702157',
    LIEN_APK_ANCIEN: `${local ? 'http://localhost:3001' : memeServeur ? '' : `${location.protocol}//${location.hostname}:3001`}/telechargements/SAMA-XHEL-Sante-32bits.apk`,
  };
}());
