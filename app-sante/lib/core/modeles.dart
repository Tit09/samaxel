// Modèles de données (lecture des réponses JSON de l'API Santé).

DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse(v.toString())?.toLocal();
List<String> _strs(dynamic v) => (v as List?)?.map((e) => e.toString()).toList() ?? const [];
double? _dbl(dynamic v) => v == null ? null : double.tryParse(v.toString());

class StructureMembre {
  StructureMembre(this.id, this.nom, this.role);
  final String id;
  final String nom;
  final String role;
}

class Utilisateur {
  Utilisateur({
    required this.id,
    required this.prenom,
    required this.nom,
    required this.role,
    this.email,
    this.telephone,
    this.langue = 'fr',
    this.structureId,
    this.structureNom,
    this.specialite,
    this.structures = const [],
    this.structureCode,
    this.structureCouleur,
    this.structureLogo,
  });

  final String id;
  final String prenom;
  final String nom;
  final String role; // PARENT, MEDECIN, THERAPEUTE, SECRETAIRE, ADMIN_STRUCTURE, SUPER_ADMIN
  final String? email;
  final String? telephone;
  final String langue;
  final String? structureId;
  final String? structureNom;
  final String? specialite;
  final List<StructureMembre> structures;
  /// « Maison » du personnel : code, couleur et logo de SON établissement
  final String? structureCode;
  final String? structureCouleur;
  final String? structureLogo;

  bool get estParent => role == 'PARENT';
  bool get estPro => ['MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE'].contains(role);
  bool get estClinicien => role == 'MEDECIN' || role == 'THERAPEUTE';
  bool get estAdmin => role == 'ADMIN_STRUCTURE';
  String get nomComplet => '$prenom $nom';

  factory Utilisateur.fromJson(Map<String, dynamic> j) => Utilisateur(
        id: j['id'],
        prenom: j['prenom'] ?? '',
        nom: j['nom'] ?? '',
        role: j['role'] ?? j['role_global'] ?? 'PARENT',
        email: j['email'],
        telephone: j['telephone'],
        langue: j['langue'] ?? 'fr',
        structureId: j['structure_id'],
        structureNom: j['structure_nom'],
        specialite: j['specialite'],
        structureCode: (j['structure'] as Map?)?['code'],
        structureCouleur: (j['structure'] as Map?)?['couleur'],
        structureLogo: (j['structure'] as Map?)?['logo_url'],
        structures: ((j['structures'] as List?) ?? [])
            .map((s) => StructureMembre(s['structure_id'], s['structure_nom'] ?? '', s['role'] ?? ''))
            .toList(),
      );
}

const libellesRoles = {
  'PARENT': 'Parent',
  'MEDECIN': 'Médecin',
  'THERAPEUTE': 'Thérapeute',
  'SECRETAIRE': 'Secrétariat',
  'ADMIN_STRUCTURE': 'Administration',
  'SUPER_ADMIN': 'Super-administrateur',
};

class Enfant {
  Enfant({
    required this.id,
    required this.prenom,
    required this.nom,
    required this.sexe,
    this.dateNaissance,
    this.ageMois,
    this.ageLisible,
    this.region,
    this.langueMaison = 'wo',
    this.scolarise = false,
    this.suiviId,
    this.numeroDossier,
    this.priorite,
    this.parentId,
    this.lien = 'ENFANT',
  });

  final String id;
  final String lien; // SOI, ENFANT, PARENT_AGE, PROCHE
  final String prenom;
  final String nom;
  final String sexe;
  final String? dateNaissance;
  final int? ageMois;
  final String? ageLisible;
  final String? region;
  final String langueMaison;
  final bool scolarise;
  final String? suiviId;
  final String? numeroDossier;
  final String? priorite;
  final String? parentId;

  String get initiale => prenom.isEmpty ? '?' : prenom[0].toUpperCase();

  /// « Moi », « Mon enfant », « Mon parent », « Un proche »
  String get lienLisible => switch (lien) { 'SOI' => 'moi', 'PARENT_AGE' => 'parent âgé', 'PROCHE' => 'proche', _ => 'enfant' };

