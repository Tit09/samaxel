-- ═══════════════════════════════════════════════════════════════════════════
-- 006 — Dossier médical inviolable, historique des corrections, ordonnances et
--        pharmacies, candidatures des professionnels (pièces + convocation),
--        demandes de rappel (USSD), groupe des parents, rappels automatiques.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. AUCUNE SUPPRESSION de données médicales ─────────────────────────────
-- Même une faille dans l'application ne peut rien effacer : la base refuse.
-- (Les corrections se font par mise à jour, et l'ancienne version est gardée — voir 2.)
CREATE OR REPLACE FUNCTION interdire_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Suppression interdite : % fait partie du dossier médical (archivage uniquement)', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['enfants','consentements','suivis','depistages','humeur_journal','rendez_vous',
                           'consultations','messages','conversations','vocaux','audit_logs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_sans_suppression ON %I', t, t);
    -- Déclencheur « par instruction » : même un DELETE qui ne viserait aucune ligne est refusé
    EXECUTE format('CREATE TRIGGER %I_sans_suppression BEFORE DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression()', t, t);
    EXECUTE format('CREATE TRIGGER %I_sans_vidage BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression()', t, t);
  END LOOP;
END $$;

-- ── 2. Historique des corrections d'une consultation ───────────────────────
-- Toute modification garde la version précédente (qui, quand, quoi) : traçabilité médico-légale.
CREATE TABLE consultations_historique (
  id               bigserial PRIMARY KEY,
  consultation_id  uuid NOT NULL REFERENCES consultations(id),
  version          jsonb NOT NULL,          -- ligne complète AVANT la modification (champs déjà chiffrés)
  modifie_par      uuid,
  modifie_le       timestamptz NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION historiser_consultation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO consultations_historique (consultation_id, version, modifie_par)
  VALUES (OLD.id, to_jsonb(OLD), NULLIF(current_setting('app.user_id', true), '')::uuid);
  RETURN NEW;
END $$;
CREATE TRIGGER consultations_historique AFTER UPDATE ON consultations
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION historiser_consultation();
CREATE TRIGGER consultations_historique_sans_suppression BEFORE DELETE ON consultations_historique FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();
ALTER TABLE consultations_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultations_historique_lecture ON consultations_historique FOR SELECT
  USING (app_is_super() OR EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_id));

-- ── 3. Pharmacies (annuaire OpenStreetMap) et disponibilité déclarée ───────
CREATE TABLE pharmacies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id      text UNIQUE,                 -- identifiant OpenStreetMap (données ODbL)
  nom         text NOT NULL,
  region      text,
  departement text,
  commune     text,
  adresse     text,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  telephone   text,
  de_garde    boolean NOT NULL DEFAULT false,
  partenaire  boolean NOT NULL DEFAULT false,   -- a un compte et déclare ses stocks
  source      text NOT NULL DEFAULT 'OpenStreetMap',
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX pharmacies_region_idx ON pharmacies (region);

-- Disponibilité d'un médicament, DÉCLARÉE par la pharmacie partenaire (jamais devinée)
CREATE TABLE pharmacie_stocks (
  pharmacie_id  uuid NOT NULL REFERENCES pharmacies(id),
  dci           text NOT NULL,             -- dénomination commune internationale, en minuscules
  disponible    boolean NOT NULL DEFAULT true,
  mis_a_jour_le timestamptz NOT NULL DEFAULT NOW(),
  declare_par   uuid REFERENCES users(id),
  PRIMARY KEY (pharmacie_id, dci)
);
-- Annuaire public : lecture libre, écriture réservée au super-administrateur (et plus tard aux pharmaciens)
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharmacies_lecture ON pharmacies FOR SELECT USING (true);
CREATE POLICY pharmacies_ecriture ON pharmacies FOR ALL USING (app_is_super()) WITH CHECK (app_is_super());
ALTER TABLE pharmacie_stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY stocks_lecture ON pharmacie_stocks FOR SELECT USING (true);
CREATE POLICY stocks_ecriture ON pharmacie_stocks FOR ALL USING (app_is_super()) WITH CHECK (app_is_super());

-- ── 4. Ordonnances (secret médical, jamais supprimées) ─────────────────────
CREATE TABLE ordonnances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id  uuid REFERENCES consultations(id),
  structure_id     uuid NOT NULL REFERENCES structures(id),
  enfant_id        uuid NOT NULL REFERENCES enfants(id),
  parent_id        uuid NOT NULL REFERENCES users(id),
  prescripteur_id  uuid NOT NULL REFERENCES users(id),
  lignes_chiffrees text NOT NULL,          -- [{dci, forme, posologie, duree}] chiffré AES-256-GCM
  dci              text[] NOT NULL,        -- DCI en clair, sans posologie : sert à chercher les pharmacies
  delivrance_structure boolean NOT NULL DEFAULT false, -- médicament délivré uniquement par la structure (ex. méthadone au CEPIAD)
  created_at       timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX ordonnances_enfant_idx ON ordonnances (enfant_id, created_at DESC);
ALTER TABLE ordonnances ENABLE ROW LEVEL SECURITY;
CREATE POLICY ordonnances_lecture ON ordonnances FOR SELECT
  USING (parent_id = app_uid() OR (app_is_clinicien() AND structure_id = app_sid()));
CREATE POLICY ordonnances_creation ON ordonnances FOR INSERT
  WITH CHECK (app_role() = 'MEDECIN' AND prescripteur_id = app_uid() AND structure_id = app_sid());
CREATE TRIGGER ordonnances_sans_suppression BEFORE DELETE ON ordonnances FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

