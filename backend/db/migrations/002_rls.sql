-- ============================================================================
--  SAMA XHEL Santé — Row Level Security (isolation multi-tenant)
--
--  À chaque requête HTTP authentifiée, l'API ouvre une transaction et pose :
--     app.user_id       → l'utilisateur connecté
--     app.role          → PARENT | MEDECIN | THERAPEUTE | SECRETAIRE | ADMIN_STRUCTURE | SUPER_ADMIN
--     app.structure_id  → la structure ACTIVE (en-tête X-Structure-Id)
--
--  Règles de cloisonnement (cahier des charges, F8) :
--   • Un professionnel ne voit QUE les données de sa structure active.
--   • Un parent ne voit QUE ses propres données ; s'il a choisi une structure
--     active, il ne voit que le dossier de cette structure.
--   • Seuls les cliniciens (MEDECIN, THERAPEUTE) lisent les consultations :
--     une secrétaire gère les rendez-vous mais n'accède pas au secret médical.
--
--  Même si un contrôleur oublie un filtre (bug), PostgreSQL refuse les lignes
--  d'une autre structure ou d'un autre parent.
--
--  ⚠ La RLS ne s'applique ni au propriétaire des tables ni aux superutilisateurs :
--    l'API se connecte avec le rôle applicatif (APP_DB_USER), jamais avec postgres.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_sid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.structure_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), 'ANONYME')
$$;

CREATE OR REPLACE FUNCTION app_is_super() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app_role() = 'SUPER_ADMIN' $$;

CREATE OR REPLACE FUNCTION app_is_pro() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_role() IN ('MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE') AND app_sid() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app_is_clinicien() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_role() IN ('MEDECIN', 'THERAPEUTE') AND app_sid() IS NOT NULL
$$;

-- Le parent connecté, dans le périmètre de sa structure active (si choisie)
CREATE OR REPLACE FUNCTION app_parent_de(p_parent uuid, p_structure uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_role() = 'PARENT' AND p_parent = app_uid()
         AND (app_sid() IS NULL OR p_structure = app_sid())
$$;

-- La structure active suit-elle cet enfant ? (professionnels uniquement)
CREATE OR REPLACE FUNCTION app_structure_suit(p_enfant uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_is_pro() AND EXISTS (
    SELECT 1 FROM suivis s
    WHERE s.enfant_id = p_enfant
      AND s.structure_id = app_sid()
      AND s.statut <> 'REFUSE'
  )
$$;

-- ─── enfants (appartiennent au parent, visibles des structures qui les suivent)
ALTER TABLE enfants ENABLE ROW LEVEL SECURITY;
CREATE POLICY enfants_acces ON enfants
  USING      ((app_role() = 'PARENT' AND parent_id = app_uid()) OR app_is_super() OR app_structure_suit(id))
  WITH CHECK ((app_role() = 'PARENT' AND parent_id = app_uid()) OR app_is_super());

-- ─── consentements ──────────────────────────────────────────────────────────
ALTER TABLE consentements ENABLE ROW LEVEL SECURITY;
CREATE POLICY consentements_acces ON consentements
  USING      ((app_role() = 'PARENT' AND parent_id = app_uid()) OR app_is_super()
              OR (enfant_id IS NOT NULL AND app_structure_suit(enfant_id)))
  WITH CHECK (parent_id = app_uid());

-- ─── suivis (= dossier de l'enfant DANS une structure) ──────────────────────
ALTER TABLE suivis ENABLE ROW LEVEL SECURITY;
CREATE POLICY suivis_acces ON suivis
  USING      (app_parent_de(parent_id, structure_id)
              OR (app_is_pro() AND structure_id = app_sid()) OR app_is_super())
  WITH CHECK (app_parent_de(parent_id, structure_id)
              OR (app_is_pro() AND structure_id = app_sid()) OR app_is_super());

-- ─── depistages (questionnaires du parent) ──────────────────────────────────
ALTER TABLE depistages ENABLE ROW LEVEL SECURITY;
CREATE POLICY depistages_acces ON depistages
  USING      ((app_role() = 'PARENT' AND parent_id = app_uid()) OR app_is_super()
              OR (enfant_id IS NOT NULL AND app_structure_suit(enfant_id)))
  WITH CHECK (app_role() = 'PARENT' AND parent_id = app_uid());

-- ─── humeur_journal ─────────────────────────────────────────────────────────
ALTER TABLE humeur_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY humeur_acces ON humeur_journal
  USING      ((app_role() = 'PARENT' AND parent_id = app_uid()) OR app_is_super()
              OR (enfant_id IS NOT NULL AND app_is_clinicien() AND app_structure_suit(enfant_id)))
  WITH CHECK (app_role() = 'PARENT' AND parent_id = app_uid());

-- ─── rendez_vous ────────────────────────────────────────────────────────────
ALTER TABLE rendez_vous ENABLE ROW LEVEL SECURITY;
CREATE POLICY rdv_acces ON rendez_vous
  USING      (app_parent_de(parent_id, structure_id)
              OR (app_is_pro() AND structure_id = app_sid()) OR app_is_super())
  WITH CHECK (app_parent_de(parent_id, structure_id)
              OR (app_is_pro() AND structure_id = app_sid()) OR app_is_super());

-- ─── consultations (secret médical : cliniciens seulement) ──────────────────
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultations_clinicien ON consultations
  USING      ((app_is_clinicien() AND structure_id = app_sid()) OR app_is_super())
  WITH CHECK ((app_is_clinicien() AND structure_id = app_sid()) OR app_is_super());
-- Le parent ne voit que les consultations partagées avec lui, en lecture seule
CREATE POLICY consultations_parent ON consultations FOR SELECT
  USING (app_parent_de(parent_id, structure_id) AND visible_parent);

-- ─── conversations / messages (cloisonnées par structure) ───────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_acces ON conversations
  USING      (app_parent_de(parent_id, structure_id)
              OR (app_is_pro() AND professionnel_id = app_uid() AND structure_id = app_sid()))
  WITH CHECK (app_parent_de(parent_id, structure_id)
              OR (app_is_pro() AND professionnel_id = app_uid() AND structure_id = app_sid()));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- La sous-requête sur conversations est elle-même filtrée par la RLS ci-dessus
CREATE POLICY messages_acces ON messages
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id))
  WITH CHECK (sender_id = app_uid()
              AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id));

-- ─── notifications / device_tokens ──────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_lecture  ON notifications FOR SELECT USING (user_id = app_uid());
CREATE POLICY notifications_maj      ON notifications FOR UPDATE USING (user_id = app_uid());
CREATE POLICY notifications_creation ON notifications FOR INSERT WITH CHECK (app_uid() IS NOT NULL);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY devices_acces ON device_tokens
  USING (user_id = app_uid()) WITH CHECK (user_id = app_uid());

-- Jetons push d'un autre utilisateur (pour lui envoyer une notification).
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire, mais ne renvoie
-- QUE les jetons, rien d'autre.
CREATE OR REPLACE FUNCTION jetons_push(p_user uuid)
RETURNS TABLE (token text, plateforme text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT token, plateforme FROM device_tokens WHERE user_id = p_user
$$;
