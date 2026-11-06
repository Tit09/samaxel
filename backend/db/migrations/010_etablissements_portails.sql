-- ============================================================================
--  010 — Plateforme multi-établissements (SaaS « hôpital numérique »)
--
--  • Chaque établissement a un CODE court (ex. « fann », « cepiad ») qui ouvre
--    son portail : logo, couleur, horaires, boutons d'inscription et de connexion.
--  • Un établissement peut regrouper des SERVICES (ex. CHNU de Fann : Keur Xaleyi,
--    clinique Moussa Diop, CEPIAD, neurologie).
--  • Statut d'adhésion : ANNUAIRE (fiche publique seulement, icône générique)
--    → DEMANDE → VISITE_PROGRAMMEE → PARTENAIRE (ou REFUSE / SUSPENDU).
--  • Un professionnel peut appartenir à PLUSIEURS établissements (déjà possible :
--    clé (user_id, structure_id)) et, dans chacun, à un service.
--  • Une famille « s'abonne » à un établissement : table inscriptions.
--  • La personne suivie peut être l'utilisateur lui-même, son enfant ou un parent âgé.
-- ============================================================================

-- ── 1. Établissements ──────────────────────────────────────────────────────
ALTER TABLE structures
  ADD COLUMN code            text,
  ADD COLUMN logo_url        text,
  ADD COLUMN couleur         text CHECK (couleur IS NULL OR couleur ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN statut_adhesion text NOT NULL DEFAULT 'ANNUAIRE'
             CHECK (statut_adhesion IN ('ANNUAIRE', 'DEMANDE', 'VISITE_PROGRAMMEE', 'PARTENAIRE', 'REFUSE', 'SUSPENDU')),
  ADD COLUMN publics         text[] NOT NULL DEFAULT '{ENFANT}',   -- ENFANT, ADULTE, PERSONNE_AGEE
  ADD COLUMN fiabilite       text CHECK (fiabilite IN ('ELEVEE', 'MOYENNE', 'FAIBLE')),
  -- Rattachement : Keur Xaleyi, Moussa Diop et le CEPIAD dépendent du CHNU de Fann.
  -- Chaque service rattaché garde SON portail et SES données (cloisonnement par structure).
  ADD COLUMN parent_id       uuid REFERENCES structures(id);
CREATE INDEX structures_parent_idx ON structures (parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE structures ADD CONSTRAINT structures_code_format CHECK (code IS NULL OR code ~ '^[a-z0-9][a-z0-9-]{1,39}$');
CREATE UNIQUE INDEX structures_code_idx ON structures (code) WHERE code IS NOT NULL;
-- Cohérence avec l'ancien drapeau « partenaire »
UPDATE structures SET statut_adhesion = 'PARTENAIRE' WHERE partenaire;

ALTER TABLE structures DROP CONSTRAINT IF EXISTS structures_type_check;
ALTER TABLE structures ADD CONSTRAINT structures_type_check CHECK (type IN (
  'HOPITAL', 'CENTRE_SANTE', 'CENTRE_SPECIALISE', 'ECOLE_INCLUSIVE', 'ECOLE_SPECIALISEE',
  'CABINET', 'ASSOCIATION', 'CENTRE_ADDICTOLOGIE', 'CLINIQUE', 'EHPAD'));

-- ── 2. Services internes d'un établissement ────────────────────────────────
CREATE TABLE services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  uuid NOT NULL REFERENCES structures(id),
  code          text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nom           text NOT NULL,
  specialite    text,                        -- pédopsychiatrie, addictologie, psychiatrie adulte…
  publics       text[] NOT NULL DEFAULT '{ENFANT}',
  troubles      text[] NOT NULL DEFAULT '{}',
  telephone     text,
  horaires      text,
  logo_url      text,
  couleur       text CHECK (couleur IS NULL OR couleur ~ '^#[0-9A-Fa-f]{6}$'),
  actif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (structure_id, code)
);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY services_lecture ON services FOR SELECT USING (true);
CREATE POLICY services_gestion ON services FOR ALL
  USING (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()))
  WITH CHECK (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()));

