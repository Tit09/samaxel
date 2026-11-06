-- ============================================================================
--  015 — Caisse, tickets et file d'attente (numérisation de l'entrée des hôpitaux)
--
--  Parcours réel dans les hôpitaux de santé mentale (Fann, CEPIAD…) :
--    1. le patient arrive et paie un TICKET à la caisse de l'entrée ;
--    2. on lui indique OÙ aller (service, bureau) ;
--    3. il attend qu'on appelle son NUMÉRO.
--  Ici :
--    • chaque établissement fixe ses TARIFS (ticket d'entrée, consultation, bilan…) ;
--    • la caisse (accueil / secrétariat) encaisse en espèces, Wave ou Orange Money
--      et remet un ticket numéroté (A-001, A-002… remis à zéro chaque jour par service) ;
--    • une famille peut payer d'avance dans l'application (Wave / OM) : le ticket est
--      « À CONFIRMER » jusqu'à ce que la caisse vérifie le paiement ;
--    • l'écran de la salle d'attente n'affiche que des NUMÉROS (jamais de nom) ;
--    • le REGISTRE remplace les fichiers Excel : patients venus sans l'application,
--      importables depuis Excel, noms et téléphones chiffrés (AES-256-GCM).
--  Aucune ligne de caisse ne peut être supprimée (traçabilité comptable).
-- ============================================================================

-- ── 1. Tarifs ──────────────────────────────────────────────────────────────
CREATE TABLE tarifs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  uuid NOT NULL REFERENCES structures(id),
  service_id    uuid REFERENCES services(id),
  code          text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  libelle       text NOT NULL,
  montant       integer NOT NULL CHECK (montant >= 0 AND montant <= 10000000),  -- en francs CFA
  orientation   text,           -- « Bâtiment B, bureau 3 » : affiché sur le ticket
  prefixe       text NOT NULL DEFAULT 'A' CHECK (prefixe ~ '^[A-Z]{1,2}$'),
  en_ligne      boolean NOT NULL DEFAULT true,   -- payable d'avance dans l'application
  actif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (structure_id, code)
);
ALTER TABLE tarifs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tarifs_lecture ON tarifs FOR SELECT USING (true);   -- prix publics
CREATE POLICY tarifs_gestion ON tarifs FOR ALL
  USING (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()))
  WITH CHECK (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()));

-- ── 2. Registre des patients venus sans l'application (remplace Excel) ─────
CREATE SEQUENCE registre_seq;
CREATE TABLE patients_registre (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id       uuid NOT NULL REFERENCES structures(id),
  numero             text NOT NULL DEFAULT ('R-' || lpad(nextval('registre_seq')::text, 6, '0')),
  prenom_chiffre     text NOT NULL,
  nom_chiffre        text NOT NULL,
  telephone_chiffre  text,
  telephone_index    text,            -- index aveugle (HMAC) pour retrouver par téléphone
  date_naissance     date,
  sexe               text CHECK (sexe IN ('M', 'F')),
  notes_chiffre      text,
  origine            text NOT NULL DEFAULT 'CAISSE' CHECK (origine IN ('CAISSE', 'IMPORT_EXCEL')),
  cree_par           uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (structure_id, numero)
);
CREATE INDEX patients_registre_tel_idx ON patients_registre (structure_id, telephone_index);
ALTER TABLE patients_registre ENABLE ROW LEVEL SECURITY;
CREATE POLICY registre_structure ON patients_registre FOR ALL
  USING (app_is_super() OR (app_is_pro() AND structure_id = app_sid()))
  WITH CHECK (app_is_pro() AND structure_id = app_sid());
CREATE TRIGGER registre_sans_suppression BEFORE DELETE ON patients_registre
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

