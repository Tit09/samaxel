'use strict';
/**
 * Toutes les routes de l'API Santé, avec leurs schémas de validation et leurs droits.
 * Lecture rapide : [rôles autorisés] MÉTHODE /chemin → contrôleur
 */
const express = require('express');
const {
  z, uuid, telephone, email, password, langue, identifier, code6, texte, trouble, pagination,
} = require('../utils/schemas');
const { validate } = require('../middlewares/validate');
const { verifyToken, optionalToken, checkRole, ROLES_PRO, ROLES_CLINIQUES } = require('../middlewares/auth');
const { authLimiter, vocalLimiter } = require('../middlewares/rateLimiter');
const { audit } = require('../middlewares/audit');

const auth = require('../controllers/auth.controller');
const structures = require('../controllers/structures.controller');
const enfants = require('../controllers/enfants.controller');
const dep = require('../controllers/depistages.controller');
const suivis = require('../controllers/suivis.controller');
const rdv = require('../controllers/rdv.controller');
const cons = require('../controllers/consultations.controller');
const tele = require('../controllers/teleconsultation.controller');
const msg = require('../controllers/messages.controller');
const divers = require('../controllers/divers.controller');
const admin = require('../controllers/admin.controller');
const dons = require('../controllers/dons.controller');
const fhir = require('../controllers/fhir.controller');
const vocaux = require('../controllers/vocaux.controller');
const cand = require('../controllers/candidatures.controller');
const pharma = require('../controllers/pharmacies.controller');
const ussd = require('../controllers/ussd.controller');
const commu = require('../controllers/communaute.controller');
const portails = require('../controllers/portails.controller');
const caisse = require('../controllers/caisse.controller');
const voix = require('../controllers/voix.controller');
const canaux = require('../controllers/canaux.controller');
const invit = require('../controllers/invitations.controller');

const r = express.Router();
const id = { params: z.object({ id: uuid }) };
const PARENT = checkRole('PARENT');
const PRO = checkRole(ROLES_PRO);
const CLINIQUE = checkRole(ROLES_CLINIQUES);
const ADMIN_S = checkRole('ADMIN_STRUCTURE');
const SUPER = checkRole('SUPER_ADMIN');
const date = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'date invalide');
const dateNaissance = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format AAAA-MM-JJ');
const reponses = z.record(z.string(), z.number().int().min(0).max(3));
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const TYPES_STRUCTURE = ['HOPITAL', 'CENTRE_SANTE', 'CENTRE_SPECIALISE', 'ECOLE_INCLUSIVE', 'ECOLE_SPECIALISEE', 'CABINET', 'ASSOCIATION', 'CENTRE_ADDICTOLOGIE', 'CLINIQUE', 'EHPAD'];

// ═══ Authentification ═════════════════════════════════════════════════════
r.post('/auth/register', authLimiter, validate({ body: z.object({
  prenom: texte(80).min(1), nom: texte(80).min(1),
  telephone, email: email.optional(), password,
  langue: langue.default('fr'), region: texte(60).optional(),
  canal_verification: z.enum(['sms', 'email']).optional(),
  capacite_paiement: z.number().int().min(0).max(3).optional(),
  famille_vulnerable: z.boolean().optional(),
  profil_besoins: z.object({
    comportements: texte(2000).optional(),
    symptomes: z.array(texte(80)).max(30).optional(),
    deja_consulte: z.boolean().optional(),
    specialiste: texte(200).optional(),
    diagnostic: texte(200).optional(),
  }).optional(),
  consentements: z.object({ cgu: z.boolean(), donnees_sante: z.boolean(), ia_analyse: z.boolean().optional() }),
}) }), auth.register);

r.post('/auth/register-professionnel', authLimiter, validate({ body: z.object({
  prenom: texte(80).min(1), nom: texte(80).min(1), email, telephone, password,
  structure_id: uuid, role: z.enum(['MEDECIN', 'THERAPEUTE', 'SECRETAIRE']),
  specialite: texte(120).min(2), numero_ordre: texte(60).optional(),
  mode_exercice: z.enum(['PUBLIC', 'PRIVE', 'ASSOCIATIF', 'MIXTE']).default('PUBLIC'),
  langues_parlees: z.array(langue).min(1).default(['fr']),
  teleconsultation: z.boolean().default(false), region: texte(60).optional(),
}) }), auth.registerProfessionnel);

r.post('/auth/verify', authLimiter, validate({ body: z.object({ identifier, code: code6 }) }), auth.verifyAccount);
r.post('/auth/resend-code', authLimiter, validate({ body: z.object({
  identifier, purpose: z.enum(['verification', 'reset']), canal: z.enum(['sms', 'email']).optional(),
}) }), auth.resendCode);
r.post('/auth/login', authLimiter, validate({ body: z.object({
  identifier, password: z.string().min(1).max(128), structure_id: uuid.optional(),
  portail: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/).optional(),
}) }), auth.login);
r.post('/auth/candidature/statut', authLimiter, validate({ body: z.object({ identifier, password: z.string().min(1).max(128) }) }), auth.statutCandidature);