ALTER TABLE membres_structure ADD COLUMN service_id uuid REFERENCES services(id);

-- ── 3. Personne suivie : soi-même, un enfant, un parent âgé, un proche ──────
ALTER TABLE enfants ADD COLUMN lien text NOT NULL DEFAULT 'ENFANT'
  CHECK (lien IN ('SOI', 'ENFANT', 'PARENT_AGE', 'PROCHE'));
COMMENT ON TABLE enfants IS 'Personnes suivies (le nom historique est conservé ; voir la colonne lien)';

-- ── 4. Demandes d'adhésion d'un établissement (pièces + visite sur place) ───
CREATE TABLE demandes_adhesion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id     uuid REFERENCES structures(id),     -- fiche de l'annuaire si elle existe déjà
  demandeur_id     uuid NOT NULL REFERENCES users(id), -- futur administrateur de l'établissement
  nom_etablissement text NOT NULL,
  type             text NOT NULL,
  secteur          text NOT NULL DEFAULT 'PUBLIC',
  region           text NOT NULL,
  commune          text,
  adresse          text,
  telephone        text,
  email            text,
  fonction_demandeur text NOT NULL,                   -- directeur, chef de service…
  services_proposes jsonb NOT NULL DEFAULT '[]',      -- [{nom, specialite, publics}]
  statut           text NOT NULL DEFAULT 'DEPOSEE' CHECK (statut IN (
                     'DEPOSEE', 'PIECES_CONFORMES', 'VISITE_PROGRAMMEE', 'VISITE_EFFECTUEE',
                     'ACCEPTEE', 'REFUSEE', 'COMPLEMENT_DEMANDE')),
  visite_date      timestamptz,
  visite_lieu      text,
  visite_compte_rendu text,
  decision_motif   text,
  traite_par       uuid REFERENCES users(id),
  traite_le        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX demandes_adhesion_statut_idx ON demandes_adhesion (statut, created_at);
CREATE TRIGGER demandes_adhesion_updated BEFORE UPDATE ON demandes_adhesion
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE demandes_adhesion ENABLE ROW LEVEL SECURITY;
CREATE POLICY adhesion_lecture ON demandes_adhesion FOR SELECT USING (demandeur_id = app_uid() OR app_is_super());
CREATE POLICY adhesion_depot ON demandes_adhesion FOR INSERT WITH CHECK (demandeur_id = app_uid());
-- Le demandeur peut compléter tant que la demande n'est pas décidée ; le super-admin instruit.
CREATE POLICY adhesion_maj ON demandes_adhesion FOR UPDATE
  USING (app_is_super() OR (demandeur_id = app_uid() AND statut IN ('DEPOSEE', 'COMPLEMENT_DEMANDE')))
  WITH CHECK (app_is_super() OR (demandeur_id = app_uid() AND statut IN ('DEPOSEE', 'COMPLEMENT_DEMANDE')));
CREATE TRIGGER demandes_adhesion_sans_suppression BEFORE DELETE ON demandes_adhesion
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

-- Pièces de l'établissement : réutilise pieces_justificatives avec un lien vers la demande
ALTER TABLE pieces_justificatives ADD COLUMN demande_adhesion_id uuid REFERENCES demandes_adhesion(id);
ALTER TABLE pieces_justificatives DROP CONSTRAINT IF EXISTS pieces_justificatives_type_check;
ALTER TABLE pieces_justificatives ADD CONSTRAINT pieces_justificatives_type_check CHECK (type IN (
  'DIPLOME', 'ORDRE', 'IDENTITE', 'CV', 'ATTESTATION',
  'AGREMENT', 'ARRETE_CREATION', 'NINEA', 'LETTRE_DIRECTION', 'STATUTS'));

-- ── 5. Abonnement de l'établissement à la plateforme ───────────────────────
CREATE TABLE abonnements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  uuid NOT NULL REFERENCES structures(id),
  formule       text NOT NULL DEFAULT 'PILOTE' CHECK (formule IN ('PILOTE', 'PUBLIC_CONVENTION', 'PRIVE_STANDARD')),
  debut         date NOT NULL DEFAULT CURRENT_DATE,
  fin           date,
  statut        text NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'TERMINE')),
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE abonnements ENABLE ROW LEVEL SECURITY;
CREATE POLICY abonnements_lecture ON abonnements FOR SELECT
  USING (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()));