  /// Libellé court pour les listes « Pour qui ? »
  String get libelle => lien == 'SOI' ? 'Moi ($prenom)' : '$prenom · $lienLisible';

  factory Enfant.fromJson(Map<String, dynamic> j) => Enfant(
        lien: j['lien'] ?? 'ENFANT',
        id: j['id'],
        prenom: j['prenom'] ?? '',
        nom: j['nom'] ?? '',
        sexe: j['sexe'] ?? 'M',
        dateNaissance: j['date_naissance'],
        ageMois: j['age_mois'],
        ageLisible: j['age_lisible'],
        region: j['region'],
        langueMaison: j['langue_maison'] ?? 'wo',
        scolarise: j['scolarise'] ?? false,
        suiviId: j['suivi_id'],
        numeroDossier: j['numero_dossier'],
        priorite: j['priorite'],
        parentId: j['parent_id'],
      );
}

class Structure {
  Structure({
    required this.id,
    required this.nom,
    required this.type,
    required this.region,
    this.sigle,
    this.secteur,
    this.description,
    this.commune,
    this.adresse,
    this.latitude,
    this.longitude,
    this.telephone,
    this.email,
    this.troubles = const [],
    this.services = const [],
    this.coutNiveau = 1,
    this.delaiJours,
    this.partenaire = false,
    this.verifie = false,
    this.distanceKm,
    this.horaires,
  });

  final String id;
  final String nom;
  final String type;
  final String region;
  final String? sigle;
  final String? secteur;
  final String? description;
  final String? commune;
  final String? adresse;
  final double? latitude;
  final double? longitude;
  final String? telephone;
  final String? email;
  final List<String> troubles;
  final List<String> services;
  final int coutNiveau;
  final int? delaiJours;
  final bool partenaire;
  final bool verifie;
  final double? distanceKm;
  final String? horaires;

  String get nomCourt => sigle ?? nom;

  factory Structure.fromJson(Map<String, dynamic> j) => Structure(
        id: j['id'],
        nom: j['nom'],
        type: j['type'],
        region: j['region'] ?? '',
        sigle: j['sigle'],
        secteur: j['secteur'],
        description: j['description'],
        commune: j['commune'],
        adresse: j['adresse'],
        latitude: _dbl(j['latitude']),
        longitude: _dbl(j['longitude']),
        telephone: j['telephone'],
        email: j['email'],
        troubles: _strs(j['troubles']),
        services: _strs(j['services']),
        coutNiveau: j['cout_niveau'] ?? 1,
        delaiJours: j['delai_attente_jours'],
        partenaire: j['partenaire'] ?? false,
        verifie: j['verifie'] ?? false,
        distanceKm: _dbl(j['distance_km']),
        horaires: j['horaires'],
      );
}

class Recommandation {
  Recommandation(this.structure, this.score, this.raisons, this.distanceKm);
  final Structure structure;
  final int score;
  final List<String> raisons;
  final double? distanceKm;

  factory Recommandation.fromJson(Map<String, dynamic> j) => Recommandation(
        Structure.fromJson(j['structure']),
        (j['score'] as num).round(),
        _strs(j['raisons']),
        _dbl(j['distance_km']),
      );
}

class OptionReponse {
  OptionReponse(this.valeur, this.libelle, [this.audioKey]);
  final int valeur;
  final String libelle;
  final String? audioKey;
}

class Question {
  Question({required this.id, required this.type, required this.texte, required this.options, required this.audioKey});
  final int id;
  final String type; // echelle | alerte
  final String texte;
  final List<OptionReponse> options;
  final String audioKey;

  factory Question.fromJson(Map<String, dynamic> j) => Question(
        id: j['id'],
        type: j['type'],
        texte: j['texte'],
        audioKey: j['audio_key'] ?? 'q${j['id']}',
        options: ((j['options'] as List?) ?? []).map((o) => OptionReponse(o['valeur'], o['libelle'], o['audio_key'])).toList(),
      );
}

class Questionnaire {
  Questionnaire({
    required this.code,
    required this.titre,
    required this.icone,
    required this.description,
    this.consigne,
    this.reference,
    this.repondant,
    this.questions = const [],
    this.nbQuestions = 0,
    this.adapte = true,
  });