// Invitations du personnel réel d'un établissement
const jetonInv = { params: z.object({ jeton: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }) };
r.post('/etablissement/invitations', verifyToken, checkRole('ADMIN_STRUCTURE', 'SUPER_ADMIN'), validate({ body: z.object({
  role: z.enum(['MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE']),
  destinataire: z.union([telephone, email]), service_code: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  structure_id: uuid.optional(),
}) }), audit('CREATE', 'invitation'), invit.creer);
r.get('/etablissement/invitations', verifyToken, ADMIN_S, invit.enCours);
r.get('/invitations/:jeton', authLimiter, validate(jetonInv), invit.lire);
r.post('/invitations/:jeton/accepter', authLimiter, validate({ ...jetonInv, body: z.object({
  prenom: texte(80).min(1), nom: texte(80).min(1), password, telephone: telephone.optional(), email: email.optional(),
  numero_ordre: texte(40).optional(),
}) }), invit.accepter);
r.post('/auth/mfa/verify', authLimiter, validate({ body: z.object({ mfa_token: z.string().min(10), code: code6 }) }), auth.verifyMfa);
r.post('/auth/refresh', validate({ body: z.object({ refresh_token: z.string().min(20).max(200) }) }), auth.refresh);
r.post('/auth/password/reset', authLimiter, validate({ body: z.object({
  identifier, code: code6, nouveau_mot_de_passe: password,
}) }), auth.resetPassword);
r.post('/auth/logout', verifyToken, validate({ body: z.object({ refresh_token: z.string().optional() }) }), auth.logout);
r.get('/auth/me', verifyToken, auth.me);
r.post('/auth/switch-structure', verifyToken, PRO, validate({ body: z.object({ structure_id: uuid }) }), auth.switchStructure);
r.put('/auth/password', verifyToken, validate({ body: z.object({ ancien: z.string().min(1), nouveau: password }) }), auth.changePassword);

// ═══ Profil, consentements, notifications ═════════════════════════════════
r.get('/users/me', verifyToken, divers.monProfil);
r.put('/users/me', verifyToken, validate({ body: z.object({
  nom: texte(80).min(1).optional(), prenom: texte(80).min(1).optional(), email: email.optional().or(z.literal('')),
  langue: langue.optional(), region: texte(60).optional(), photo_url: z.string().url().max(500).optional(),
  teleconsultation: z.boolean().optional(), langues_parlees: z.array(langue).optional(),
  capacite_paiement: z.number().int().min(0).max(3).optional(),
}) }), divers.modifierProfil);
r.get('/users/me/export', verifyToken, PARENT, audit('EXPORT', 'donnees_personnelles'), divers.exporterMesDonnees);
r.put('/users/me/public-key', verifyToken, validate({ body: z.object({
  public_key: z.string().regex(/^[A-Za-z0-9+/=_-]{40,100}$/, 'clé publique invalide'),
}) }), msg.publierCle);
r.get('/users/:id/public-key', verifyToken, validate(id), msg.lireCle);

r.get('/consentements', verifyToken, PARENT, divers.listerConsentements);
r.post('/consentements', verifyToken, PARENT, validate({ body: z.object({
  type: z.enum(['CGU', 'DONNEES_SANTE', 'PARTAGE_STRUCTURE', 'TELECONSULTATION', 'IA_ANALYSE']),
  accepte: z.boolean(), enfant_id: uuid.optional(),
}) }), divers.donnerConsentement);

r.get('/notifications', verifyToken, divers.listerNotifications);
r.put('/notifications/lues', verifyToken, divers.toutLire);
r.put('/notifications/:id/lue', verifyToken, validate(id), divers.lireNotification);
r.post('/appareils', verifyToken, validate({ body: z.object({
  token: z.string().min(10).max(400), plateforme: z.enum(['android', 'ios', 'web', 'macos', 'windows', 'linux']),
}) }), divers.enregistrerAppareil);