-- ── 3. Tickets ─────────────────────────────────────────────────────────────
CREATE TABLE tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id    uuid NOT NULL REFERENCES structures(id),
  tarif_id        uuid NOT NULL REFERENCES tarifs(id),
  service_id      uuid REFERENCES services(id),
  jour            date NOT NULL DEFAULT (NOW() AT TIME ZONE 'Africa/Dakar')::date,
  rang            integer NOT NULL,
  numero          text NOT NULL,                    -- « A-007 »
  montant         integer NOT NULL CHECK (montant >= 0),
  -- Qui ? un compte SAMA XHEL (famille + personne suivie) OU une ligne du registre
  parent_id       uuid REFERENCES users(id),
  personne_id     uuid REFERENCES enfants(id),
  registre_id     uuid REFERENCES patients_registre(id),
  rdv_id          uuid REFERENCES rendez_vous(id),
  mode_paiement   text NOT NULL CHECK (mode_paiement IN ('ESPECES', 'WAVE', 'ORANGE_MONEY', 'GRATUIT')),
  reference       text,                             -- référence de la transaction Wave / OM
  statut          text NOT NULL DEFAULT 'PAYE'
                  CHECK (statut IN ('A_CONFIRMER', 'PAYE', 'APPELE', 'EN_CONSULTATION', 'TERMINE', 'ANNULE', 'REFUSE')),
  orientation     text,
  bureau          text,                             -- bureau où il est appelé
  encaisse_par    uuid REFERENCES users(id),
  encaisse_le     timestamptz,
  appele_par      uuid REFERENCES users(id),
  appele_le       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (structure_id, jour, numero),
  CHECK (parent_id IS NOT NULL OR registre_id IS NOT NULL)
);
CREATE INDEX tickets_file_idx ON tickets (structure_id, jour, statut, rang);
CREATE INDEX tickets_parent_idx ON tickets (parent_id) WHERE parent_id IS NOT NULL;
CREATE TRIGGER tickets_updated BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_lecture ON tickets FOR SELECT
  USING (parent_id = app_uid() OR app_is_super() OR (app_is_pro() AND structure_id = app_sid()));
CREATE POLICY tickets_creation ON tickets FOR INSERT
  WITH CHECK ((app_is_pro() AND structure_id = app_sid())
              OR (app_role() = 'PARENT' AND parent_id = app_uid() AND statut = 'A_CONFIRMER'));
CREATE POLICY tickets_mise_a_jour ON tickets FOR UPDATE
  USING (app_is_pro() AND structure_id = app_sid())
  WITH CHECK (app_is_pro() AND structure_id = app_sid());
CREATE TRIGGER tickets_sans_suppression BEFORE DELETE ON tickets
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

-- Numéro du jour : A-001, A-002… par établissement et par préfixe (verrou consultatif
-- pour que deux caisses n'attribuent jamais le même numéro).
CREATE OR REPLACE FUNCTION ticket_prochain_rang(p_structure uuid, p_prefixe text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_structure::text || p_prefixe));
  SELECT COALESCE(MAX(rang), 0) + 1 INTO r FROM tickets
   WHERE structure_id = p_structure AND jour = (NOW() AT TIME ZONE 'Africa/Dakar')::date
     AND numero LIKE p_prefixe || '-%';
  RETURN r;
END $$;

-- Écran de la salle d'attente (public, par code d'établissement) : NUMÉROS seulement.
CREATE OR REPLACE FUNCTION file_publique(p_code text)
RETURNS TABLE (numero text, statut text, bureau text, appele_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.numero, t.statut, t.bureau, t.appele_le
    FROM tickets t JOIN structures s ON s.id = t.structure_id
   WHERE s.code = p_code AND t.jour = (NOW() AT TIME ZONE 'Africa/Dakar')::date
     AND t.statut IN ('PAYE', 'APPELE', 'EN_CONSULTATION')
   ORDER BY (t.statut = 'PAYE'), t.appele_le DESC NULLS LAST, t.rang
   LIMIT 40
$$;

-- Médecins visibles par une famille : uniquement ceux de l'établissement où elle est
-- inscrite et acceptée (nom, rôle, spécialité — aucune donnée personnelle).
CREATE OR REPLACE FUNCTION soignants_pour_famille(p_structure uuid)
RETURNS TABLE (id uuid, prenom text, nom text, role text, specialite text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.prenom, u.nom, m.role, m.specialite
    FROM membres_structure m JOIN users u ON u.id = m.user_id
   WHERE m.structure_id = p_structure AND m.statut = 'ACTIF' AND u.is_active
     AND m.role IN ('MEDECIN', 'THERAPEUTE')
     AND EXISTS (SELECT 1 FROM inscriptions i
                  WHERE i.structure_id = p_structure AND i.parent_id = app_uid() AND i.statut = 'ACTIVE')
   ORDER BY m.role, u.nom
$$;