  /// Adapté à l'âge de la personne choisie (sinon proposé dans « Autres tests »)
  final bool adapte;

  final String code;
  final String titre;
  final String icone;
  final String description;
  final String? consigne;
  final String? reference;
  final String? repondant;
  final List<Question> questions;
  final int nbQuestions;

  bool get concerneEnfant => repondant == 'PARENT';

  factory Questionnaire.fromJson(Map<String, dynamic> j) => Questionnaire(
        code: j['code'],
        titre: j['titre'],
        icone: j['icone'] ?? '📋',
        description: j['description'] ?? '',
        consigne: j['consigne'],
        reference: j['reference'],
        repondant: j['repondant'],
        nbQuestions: j['nb_questions'] ?? (j['questions'] as List?)?.length ?? 0,
        adapte: j['adapte'] ?? true,
        questions: ((j['questions'] as List?) ?? []).map((q) => Question.fromJson(q)).toList(),
      );
}

class Raison {
  Raison(this.points, this.texte, {this.manuel = false});
  final int points;
  final String texte;
  final bool manuel;
  factory Raison.fromJson(Map<String, dynamic> j) => Raison((j['points'] as num?)?.round() ?? 0, j['texte'] ?? '', manuel: j['manuel'] == true);
}

class Suivi {
  Suivi({
    required this.id,
    required this.enfantId,
    required this.structureId,
    required this.numeroDossier,
    required this.statut,
    required this.priorite,
    this.structureNom,
    this.score = 0,
    this.raisons = const [],
    this.enfant,
    this.referent,
    this.creeLe,
    this.parentId,
  });

  final String id;
  final String enfantId;
  final String structureId;
  final String numeroDossier;
  final String statut;
  final String priorite;
  final String? structureNom;
  final int score;
  final List<Raison> raisons;
  final Enfant? enfant;
  final String? referent;
  final DateTime? creeLe;
  final String? parentId;

  factory Suivi.fromJson(Map<String, dynamic> j) => Suivi(
        id: j['id'],
        enfantId: j['enfant_id'],
        structureId: j['structure_id'],
        numeroDossier: j['numero_dossier'] ?? '',
        statut: j['statut'],
        priorite: j['priorite'] ?? 'NORMAL',
        structureNom: j['structure_nom'],
        score: j['triage_score'] ?? 0,
        raisons: ((j['triage_raisons'] as List?) ?? []).map((r) => Raison.fromJson(Map<String, dynamic>.from(r))).toList(),
        enfant: j['enfant'] != null ? Enfant.fromJson(j['enfant']) : null,
        referent: j['referent'],
        creeLe: _date(j['created_at']),
        parentId: j['parent_id'],
      );
}

class RendezVous {
  RendezVous({
    required this.id,
    required this.structureId,
    required this.enfantId,
    required this.type,
    required this.statut,
    required this.priorite,
    this.structureNom,
    this.professionnelNom,
    this.professionnelId,
    this.motif,
    this.dateSouhaitee,
    this.dateConfirmee,
    this.consultationId,
    this.enfantPrenom,
    this.numeroDossier,
    this.suiviId,
  });

  final String? enfantPrenom;
  final String? numeroDossier;
  final String? suiviId;
  final String id;
  final String structureId;
  final String enfantId;
  final String type;
  final String statut;
  final String priorite;
  final String? structureNom;
  final String? professionnelNom;
  final String? professionnelId;
  final String? motif;
  final DateTime? dateSouhaitee;
  final DateTime? dateConfirmee;
  final String? consultationId;

  bool get estVisio => type == 'TELECONSULTATION';
  DateTime? get date => dateConfirmee ?? dateSouhaitee;

  factory RendezVous.fromJson(Map<String, dynamic> j) => RendezVous(
        id: j['id'],
        structureId: j['structure_id'],
        enfantId: j['enfant_id'],
        type: j['type'],
        statut: j['statut'],
        priorite: j['priorite'] ?? 'NORMAL',
        structureNom: j['structure_nom'],
        professionnelNom: j['professionnel_nom'],
        professionnelId: j['professionnel_id'],
        motif: j['motif'],
        dateSouhaitee: _date(j['date_souhaitee']),
        dateConfirmee: _date(j['date_confirmee']),
        consultationId: j['consultation_id'],
        enfantPrenom: j['enfant_prenom'],
        numeroDossier: j['numero_dossier'],
        suiviId: j['suivi_id'],
      );
}