// ═══ Annuaire, questionnaires, orientation (publics : site vitrine) ═══════
r.get('/structures', validate({ query: z.object({
  q: texte(80).optional(), region: texte(60).optional(), type: z.enum(TYPES_STRUCTURE).optional(),
  secteur: z.enum(['PUBLIC', 'PRIVE', 'ASSOCIATIF', 'CONFESSIONNEL']).optional(),
  trouble: trouble.optional(), service: texte(40).optional(),
  partenaire: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  public: z.enum(['ENFANT', 'ADULTE', 'PERSONNE_AGEE']).optional(),
  age_mois: z.coerce.number().int().min(0).max(1200).optional(),
  lat: lat.optional(), lng: lng.optional(), rayon_km: z.coerce.number().positive().max(1000).optional(),
  ...pagination, limit: z.coerce.number().int().min(1).max(500).default(100),
}) }), structures.rechercher);
r.get('/structures/meta', structures.meta);
r.get('/structures/:id', validate(id), structures.detail);
r.get('/structures/:id/professionnels', verifyToken, validate(id), structures.professionnels);

// ═══ Notifications hors application : Telegram, WhatsApp, SMS, e-mail ═══
const CANAUX = ['TELEGRAM', 'WHATSAPP', 'SMS', 'EMAIL'];
r.get('/moi/canaux', verifyToken, canaux.etat);
r.put('/moi/canaux', verifyToken, validate({ body: z.object({
  whatsapp_accepte: z.boolean().optional(),
  canaux_preferes: z.array(z.enum(CANAUX)).max(4).refine((a) => new Set(a).size === a.length, 'canal en double').optional(),
}) }), canaux.modifier);
r.post('/moi/telegram', verifyToken, authLimiter, canaux.lienTelegram);
r.delete('/moi/telegram', verifyToken, canaux.delierTelegram);
r.post('/moi/canaux/test', verifyToken, authLimiter, validate({ body: z.object({ canal: z.enum(CANAUX).optional() }) }), canaux.tester);
r.post('/telegram/webhook', canaux.webhookTelegram);

// ═══ Portails des établissements (multi-tenant) ═══════════════════════════
const codePortail = { params: z.object({ code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'code d’établissement invalide') }) };
const PUBLICS = ['ENFANT', 'ADULTE', 'PERSONNE_AGEE'];
r.get('/portails', validate({ query: z.object({
  q: texte(80).optional(), region: texte(60).optional(), public: z.enum(PUBLICS).optional(),
  trouble: trouble.optional(), parent: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  en_ligne: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  lat: lat.optional(), lng: lng.optional(),
  ...pagination, limit: z.coerce.number().int().min(1).max(200).default(50),
}) }), portails.lister);
r.get('/portails/:code', validate(codePortail), portails.portail);
r.post('/portails/:code/inscription', verifyToken, PARENT, validate({ ...codePortail, body: z.object({
  personne_id: uuid.optional(), service_code: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(), motif: texte(1000).optional(),
  origine: z.enum(['PORTAIL', 'QR_CODE', 'ORIENTATION', 'ACCUEIL']).default('PORTAIL'),
}) }), audit('CREATE', 'inscription'), portails.inscrire);
r.get('/moi/etablissements', verifyToken, PARENT, portails.mesEtablissements);
r.get('/inscriptions', verifyToken, PRO, validate({ query: z.object({
  statut: z.enum(['DEMANDEE', 'ACTIVE', 'REFUSEE', 'CLOTUREE']).optional(),
}) }), portails.listerInscriptions);
r.put('/inscriptions/:id', verifyToken, checkRole('SECRETAIRE', 'ADMIN_STRUCTURE', 'MEDECIN'), validate({ ...id, body: z.object({
  statut: z.enum(['ACTIVE', 'REFUSEE', 'CLOTUREE']), referent_id: uuid.optional(),
}) }), audit('UPDATE', 'inscription'), portails.traiterInscription);
r.get('/moi/etablissements/:code', verifyToken, PARENT, validate(codePortail), portails.maison);
r.get('/etablissement/soignants', verifyToken, PRO, portails.soignantsEtablissement);

// ═══ Studio des voix (guide vocal en langues nationales, voix de locuteurs natifs) ═══
r.get('/voix/catalogue', voix.catalogue);
const audioVoix = express.raw({ type: 'audio/*', limit: '3mb' });
r.post('/admin/voix/:langue/:cle', verifyToken, checkRole('SUPER_ADMIN'), audioVoix, audit('UPDATE', 'voix'), voix.enregistrer);
r.delete('/admin/voix/:langue/:cle', verifyToken, checkRole('SUPER_ADMIN'), audit('DELETE', 'voix'), voix.supprimer);