CREATE POLICY abonnements_gestion ON abonnements FOR ALL USING (app_is_super()) WITH CHECK (app_is_super());

-- ── 6. Invitations du personnel (l'administrateur invite un soignant) ───────
CREATE TABLE invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  uuid NOT NULL REFERENCES structures(id),
  service_id    uuid REFERENCES services(id),
  role          text NOT NULL CHECK (role IN ('MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE')),
  destinataire  text NOT NULL,             -- téléphone ou e-mail
  jeton_hash    text NOT NULL UNIQUE,      -- SHA-256 du jeton envoyé (le jeton n'est jamais stocké)
  expire_le     timestamptz NOT NULL,
  utilisee_le   timestamptz,
  utilisee_par  uuid REFERENCES users(id),
  cree_par      uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_gestion ON invitations FOR ALL
  USING (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()))
  WITH CHECK (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()));

-- Acceptation d'une invitation : le jeton est vérifié côté serveur, sans session pro.
CREATE OR REPLACE FUNCTION utiliser_invitation(p_jeton_hash text, p_user uuid)
RETURNS TABLE (structure_id uuid, service_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv invitations;
BEGIN
  SELECT * INTO inv FROM invitations i
   WHERE i.jeton_hash = p_jeton_hash AND i.utilisee_le IS NULL AND i.expire_le > NOW()
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE invitations SET utilisee_le = NOW(), utilisee_par = p_user WHERE id = inv.id;
  INSERT INTO membres_structure (user_id, structure_id, role, statut, service_id, valide_par)
  VALUES (p_user, inv.structure_id, inv.role, 'ACTIF', inv.service_id, inv.cree_par)
  ON CONFLICT (user_id, structure_id) DO UPDATE
     SET role = EXCLUDED.role, statut = 'ACTIF', service_id = EXCLUDED.service_id, valide_par = EXCLUDED.valide_par;
  RETURN QUERY SELECT inv.structure_id, inv.service_id, inv.role;
END $$;
REVOKE ALL ON FUNCTION utiliser_invitation(text, uuid) FROM PUBLIC;

-- ── 7. Inscriptions des familles dans un établissement (« abonnement ») ────
CREATE TABLE inscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid NOT NULL REFERENCES users(id),
  structure_id  uuid NOT NULL REFERENCES structures(id),
  service_id    uuid REFERENCES services(id),
  personne_id   uuid REFERENCES enfants(id),
  origine       text NOT NULL DEFAULT 'PORTAIL' CHECK (origine IN ('PORTAIL', 'QR_CODE', 'ORIENTATION', 'ACCUEIL')),
  statut        text NOT NULL DEFAULT 'DEMANDEE' CHECK (statut IN ('DEMANDEE', 'ACTIVE', 'REFUSEE', 'CLOTUREE')),
  traite_par    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, structure_id)
);
CREATE INDEX inscriptions_structure_idx ON inscriptions (structure_id, statut);
CREATE TRIGGER inscriptions_updated BEFORE UPDATE ON inscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE inscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY inscriptions_lecture ON inscriptions FOR SELECT
  USING (parent_id = app_uid() OR app_is_super() OR (app_is_pro() AND structure_id = app_sid()));
CREATE POLICY inscriptions_creation ON inscriptions FOR INSERT
  WITH CHECK (parent_id = app_uid() AND app_role() = 'PARENT' AND statut = 'DEMANDEE');
CREATE POLICY inscriptions_traitement ON inscriptions FOR UPDATE
  USING (app_is_super() OR (app_is_pro() AND structure_id = app_sid()) OR parent_id = app_uid())
  WITH CHECK (app_is_super() OR (app_is_pro() AND structure_id = app_sid())
              OR (parent_id = app_uid() AND statut IN ('DEMANDEE', 'CLOTUREE')));
CREATE TRIGGER inscriptions_sans_suppression BEFORE DELETE ON inscriptions
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();