class Consultation {
  Consultation({
    required this.id,
    required this.enfantId,
    required this.type,
    required this.statut,
    this.date,
    this.professionnelNom,
    this.structureNom,
    this.motif,
    this.observations,
    this.recommandations,
    this.diagnosticCode,
    this.visibleParent = true,
  });

  final String id;
  final String enfantId;
  final String type;
  final String statut;
  final DateTime? date;
  final String? professionnelNom;
  final String? structureNom;
  final String? motif;
  final String? observations;
  final String? recommandations;
  final String? diagnosticCode;
  final bool visibleParent;

  factory Consultation.fromJson(Map<String, dynamic> j) => Consultation(
        id: j['id'],
        enfantId: j['enfant_id'],
        type: j['type'],
        statut: j['statut'],
        date: _date(j['date_consultation']),
        professionnelNom: j['professionnel_nom'],
        structureNom: j['structure_nom'],
        motif: j['motif'],
        observations: j['observations'],
        recommandations: j['recommandations'],
        diagnosticCode: j['diagnostic_code'],
        visibleParent: j['visible_parent'] ?? true,
      );
}

class Depistage {
  Depistage({required this.id, required this.code, required this.niveau, required this.score, required this.scoreMax, this.alertes = const [], this.date, this.enfantId});
  final String id;
  final String code;
  final String niveau;
  final int score;
  final int scoreMax;
  final List<String> alertes;
  final DateTime? date;
  final String? enfantId;

  factory Depistage.fromJson(Map<String, dynamic> j) => Depistage(
        id: j['id'],
        code: j['questionnaire_code'],
        niveau: j['niveau'],
        score: j['score'],
        scoreMax: j['score_max'] ?? 0,
        alertes: _strs(j['alertes']),
        date: _date(j['created_at']),
        enfantId: j['enfant_id'],
      );
}

class Conversation {
  Conversation({required this.id, required this.interlocuteurId, required this.interlocuteurNom, this.clePublique, this.structureNom, this.nonLus = 0, this.dernier});
  final String id;
  final String interlocuteurId;
  final String interlocuteurNom;
  final String? clePublique;
  final String? structureNom;
  final int nonLus;
  final DateTime? dernier;

  factory Conversation.fromJson(Map<String, dynamic> j) => Conversation(
        id: j['id'],
        interlocuteurId: j['interlocuteur']['id'],
        interlocuteurNom: j['interlocuteur']['nom'],
        clePublique: j['interlocuteur']['public_key'],
        structureNom: j['structure_nom'],
        nonLus: j['non_lus'] ?? 0,
        dernier: _date(j['dernier_message_at']),
      );
}

class MessageChiffre {
  MessageChiffre({required this.id, required this.senderId, required this.ciphertext, required this.nonce, this.date, this.audio = false, this.duree});
  final String id;
  final String senderId;
  final String ciphertext;
  final String nonce;
  final DateTime? date;
  final bool audio; // message vocal (chiffré de la même façon que le texte)
  final int? duree;

  factory MessageChiffre.fromJson(Map<String, dynamic> j) => MessageChiffre(
        id: j['id'],
        senderId: j['sender_id'],
        ciphertext: j['ciphertext'],
        nonce: j['nonce'],
        date: _date(j['created_at']),
        audio: j['type'] == 'AUDIO',
        duree: (j['duree_s'] as num?)?.toInt(),
      );
}

class Notif {
  Notif({required this.id, required this.titre, required this.corps, required this.type, required this.lu, this.date});
  final String id;
  final String titre;
  final String corps;
  final String type;
  final bool lu;
  final DateTime? date;

  factory Notif.fromJson(Map<String, dynamic> j) =>
      Notif(id: j['id'], titre: j['titre'], corps: j['corps'], type: j['type'], lu: j['lu'] ?? false, date: _date(j['created_at']));
}