// ═══ Caisse, tickets, file d'attente (entrée de l'hôpital) ═════════════════
const CAISSE = checkRole('SECRETAIRE', 'ADMIN_STRUCTURE');
const MODE_PAIEMENT = z.enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'GRATUIT']);
const reference = z.string().trim().max(60).regex(/^[\w\-\s.#/]*$/, 'référence invalide');
r.get('/portails/:code/tarifs', validate(codePortail), caisse.tarifsPublics);
r.get('/portails/:code/file', validate(codePortail), caisse.filePublique);
r.post('/moi/tickets', verifyToken, PARENT, validate({ body: z.object({
  etablissement: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/), tarif_id: uuid, personne_id: uuid,
  mode_paiement: z.enum(['WAVE', 'ORANGE_MONEY']), reference: reference.min(4, 'indiquez la référence de la transaction'),
  rdv_id: uuid.optional(),
}) }), audit('CREATE', 'ticket'), caisse.acheterEnLigne);
r.get('/moi/tickets', verifyToken, PARENT, validate({ query: z.object({
  etablissement: z.string().regex(/^[a-z0-9-]{2,40}$/).optional() }) }), caisse.mesTickets);
r.get('/caisse/tickets', verifyToken, PRO, validate({ query: z.object({ jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }) }), caisse.journal);
r.post('/caisse/tickets', verifyToken, CAISSE, validate({ body: z.object({
  tarif_id: uuid, mode_paiement: MODE_PAIEMENT, reference: reference.optional(),
  personne_id: uuid.optional(), registre_id: uuid.optional(),
  patient: z.object({
    prenom: texte(60), nom: texte(60), telephone: telephone.optional(),
    date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), sexe: z.enum(['M', 'F']).optional(),
  }).optional(),
}) }), audit('CREATE', 'ticket'), caisse.encaisser);
r.put('/caisse/tickets/:id', verifyToken, PRO, validate({ ...id, body: z.object({
  action: z.enum(['CONFIRMER', 'REFUSER', 'ANNULER', 'APPELER', 'RECEVOIR', 'TERMINER']), bureau: texte(40).optional(),
}) }), audit('UPDATE', 'ticket'), caisse.modifierTicket);
r.post('/caisse/appeler', verifyToken, PRO, validate({ body: z.object({
  bureau: texte(40), prefixe: z.string().regex(/^[A-Z]{1,2}$/).optional() }) }), audit('UPDATE', 'ticket'), caisse.appelerSuivant);
r.get('/caisse/registre', verifyToken, PRO, validate({ query: z.object({ q: texte(80).optional() }) }), audit('LECTURE', 'registre'), caisse.registre);
const excelBrut = express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/octet-stream'], limit: '8mb' });
r.post('/caisse/registre/import', verifyToken, CAISSE, excelBrut, audit('IMPORT', 'registre'), caisse.importer);
r.get('/caisse/export', verifyToken, CAISSE, validate({ query: z.object({ jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }) }), audit('EXPORT', 'caisse'), caisse.exporter);
r.get('/etablissement/tarifs', verifyToken, PRO, caisse.listerTarifs);
r.post('/etablissement/tarifs', verifyToken, ADMIN_S, validate({ body: z.object({
  code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/), libelle: texte(80), montant: z.number().int().min(0).max(10000000),
  orientation: texte(120).optional(), prefixe: z.string().regex(/^[A-Z]{1,2}$/).optional(),
  en_ligne: z.boolean().optional(), actif: z.boolean().optional(),
}) }), audit('UPDATE', 'tarif'), caisse.enregistrerTarif);

r.post('/orientation', optionalToken, validate({ body: z.object({
  troubles: z.array(trouble).max(14).optional(), services: z.array(texte(40)).max(15).optional(),
  age_mois: z.number().int().min(0).max(1200).optional(), enfant_id: uuid.optional(),
  lat: lat.optional(), lng: lng.optional(), region: texte(60).optional(),
  budget: z.number().int().min(0).max(3).optional(), langue: langue.optional(),
  ecole: z.boolean().optional(), diagnostic_pose: z.boolean().optional(),
  limite: z.number().int().min(1).max(30).optional(),
}) }), structures.orientation);

r.get('/questionnaires', validate({ query: z.object({ age_mois: z.coerce.number().int().min(0).max(1200).optional() }) }), dep.lister);
r.get('/questionnaires/:code', validate({ params: z.object({ code: z.string().regex(/^[A-Za-z]{2,12}$/) }) }), dep.detail);
r.post('/questionnaires/:code/evaluer', validate({
  params: z.object({ code: z.string().regex(/^[A-Za-z]{2,12}$/) }),
  body: z.object({
    reponses, age_mois: z.number().int().min(0).max(1200).optional(),
    lat: lat.optional(), lng: lng.optional(), region: texte(60).optional(), langue: langue.optional(),
  }),
}), dep.evaluerAnonyme);

