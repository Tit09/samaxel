-- ============================================================================
--  SAMA XHEL — Schéma PostgreSQL (v1)
--  Plateforme intelligente de prise en charge des TND au Sénégal
--
--  Principes :
--   • Données de santé identifiantes chiffrées côté application (AES-256-GCM)
--     → colonnes *_chiffre. La base ne voit jamais le texte en clair.
--   • Index « aveugles » HMAC-SHA256 (*_index) pour rechercher sans déchiffrer.
--   • Minimisation : on stocke le MOIS de naissance (calcul d'âge) en clair,
--     la date exacte est chiffrée.
--   • Isolation multi-structure + accès parent via Row Level Security (002_rls.sql).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ─── Fonction utilitaire : mise à jour automatique de updated_at ────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

-- ============================================================================
--  1. UTILISATEURS ET STRUCTURES
-- ============================================================================

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_global      text NOT NULL DEFAULT 'PARENT'
                   CHECK (role_global IN ('PARENT', 'PROFESSIONNEL', 'SUPER_ADMIN')),
  nom              text NOT NULL,
  prenom           text NOT NULL,
  email            text,
  telephone        text,
  password_hash    text NOT NULL,
  langue           text NOT NULL DEFAULT 'fr'
                   CHECK (langue IN ('fr', 'en', 'wo', 'ff', 'srr', 'dyo', 'mnk', 'bm')),
  region           text,
  photo_url        text,
  public_key       text,            -- clé publique X25519 (messagerie E2EE)
  -- Profil des besoins (inscription parent depuis le site vitrine) — chiffré
  profil_besoins_chiffre text,
  capacite_paiement smallint CHECK (capacite_paiement BETWEEN 0 AND 3), -- 0 aucune … 3 bonne
  famille_vulnerable boolean NOT NULL DEFAULT false,
  -- Professionnels (inscription médecin / thérapeute)
  numero_ordre     text,
  mode_exercice    text CHECK (mode_exercice IN ('PUBLIC', 'PRIVE', 'ASSOCIATIF', 'MIXTE')),
  langues_parlees  text[] NOT NULL DEFAULT '{fr}',
  teleconsultation boolean NOT NULL DEFAULT false,
  verifie          boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  mfa_enabled      boolean NOT NULL DEFAULT false,
  login_attempts   integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  derniere_connexion timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT users_contact_chk CHECK (email IS NOT NULL OR telephone IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_uq     ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_telephone_uq ON users (telephone)    WHERE telephone IS NOT NULL;
CREATE TRIGGER users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Structures = annuaire national (hôpitaux, centres, écoles, cabinets…)
-- « partenaire = true » : la structure utilise la plateforme (RDV, dossiers).
CREATE TABLE structures (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                text NOT NULL,
  sigle              text,
  type               text NOT NULL CHECK (type IN (
                       'HOPITAL', 'CENTRE_SANTE', 'CENTRE_SPECIALISE',
                       'ECOLE_INCLUSIVE', 'ECOLE_SPECIALISEE', 'CABINET',
                       'ASSOCIATION', 'CENTRE_ADDICTOLOGIE')),
  secteur            text NOT NULL DEFAULT 'PUBLIC'
                     CHECK (secteur IN ('PUBLIC', 'PRIVE', 'ASSOCIATIF', 'CONFESSIONNEL')),
  description        text,
  region             text NOT NULL,
  departement        text,
  commune            text,
  adresse            text,
  latitude           numeric(9, 6),
  longitude          numeric(9, 6),
  telephone          text,
  email              text,
  site_web           text,
  troubles           text[] NOT NULL DEFAULT '{}',  -- TSA, TDAH, DI, LANGAGE, DYS, MOTEUR, EPILEPSIE, DEPRESSION, ADDICTION
  services           text[] NOT NULL DEFAULT '{}',  -- DIAGNOSTIC, PEDOPSYCHIATRIE, ORTHOPHONIE…
  age_min_mois       integer NOT NULL DEFAULT 0,
  age_max_mois       integer NOT NULL DEFAULT 1200,
  langues            text[] NOT NULL DEFAULT '{fr,wo}',
  cout_niveau        smallint NOT NULL DEFAULT 1 CHECK (cout_niveau BETWEEN 0 AND 3), -- 0 gratuit … 3 élevé
  delai_attente_jours integer,
  horaires           text,
  partenaire         boolean NOT NULL DEFAULT false,
  verifie            boolean NOT NULL DEFAULT false,
  source             text,
  actif              boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX structures_region_idx   ON structures (region);
CREATE INDEX structures_troubles_idx ON structures USING gin (troubles);
CREATE INDEX structures_services_idx ON structures USING gin (services);
CREATE TRIGGER structures_updated BEFORE UPDATE ON structures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Professionnels rattachés à une structure, avec leur rôle dans CETTE structure
CREATE TABLE membres_structure (
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  structure_id     uuid NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE')),
  specialite       text,     -- pédopsychiatre, neuropédiatre, orthophoniste, psychomotricien…
  -- EN_ATTENTE : inscrit depuis le site, en attente de validation par l'admin de la structure
  statut           text NOT NULL DEFAULT 'EN_ATTENTE'
                   CHECK (statut IN ('EN_ATTENTE', 'ACTIF', 'REFUSE', 'SUSPENDU')),
  valide_par       uuid REFERENCES users(id),
  date_affectation timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, structure_id)
);
CREATE INDEX membres_structure_idx ON membres_structure (structure_id);

-- ============================================================================
--  2. ENFANTS, CONSENTEMENTS, PRISES EN CHARGE
-- ============================================================================

CREATE TABLE enfants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prenom_chiffre        text NOT NULL,
  nom_chiffre           text NOT NULL,
  nom_index             text NOT NULL,          -- HMAC du nom normalisé
  date_naissance_chiffre text NOT NULL,
  mois_naissance        date NOT NULL,          -- 1er jour du mois (calcul d'âge)
  sexe                  char(1) NOT NULL CHECK (sexe IN ('M', 'F')),
  region                text,
  langue_maison         text NOT NULL DEFAULT 'wo',
  scolarise             boolean NOT NULL DEFAULT false,
  archive               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX enfants_parent_idx ON enfants (parent_id);
CREATE TRIGGER enfants_updated BEFORE UPDATE ON enfants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Traçabilité des consentements (loi sénégalaise sur les données personnelles)
CREATE TABLE consentements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enfant_id   uuid REFERENCES enfants(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN (
                'CGU', 'DONNEES_SANTE', 'PARTAGE_STRUCTURE', 'TELECONSULTATION', 'IA_ANALYSE')),
  version     text NOT NULL DEFAULT '1.0',
  accepte     boolean NOT NULL,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX consentements_parent_idx ON consentements (parent_id);

CREATE SEQUENCE numero_dossier_seq;

-- Suivi = dossier d'un enfant dans une structure (prise en charge)
-- parent_id est dénormalisé pour que la RLS reste simple et sans récursion.
CREATE TABLE suivis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enfant_id       uuid NOT NULL REFERENCES enfants(id) ON DELETE CASCADE,
  parent_id       uuid NOT NULL REFERENCES users(id),
  structure_id    uuid NOT NULL REFERENCES structures(id),
  numero_dossier  text NOT NULL UNIQUE
                  DEFAULT ('TND-' || to_char(NOW(), 'YYYY') || '-' ||
                           lpad(nextval('numero_dossier_seq')::text, 6, '0')),
  referent_id     uuid REFERENCES users(id),
  statut          text NOT NULL DEFAULT 'DEMANDE'
                  CHECK (statut IN ('DEMANDE', 'ACTIF', 'REFUSE', 'CLOS', 'ARCHIVE')),
  priorite        text NOT NULL DEFAULT 'NORMAL'
                  CHECK (priorite IN ('URGENT', 'PRIORITAIRE', 'NORMAL')),
  triage_score    integer NOT NULL DEFAULT 0,
  triage_raisons  jsonb NOT NULL DEFAULT '[]',
  motif_chiffre   text,
  depistage_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (enfant_id, structure_id)
);
CREATE INDEX suivis_structure_idx ON suivis (structure_id, statut, priorite);
CREATE INDEX suivis_parent_idx    ON suivis (parent_id);
CREATE TRIGGER suivis_updated BEFORE UPDATE ON suivis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  3. DÉPISTAGE (questionnaires) ET IA
-- ============================================================================

CREATE TABLE depistages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enfant_id          uuid REFERENCES enfants(id) ON DELETE CASCADE,
  questionnaire_code text NOT NULL,
  questionnaire_version text NOT NULL DEFAULT '1.0',
  reponses_chiffre   text NOT NULL,
  score              integer NOT NULL,
  score_max          integer NOT NULL,
  niveau             text NOT NULL CHECK (niveau IN ('FAIBLE', 'MODERE', 'ELEVE')),
  alertes            text[] NOT NULL DEFAULT '{}',
  triage             jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX depistages_enfant_idx ON depistages (enfant_id, created_at DESC);
CREATE INDEX depistages_parent_idx ON depistages (parent_id);

ALTER TABLE suivis ADD CONSTRAINT suivis_depistage_fk
  FOREIGN KEY (depistage_id) REFERENCES depistages(id) ON DELETE SET NULL;

-- Journal d'humeur du parent (analyse émotionnelle par l'IA, avec consentement)
CREATE TABLE humeur_journal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enfant_id     uuid REFERENCES enfants(id) ON DELETE CASCADE,
  humeur        smallint NOT NULL CHECK (humeur BETWEEN 1 AND 5),
  texte_chiffre text,
  analyse_ia    jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX humeur_parent_idx ON humeur_journal (parent_id, created_at DESC);
CREATE INDEX humeur_enfant_idx ON humeur_journal (enfant_id, created_at DESC);


-- ============================================================================
--  4. RENDEZ-VOUS, CONSULTATIONS, TÉLÉCONSULTATION
-- ============================================================================

CREATE TABLE rendez_vous (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id     uuid NOT NULL REFERENCES structures(id),
  suivi_id         uuid REFERENCES suivis(id) ON DELETE SET NULL,
  enfant_id        uuid NOT NULL REFERENCES enfants(id) ON DELETE CASCADE,
  parent_id        uuid NOT NULL REFERENCES users(id),
  professionnel_id uuid REFERENCES users(id),
  type             text NOT NULL DEFAULT 'PRESENTIEL' CHECK (type IN ('PRESENTIEL', 'TELECONSULTATION')),
  motif_chiffre    text,
  date_souhaitee   timestamptz,
  date_confirmee   timestamptz,
  duree_min        integer NOT NULL DEFAULT 30,
  statut           text NOT NULL DEFAULT 'DEMANDE'
                   CHECK (statut IN ('DEMANDE', 'CONFIRME', 'ANNULE', 'TERMINE', 'ABSENT')),
  priorite         text NOT NULL DEFAULT 'NORMAL' CHECK (priorite IN ('URGENT', 'PRIORITAIRE', 'NORMAL')),
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX rdv_structure_idx ON rendez_vous (structure_id, statut, date_confirmee);
CREATE INDEX rdv_parent_idx    ON rendez_vous (parent_id);
CREATE TRIGGER rdv_updated BEFORE UPDATE ON rendez_vous
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE consultations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id           uuid NOT NULL REFERENCES structures(id),
  rdv_id                 uuid REFERENCES rendez_vous(id) ON DELETE SET NULL,
  suivi_id               uuid REFERENCES suivis(id) ON DELETE SET NULL,
  enfant_id              uuid NOT NULL REFERENCES enfants(id) ON DELETE CASCADE,
  parent_id              uuid NOT NULL REFERENCES users(id),
  professionnel_id       uuid NOT NULL REFERENCES users(id),
  date_consultation      timestamptz NOT NULL DEFAULT NOW(),
  type                   text NOT NULL DEFAULT 'PRESENTIEL' CHECK (type IN ('PRESENTIEL', 'TELECONSULTATION')),
  motif_chiffre          text,
  observations_chiffre   text,
  recommandations_chiffre text,
  diagnostic_code        text,          -- CIM-11 (ex. 6A02 = TSA)
  visible_parent         boolean NOT NULL DEFAULT true,  -- recommandations partagées
  statut                 text NOT NULL DEFAULT 'PLANIFIEE'
                         CHECK (statut IN ('PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE')),
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX consultations_enfant_idx    ON consultations (enfant_id, date_consultation DESC);
CREATE INDEX consultations_structure_idx ON consultations (structure_id, date_consultation DESC);
CREATE TRIGGER consultations_updated BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  5. MESSAGERIE CHIFFRÉE DE BOUT EN BOUT (le serveur ne stocke que du chiffré)
-- ============================================================================

CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professionnel_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  structure_id     uuid NOT NULL REFERENCES structures(id),  -- messagerie cloisonnée par structure
  enfant_id        uuid REFERENCES enfants(id) ON DELETE SET NULL,
  dernier_message_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, professionnel_id, structure_id)
);

CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES users(id),
  ciphertext       text NOT NULL,     -- AES-256-GCM (clé dérivée X25519 côté client)
  nonce            text NOT NULL,
  lu_at            timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX messages_conv_idx ON messages (conversation_id, created_at);

-- ============================================================================
--  6. NOTIFICATIONS ET AUDIT
-- ============================================================================

CREATE TABLE device_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  plateforme text NOT NULL CHECK (plateforme IN ('android', 'ios', 'web', 'macos', 'windows', 'linux')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  titre      text NOT NULL,
  corps      text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  lu         boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, lu, created_at DESC);

-- Journal d'audit : qui a consulté/modifié quelle donnée de santé, quand.
-- L'application ne peut qu'INSÉRER et LIRE (jamais modifier ni supprimer).
CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  user_id       uuid,
  role          text,
  structure_id  uuid,
  action        text NOT NULL,
  ressource     text NOT NULL,
  ressource_id  text,
  ip            text,
  statut_http   integer,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_user_idx      ON audit_logs (user_id, created_at DESC);
CREATE INDEX audit_structure_idx ON audit_logs (structure_id, created_at DESC);

-- ============================================================================
--  7. DONS (site vitrine) — transparence publique des montants, jamais des donateurs
-- ============================================================================
CREATE TABLE dons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  montant           integer NOT NULL CHECK (montant >= 500),   -- FCFA
  devise            text NOT NULL DEFAULT 'XOF',
  moyen             text NOT NULL CHECK (moyen IN ('WAVE', 'ORANGE_MONEY', 'CARTE')),
  donateur_nom      text,
  donateur_email    text,
  anonyme           boolean NOT NULL DEFAULT true,
  statut            text NOT NULL DEFAULT 'INITIE' CHECK (statut IN ('INITIE', 'PAYE', 'ECHOUE', 'REMBOURSE')),
  reference_externe text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  paye_at           timestamptz
);
CREATE INDEX dons_statut_idx ON dons (statut, created_at DESC);