-- ── 5. Candidatures des professionnels : pièces justificatives + convocation ─
ALTER TABLE membres_structure DROP CONSTRAINT IF EXISTS membres_structure_statut_check;
ALTER TABLE membres_structure ADD CONSTRAINT membres_structure_statut_check
  CHECK (statut IN ('EN_ATTENTE', 'CONVOQUE', 'ACTIF', 'REFUSE', 'SUSPENDU'));
ALTER TABLE membres_structure
  ADD COLUMN convocation_date  timestamptz,
  ADD COLUMN convocation_lieu  text,
  ADD COLUMN decision_motif    text,
  ADD COLUMN decision_le       timestamptz;

CREATE TABLE pieces_justificatives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  type          text NOT NULL CHECK (type IN ('DIPLOME', 'ORDRE', 'IDENTITE', 'CV', 'ATTESTATION')),
  nom_fichier   text NOT NULL,
  mime          text NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png')),
  taille        integer NOT NULL,
  sha256        text NOT NULL,              -- empreinte : prouve que la pièce n'a pas été modifiée
  contenu_chiffre bytea NOT NULL,           -- iv | tag | contenu (AES-256-GCM)
  statut        text NOT NULL DEFAULT 'A_VERIFIER' CHECK (statut IN ('A_VERIFIER', 'CONFORME', 'NON_CONFORME')),
  verifie_par   uuid REFERENCES users(id),
  verifie_le    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX pieces_user_idx ON pieces_justificatives (user_id);
ALTER TABLE pieces_justificatives ENABLE ROW LEVEL SECURITY;
-- Le candidat voit ses pièces ; l'admin de la structure où il postule et le super-admin les examinent.
CREATE POLICY pieces_lecture ON pieces_justificatives FOR SELECT
  USING (user_id = app_uid() OR app_is_super()
         OR (app_role() = 'ADMIN_STRUCTURE' AND EXISTS (
               SELECT 1 FROM membres_structure m WHERE m.user_id = pieces_justificatives.user_id AND m.structure_id = app_sid())));
-- Dépôt : par le candidat connecté, ou lors de l'inscription depuis le site (pas encore de session = ANONYME)
CREATE POLICY pieces_depot ON pieces_justificatives FOR INSERT WITH CHECK (user_id = app_uid() OR app_role() = 'ANONYME');
CREATE POLICY pieces_verification ON pieces_justificatives FOR UPDATE
  USING (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND EXISTS (
           SELECT 1 FROM membres_structure m WHERE m.user_id = pieces_justificatives.user_id AND m.structure_id = app_sid())))
  WITH CHECK (true);
CREATE TRIGGER pieces_sans_suppression BEFORE DELETE ON pieces_justificatives FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

-- ── 6. Demandes de rappel (parents sans smartphone : USSD *xxx#) ───────────
CREATE TABLE demandes_rappel (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telephone_chiffre text NOT NULL,
  telephone_index   text NOT NULL,          -- index aveugle (HMAC) pour limiter les abus sans stocker en clair
  region        text,
  structure_id  uuid REFERENCES structures(id),
  canal         text NOT NULL DEFAULT 'USSD',
  langue        text,
  statut        text NOT NULL DEFAULT 'A_RAPPELER' CHECK (statut IN ('A_RAPPELER', 'RAPPELE', 'INJOIGNABLE')),
  traite_par    uuid REFERENCES users(id),
  traite_le     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE demandes_rappel ENABLE ROW LEVEL SECURITY;
CREATE POLICY rappel_lecture ON demandes_rappel FOR SELECT
  USING (app_is_super() OR (app_is_pro() AND structure_id = app_sid()));
CREATE POLICY rappel_creation ON demandes_rappel FOR INSERT WITH CHECK (true);
CREATE POLICY rappel_traitement ON demandes_rappel FOR UPDATE
  USING (app_is_pro() AND structure_id = app_sid()) WITH CHECK (app_is_pro() AND structure_id = app_sid());

-- ── 7. Groupe des parents (entraide, modéré, sans donnée médicale) ──────────
CREATE TABLE communaute_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auteur_id   uuid NOT NULL REFERENCES users(id),
  pseudo      text NOT NULL,               -- prénom + région, jamais le nom complet ni le téléphone
  texte       text NOT NULL CHECK (length(texte) BETWEEN 1 AND 1000),
  masque      boolean NOT NULL DEFAULT false,
  masque_par  uuid REFERENCES users(id),
  motif_masquage text,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX communaute_idx ON communaute_messages (created_at DESC);
ALTER TABLE communaute_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY communaute_lecture ON communaute_messages FOR SELECT
  USING ((NOT masque AND app_uid() IS NOT NULL) OR app_is_super() OR auteur_id = app_uid());
CREATE POLICY communaute_ecriture ON communaute_messages FOR INSERT
  WITH CHECK (auteur_id = app_uid() AND app_role() IN ('PARENT', 'SUPER_ADMIN'));
CREATE POLICY communaute_moderation ON communaute_messages FOR UPDATE USING (app_is_super()) WITH CHECK (app_is_super());
CREATE TRIGGER communaute_sans_suppression BEFORE DELETE ON communaute_messages FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

-- ── 8. Rappels automatiques déjà envoyés (évite d'envoyer deux fois le même) ─
CREATE TABLE rappels_envoyes (
  cle        text PRIMARY KEY,               -- ex. « rdv24h:<id> », « attente48h:<suivi> »
  envoye_le  timestamptz NOT NULL DEFAULT NOW()
);