// ═══ Enfants ══════════════════════════════════════════════════════════════
const enfantBody = {
  prenom: texte(80).min(1), nom: texte(80).min(1), date_naissance: dateNaissance,
  sexe: z.enum(['M', 'F']), region: texte(60).optional(),
  langue_maison: langue.default('wo'), scolarise: z.boolean().default(false),
  // Personne suivie : l'utilisateur lui-même, son enfant, un parent âgé ou un proche
  lien: z.enum(['SOI', 'ENFANT', 'PARENT_AGE', 'PROCHE']).default('ENFANT'),
};
r.post('/enfants', verifyToken, PARENT, validate({ body: z.object(enfantBody) }), enfants.creer);
r.get('/enfants', verifyToken, enfants.lister);
r.get('/enfants/:id', verifyToken, validate(id), audit('LECTURE', 'enfant'), enfants.detail);
r.put('/enfants/:id', verifyToken, PARENT, validate({ ...id, body: z.object(enfantBody).partial() }), enfants.modifier);
r.delete('/enfants/:id', verifyToken, PARENT, validate(id), enfants.archiver);

// ═══ Dépistages (questionnaires remplis par le parent) ════════════════════
r.post('/depistages', verifyToken, PARENT, validate({ body: z.object({
  questionnaire_code: z.string().regex(/^[A-Za-z]{2,12}$/), enfant_id: uuid.optional(), reponses,
  lat: lat.optional(), lng: lng.optional(), budget: z.number().int().min(0).max(3).optional(),
}) }), dep.soumettre);
r.get('/depistages', verifyToken, validate({ query: z.object({ enfant_id: uuid.optional() }) }), dep.historique);
r.get('/depistages/:id', verifyToken, validate(id), audit('LECTURE', 'depistage'), dep.lire);

// ═══ Dossiers (suivis) et file triée par l'IA ═════════════════════════════
r.post('/suivis', verifyToken, PARENT, validate({ body: z.object({
  enfant_id: uuid, structure_id: uuid, motif: texte(1000).optional(), depistage_id: uuid.optional(),
}) }), suivis.demander);
r.get('/suivis', verifyToken, validate({ query: z.object({
  statut: z.enum(['DEMANDE', 'ACTIF', 'REFUSE', 'CLOS', 'ARCHIVE']).optional(),
  priorite: z.enum(['URGENT', 'PRIORITAIRE', 'NORMAL']).optional(),
}) }), audit('LISTE', 'suivis'), suivis.lister);
r.get('/suivis/:id', verifyToken, validate(id), audit('LECTURE', 'suivi'), suivis.detail);
r.put('/suivis/:id', verifyToken, checkRole('MEDECIN', 'ADMIN_STRUCTURE'), validate({ ...id, body: z.object({
  statut: z.enum(['ACTIF', 'REFUSE', 'CLOS', 'ARCHIVE']).optional(),
  referent_id: uuid.nullable().optional(),
  priorite: z.enum(['URGENT', 'PRIORITAIRE', 'NORMAL']).optional(),
  justification: texte(300).optional(),
}) }), audit('MODIFICATION', 'suivi'), suivis.decider);
r.post('/suivis/:id/recalculer', verifyToken, PRO, validate(id), suivis.recalculer);

// ═══ Rendez-vous ══════════════════════════════════════════════════════════
r.post('/rendez-vous', verifyToken, checkRole('PARENT', ...ROLES_PRO), validate({ body: z.object({
  enfant_id: uuid, structure_id: uuid.optional(), professionnel_id: uuid.optional(),
  type: z.enum(['PRESENTIEL', 'TELECONSULTATION']).default('PRESENTIEL'),
  motif: texte(1000).optional(), date_souhaitee: date.optional(), date_confirmee: date.optional(),
  duree_min: z.number().int().min(10).max(240).optional(),
}) }), rdv.creer);
r.get('/rendez-vous', verifyToken, validate({ query: z.object({
  statut: z.enum(['DEMANDE', 'CONFIRME', 'ANNULE', 'TERMINE', 'ABSENT']).optional(),
  du: date.optional(), au: date.optional(), enfant_id: uuid.optional(),
}) }), rdv.lister);
r.put('/rendez-vous/:id', verifyToken, checkRole('PARENT', ...ROLES_PRO), validate({ ...id, body: z.object({
  statut: z.enum(['CONFIRME', 'ANNULE', 'TERMINE', 'ABSENT']).optional(),
  date_confirmee: date.optional(), professionnel_id: uuid.optional(),
  duree_min: z.number().int().min(10).max(240).optional(), raison: texte(300).optional(),
}) }), rdv.modifier);

// ═══ Consultations (secret médical) ═══════════════════════════════════════
const consBody = {
  enfant_id: uuid, rdv_id: uuid.optional(), type: z.enum(['PRESENTIEL', 'TELECONSULTATION']).default('PRESENTIEL'),
  date_consultation: date.optional(), motif: texte(2000).optional(), observations: texte(10000).optional(),
  recommandations: texte(5000).optional(), diagnostic_code: z.string().regex(/^[0-9A-Z]{2,8}(\.[0-9A-Z]{1,4})?$/).optional(),
  visible_parent: z.boolean().default(true),
  statut: z.enum(['PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE']).optional(),
};
r.post('/consultations', verifyToken, CLINIQUE, validate({ body: z.object(consBody) }), audit('CREATION', 'consultation'), cons.creer);
r.get('/consultations', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES), validate({ query: z.object({
  enfant_id: uuid.optional(), statut: z.enum(['PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE']).optional(),
}) }), audit('LISTE', 'consultations'), cons.lister);
r.get('/consultations/:id', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES), validate(id), audit('LECTURE', 'consultation'), cons.detail);
r.put('/consultations/:id', verifyToken, CLINIQUE, validate({ ...id, body: z.object(consBody).omit({ enfant_id: true, rdv_id: true, type: true }).partial() }),
  audit('MODIFICATION', 'consultation'), cons.modifier);
r.delete('/consultations/:id', verifyToken, CLINIQUE, validate(id), cons.annuler);

r.get('/teleconsultation/:consultation_id/join', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES),
  validate({ params: z.object({ consultation_id: uuid }) }), audit('ACCES', 'teleconsultation'), tele.rejoindre);

// ═══ Messagerie E2EE ══════════════════════════════════════════════════════
r.get('/conversations', verifyToken, msg.lister);
r.post('/conversations', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES), validate({ body: z.object({
  professionnel_id: uuid.optional(), structure_id: uuid.optional(), parent_id: uuid.optional(), enfant_id: uuid.optional(),
}) }), msg.ouvrir);
r.get('/conversations/:id/messages', verifyToken, validate({ ...id, query: z.object({
  avant: date.optional(), limit: z.coerce.number().int().min(1).max(200).default(50),
}) }), msg.messages);
r.post('/conversations/:id/messages', verifyToken, validate({ ...id, body: z.object({
  ciphertext: z.string().min(16).max(20000).regex(/^[A-Za-z0-9+/=_-]+$/, 'texte chiffré invalide'),
  nonce: z.string().min(12).max(64).regex(/^[A-Za-z0-9+/=_-]+$/),
}) }), msg.envoyer);
r.put('/conversations/:id/lu', verifyToken, validate(id), msg.marquerLu);

// ═══ Journal d'humeur (IA émotionnelle) ═══════════════════════════════════
r.post('/humeur', verifyToken, PARENT, validate({ body: z.object({
  humeur: z.number().int().min(1).max(5), texte: texte(2000).optional(), enfant_id: uuid.optional(),
}) }), divers.ajouterHumeur);
r.get('/humeur', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES), validate({ query: z.object({ enfant_id: uuid.optional() }) }),
  audit('LISTE', 'humeur'), divers.listerHumeur);

// ═══ Messages vocaux + assistant vocal (parents qui ne lisent pas) ═══════════
const audioBrut = express.raw({ type: 'audio/*', limit: vocaux.LIMITE_AUDIO });
const dureeQ = z.coerce.number().min(0).max(600).optional();
r.post('/vocaux', verifyToken, PARENT, vocalLimiter, audioBrut, validate({ query: z.object({
  langue: langue.optional(), enfant_id: uuid.optional(), duree_s: dureeQ,
}) }), audit('CREATION', 'vocal'), vocaux.envoyer);
r.get('/vocaux', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES), validate({ query: z.object({
  enfant_id: uuid.optional(), parent_id: uuid.optional(),
}) }), audit('LISTE', 'vocaux'), vocaux.lister);
r.get('/vocaux/:id/audio', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES), validate(id), audit('LECTURE', 'vocal'), vocaux.audio);
r.post('/vocaux/:id/repondre', verifyToken, CLINIQUE, vocalLimiter, audioBrut, validate({ ...id, query: z.object({ duree_s: dureeQ }) }),
  audit('CREATION', 'vocal'), vocaux.repondre);

// ═══ Candidatures des professionnels : pièces + convocation ═══════════════
const fichierBrut = express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '5mb' });
const TYPES_PIECES = ['DIPLOME', 'ORDRE', 'IDENTITE', 'CV', 'ATTESTATION'];
r.post('/candidatures/pieces', authLimiter, optionalToken, fichierBrut, validate({ query: z.object({
  type: z.enum(TYPES_PIECES), nom: texte(120).optional(),
}) }), audit('DEPOT', 'piece_justificative'), cand.deposerPiece);
r.get('/candidatures/moi', verifyToken, cand.maCandidature);
r.get('/admin/membres/:user_id/pieces', verifyToken, ADMIN_S, validate({ params: z.object({ user_id: uuid }) }), cand.piecesDuCandidat);
r.get('/admin/pieces/:id', verifyToken, checkRole('ADMIN_STRUCTURE', 'SUPER_ADMIN'), validate(id), audit('LECTURE', 'piece_justificative'), cand.ouvrirPiece);
r.put('/admin/pieces/:id', verifyToken, checkRole('ADMIN_STRUCTURE', 'SUPER_ADMIN'), validate({ ...id, body: z.object({
  statut: z.enum(['CONFORME', 'NON_CONFORME']),
}) }), audit('VERIFICATION', 'piece_justificative'), cand.verifierPiece);
r.put('/admin/membres/:user_id/decision', verifyToken, ADMIN_S, validate({
  params: z.object({ user_id: uuid }),
  body: z.discriminatedUnion('statut', [
    z.object({ statut: z.literal('CONVOQUE'), convocation_date: date, convocation_lieu: texte(200).min(3) }),
    z.object({ statut: z.literal('ACTIF') }),
    z.object({ statut: z.literal('REFUSE'), motif: texte(300).min(5) }),
  ]),
}), audit('DECISION', 'candidature'), cand.decider);

// ═══ Ordonnances et pharmacies ════════════════════════════════════════════
r.post('/ordonnances', verifyToken, checkRole('MEDECIN'), validate({ body: z.object({
  enfant_id: uuid, consultation_id: uuid.optional(),
  lignes: z.array(z.object({
    dci: texte(80).min(2), forme: texte(60).optional(), posologie: texte(200).min(2), duree: texte(60).optional(),
  })).min(1).max(10),
}) }), audit('CREATION', 'ordonnance'), pharma.prescrire);
r.get('/ordonnances', verifyToken, checkRole('PARENT', ...ROLES_CLINIQUES), validate({ query: z.object({ enfant_id: uuid.optional() }) }),
  audit('LISTE', 'ordonnances'), pharma.lister);
r.get('/pharmacies', validate({ query: z.object({
  dci: texte(300).optional(), lat: lat.optional(), lng: lng.optional(), region: texte(40).optional(), q: texte(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}) }), pharma.chercher);
r.put('/pharmacies/:id/stocks', verifyToken, SUPER, validate({ ...id, body: z.object({ dci: texte(80).min(2), disponible: z.boolean() }) }),
  audit('MODIFICATION', 'stock_pharmacie'), pharma.declarerStock);

// ═══ USSD (parents sans smartphone) et demandes de rappel ═════════════════
r.post('/ussd', express.urlencoded({ extended: false, limit: '5kb' }), ussd.ussd);
r.get('/rappels', verifyToken, PRO, ussd.rappelsAFaire);
r.put('/rappels/:id', verifyToken, PRO, validate({ ...id, body: z.object({ statut: z.enum(['RAPPELE', 'INJOIGNABLE']) }) }),
  audit('MODIFICATION', 'demande_rappel'), ussd.traiterRappel);

// ═══ Groupe des parents (modéré) ══════════════════════════════════════════
r.get('/communaute', verifyToken, checkRole('PARENT', 'SUPER_ADMIN'), commu.lister);
r.post('/communaute', verifyToken, checkRole('PARENT', 'SUPER_ADMIN'), validate({ body: z.object({ texte: texte(1000).min(1) }) }), commu.publier);
r.put('/communaute/:id/moderation', verifyToken, SUPER, validate({ ...id, body: z.object({ masque: z.boolean(), motif: texte(200).optional() }) }),
  audit('MODERATION', 'communaute'), commu.moderer);

// ═══ Tableau de bord IA (professionnels) ══════════════════════════════════
r.get('/ia/tableau-de-bord', verifyToken, PRO, divers.tableauDeBord);

// ═══ Administration de la structure (tenant) ══════════════════════════════
r.get('/admin/membres', verifyToken, ADMIN_S, validate({ query: z.object({
  statut: z.enum(['EN_ATTENTE', 'CONVOQUE', 'ACTIF', 'REFUSE', 'SUSPENDU']).optional(),
}) }), admin.membres);
r.post('/admin/membres', verifyToken, ADMIN_S, validate({ body: z.object({
  prenom: texte(80).min(1), nom: texte(80).min(1), email, telephone,
  role: z.enum(['MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE']), specialite: texte(120).optional(),
}) }), admin.ajouterMembre);
r.put('/admin/membres/:user_id', verifyToken, ADMIN_S, validate({
  params: z.object({ user_id: uuid }),
  body: z.object({
    statut: z.enum(['ACTIF', 'REFUSE', 'SUSPENDU']).optional(),
    role: z.enum(['MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE']).optional(),
    specialite: texte(120).optional(),
  }),
}), admin.modifierMembre);
r.put('/admin/structure', verifyToken, ADMIN_S, validate({ body: z.object({
  description: texte(2000).optional(), adresse: texte(300).optional(), telephone: texte(40).optional(),
  email: email.optional(), site_web: z.string().url().optional(), horaires: texte(300).optional(),
  troubles: z.array(trouble).optional(), services: z.array(texte(40)).optional(),
  age_min_mois: z.number().int().min(0).optional(), age_max_mois: z.number().int().max(1200).optional(),
  langues: z.array(langue).optional(), cout_niveau: z.number().int().min(0).max(3).optional(),
  delai_attente_jours: z.number().int().min(0).max(730).optional(),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  commune: texte(80).optional(), departement: texte(80).optional(),
}) }), admin.modifierMaStructure);
r.get('/admin/statistiques', verifyToken, checkRole('ADMIN_STRUCTURE', 'MEDECIN'), admin.statistiques);
r.get('/admin/audit', verifyToken, checkRole('ADMIN_STRUCTURE', 'SUPER_ADMIN'), admin.audit);

// ═══ Super-administrateur (plateforme) ════════════════════════════════════
const structureBody = z.object({
  nom: texte(200).min(2), sigle: texte(30).optional(), type: z.enum(TYPES_STRUCTURE),
  secteur: z.enum(['PUBLIC', 'PRIVE', 'ASSOCIATIF', 'CONFESSIONNEL']).optional(),
  description: texte(2000).optional(), region: texte(60).min(2), departement: texte(80).optional(),
  commune: texte(80).optional(), adresse: texte(300).optional(),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  telephone: texte(40).optional(), email: email.optional(), site_web: z.string().url().optional(),
  troubles: z.array(trouble).optional(), services: z.array(texte(40)).optional(),
  age_min_mois: z.number().int().min(0).optional(), age_max_mois: z.number().int().max(1200).optional(),
  langues: z.array(langue).optional(), cout_niveau: z.number().int().min(0).max(3).optional(),
  delai_attente_jours: z.number().int().min(0).optional(), horaires: texte(300).optional(),
  verifie: z.boolean().optional(), source: texte(300).optional(), actif: z.boolean().optional(),
});
// Sécurité avancée (4.3.6) : alertes de l'IA d'accès, ancrage blockchain du journal
r.get('/admin/securite/alertes', verifyToken, checkRole('SUPER_ADMIN', 'ADMIN_STRUCTURE'), validate({ query: z.object({
  statut: z.enum(['NOUVELLE', 'VUE', 'FAUX_POSITIF', 'CONFIRMEE']).optional(),
}) }), admin.alertesSecurite);
r.put('/admin/securite/alertes/:id', verifyToken, checkRole('SUPER_ADMIN', 'ADMIN_STRUCTURE'), validate({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({ statut: z.enum(['VUE', 'FAUX_POSITIF', 'CONFIRMEE']) }),
}), audit('UPDATE', 'alerte_securite'), admin.traiterAlerte);
r.get('/admin/ancrages', verifyToken, SUPER, admin.ancrages);
r.get('/admin/ancrages/:id/preuve', verifyToken, SUPER, validate({ params: z.object({ id: z.coerce.number().int().positive() }) }), admin.preuveAncrage);
r.post('/admin/ancrages', verifyToken, SUPER, audit('CREATE', 'ancrage'), admin.ancrerMaintenant);
r.post('/admin/structures', verifyToken, SUPER, validate({ body: structureBody }), admin.creerStructure);
r.put('/admin/structures/:id', verifyToken, SUPER, validate({ ...id, body: structureBody.partial() }), admin.modifierStructure);
r.post('/admin/structures/:id/activer', verifyToken, SUPER, validate({ ...id, body: z.object({
  prenom: texte(80).min(1), nom: texte(80).min(1), email, telephone, specialite: texte(120).optional(),
}) }), admin.activerPartenaire);
r.get('/admin/audit/verifier', verifyToken, SUPER, admin.verifierAudit);
r.get('/admin/statistiques-nationales', verifyToken, SUPER, admin.statistiquesNationales);
r.get('/admin/supervision', verifyToken, SUPER, admin.supervision);

// ═══ Dons (site vitrine) ══════════════════════════════════════════════════
r.post('/dons', authLimiter, validate({ body: z.object({
  montant: z.number().int().min(500).max(10_000_000), moyen: z.enum(['WAVE', 'ORANGE_MONEY', 'CARTE']),
  nom: texte(120).optional(), email: email.optional(), anonyme: z.boolean().default(true),
}) }), dons.initier);
r.post('/dons/webhook/wave', dons.webhookWave);
r.put('/dons/:id/confirmer', verifyToken, SUPER, validate(id), dons.confirmer);
r.get('/dons/transparence', dons.transparence);

// ═══ Interopérabilité HL7 FHIR ════════════════════════════════════════════
r.get('/fhir/Patient/:id/\\$everything', verifyToken, CLINIQUE, validate(id), audit('EXPORT_FHIR', 'enfant'), fhir.everything);

module.exports = r;
