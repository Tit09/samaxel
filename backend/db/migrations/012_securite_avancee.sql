-- ============================================================================
--  012 — Sécurité avancée : ancrage blockchain et IA prédictive
--
--  1. ANCRAGE : chaque jour, l'empreinte du dernier maillon du journal d'audit chaîné
--     (migration 003) est horodatée dans la blockchain Bitcoin via OpenTimestamps.
--     Comme chaque maillon contient l'empreinte du précédent, cette seule empreinte
--     scelle tout l'historique : même l'administrateur du serveur ne peut plus le réécrire
--     sans que la vérification échoue. Aucune donnée ne quitte le serveur, seulement 32 octets.
--  2. ALERTES DE SÉCURITÉ : accès anormaux détectés par l'IA (comportement inhabituel).
--  3. RISQUE D'ABSENCE : score prédictif sur chaque rendez-vous confirmé.
-- ============================================================================

CREATE TABLE ancrages (
  id             bigserial PRIMARY KEY,
  dernier_audit  bigint NOT NULL,          -- id du dernier maillon scellé
  empreinte      text NOT NULL,            -- hash SHA-256 de ce maillon (hexadécimal)
  calendrier     text NOT NULL,            -- serveur OpenTimestamps qui a reçu l'empreinte
  preuve         bytea,                    -- fichier .ots (vérifiable avec l'outil officiel « ots verify »)
  statut         text NOT NULL CHECK (statut IN ('EN_ATTENTE', 'CONFIRME', 'ECHEC')),
  erreur         text,
  created_at     timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX ancrages_date_idx ON ancrages (created_at DESC);
ALTER TABLE ancrages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ancrages_lecture ON ancrages FOR SELECT USING (app_is_super());
CREATE TRIGGER ancrages_sans_suppression BEFORE DELETE ON ancrages FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

-- Dernier maillon du journal (lu par le service d'ancrage, hors session utilisateur)
CREATE OR REPLACE FUNCTION audit_dernier_maillon()
RETURNS TABLE (id bigint, hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, hash FROM audit_logs ORDER BY id DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION ancrage_enregistrer(p_dernier bigint, p_empreinte text, p_calendrier text,
                                               p_preuve bytea, p_statut text, p_erreur text)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO ancrages (dernier_audit, empreinte, calendrier, preuve, statut, erreur)
  VALUES (p_dernier, p_empreinte, p_calendrier, p_preuve, p_statut, p_erreur) RETURNING id
$$;

-- ── Alertes de sécurité (IA de détection d'accès anormaux) ─────────────────
CREATE TABLE alertes_securite (
  id            bigserial PRIMARY KEY,
  user_id       uuid REFERENCES users(id),
  structure_id  uuid REFERENCES structures(id),
  type          text NOT NULL CHECK (type IN ('VOLUME_INHABITUEL', 'HORAIRE_INHABITUEL', 'REFUS_REPETES', 'NOUVELLE_ADRESSE_IP')),
  score         numeric(6, 2) NOT NULL,   -- écart à l'habitude (score z) ou nombre d'événements
  details       jsonb NOT NULL DEFAULT '{}',  -- compteurs seulement, jamais de donnée médicale
  statut        text NOT NULL DEFAULT 'NOUVELLE' CHECK (statut IN ('NOUVELLE', 'VUE', 'FAUX_POSITIF', 'CONFIRMEE')),
  traitee_par   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX alertes_securite_idx ON alertes_securite (statut, created_at DESC);
ALTER TABLE alertes_securite ENABLE ROW LEVEL SECURITY;
CREATE POLICY alertes_lecture ON alertes_securite FOR SELECT
  USING (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()));
CREATE POLICY alertes_traitement ON alertes_securite FOR UPDATE
  USING (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()))
  WITH CHECK (app_is_super() OR (app_role() = 'ADMIN_STRUCTURE' AND structure_id = app_sid()));
CREATE POLICY alertes_creation ON alertes_securite FOR INSERT WITH CHECK (true);
CREATE TRIGGER alertes_sans_suppression BEFORE DELETE ON alertes_securite FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();

/*
 * Comportement d'accès de chaque professionnel : l'heure en cours comparée à ses 30 derniers jours.
 * Ne renvoie que des COMPTEURS (aucun identifiant de dossier, aucun contenu).
 */
CREATE OR REPLACE FUNCTION ia_profils_acces(p_fenetre interval DEFAULT '1 hour')
RETURNS TABLE (user_id uuid, structure_id uuid, lectures int, refus int, heure int, ips_nouvelles int,
               moyenne numeric, ecart numeric, jours_historique int, part_heure numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH recent AS (
    SELECT a.user_id, a.structure_id,
           count(*) FILTER (WHERE a.action IN ('LECTURE', 'EXPORT'))::int AS lectures,
           count(*) FILTER (WHERE a.statut_http IN (401, 403, 404))::int AS refus,
           extract(hour FROM max(a.created_at) AT TIME ZONE 'Africa/Dakar')::int AS heure,
           count(DISTINCT a.ip) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM audit_logs b WHERE b.user_id = a.user_id AND b.ip = a.ip
               AND b.created_at < NOW() - p_fenetre AND b.created_at > NOW() - INTERVAL '30 days'))::int AS ips_nouvelles
      FROM audit_logs a
     WHERE a.created_at > NOW() - p_fenetre AND a.user_id IS NOT NULL
       AND a.role IN ('MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE')
     GROUP BY a.user_id, a.structure_id
  ), histo AS (
    SELECT h.user_id, date_trunc('hour', h.created_at) AS tranche,
           count(*) FILTER (WHERE h.action IN ('LECTURE', 'EXPORT')) AS n,
           extract(hour FROM h.created_at AT TIME ZONE 'Africa/Dakar')::int AS heure
      FROM audit_logs h
     WHERE h.created_at BETWEEN NOW() - INTERVAL '30 days' AND NOW() - p_fenetre
       AND h.user_id IN (SELECT user_id FROM recent)
     GROUP BY h.user_id, 2, 4
  )
  SELECT r.user_id, r.structure_id, r.lectures, r.refus, r.heure, r.ips_nouvelles,
         coalesce(avg(h.n), 0), coalesce(stddev_pop(h.n), 0),
         count(DISTINCT date_trunc('day', h.tranche))::int,
         coalesce(count(*) FILTER (WHERE h.heure = r.heure)::numeric / nullif(count(h.n), 0), 0)
    FROM recent r LEFT JOIN histo h ON h.user_id = r.user_id
   GROUP BY r.user_id, r.structure_id, r.lectures, r.refus, r.heure, r.ips_nouvelles
$$;

-- ── Risque d'absence à un rendez-vous (IA prédictive) ──────────────────────
ALTER TABLE rendez_vous
  ADD COLUMN risque_absence smallint CHECK (risque_absence BETWEEN 0 AND 100),
  ADD COLUMN risque_facteurs jsonb;

-- Caractéristiques de chaque rendez-vous confirmé à venir (métadonnées, pas de contenu médical)
CREATE OR REPLACE FUNCTION ia_rdv_a_evaluer()
RETURNS TABLE (id uuid, parent_id uuid, type text, delai_jours numeric, absences int, honores int,
               premier boolean, telegram boolean, whatsapp boolean, derniere_connexion_jours numeric,
               distance_km numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.parent_id, r.type,
         extract(epoch FROM (r.date_confirmee - r.created_at)) / 86400,
         (SELECT count(*) FROM rendez_vous x WHERE x.parent_id = r.parent_id AND x.statut = 'ABSENT')::int,
         (SELECT count(*) FROM rendez_vous x WHERE x.parent_id = r.parent_id AND x.statut = 'TERMINE')::int,
         NOT EXISTS (SELECT 1 FROM rendez_vous x WHERE x.parent_id = r.parent_id AND x.structure_id = r.structure_id
                       AND x.statut = 'TERMINE'),
         u.telegram_chat_id IS NOT NULL, u.whatsapp_accepte,
         extract(epoch FROM (NOW() - coalesce(u.derniere_connexion, u.created_at))) / 86400,
         NULL::numeric
    FROM rendez_vous r JOIN users u ON u.id = r.parent_id
   WHERE r.statut = 'CONFIRME' AND r.date_confirmee > NOW()
$$;

CREATE OR REPLACE FUNCTION ia_rdv_noter(p_id uuid, p_risque smallint, p_facteurs jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE rendez_vous SET risque_absence = p_risque, risque_facteurs = p_facteurs WHERE id = p_id
$$;

-- Rendez-vous à risque dans les 48 h (rappel anticipé, multi-canal)
CREATE OR REPLACE FUNCTION rappel_rdv_48h_risque(p_seuil int)
RETURNS TABLE (id uuid, parent_id uuid, date_confirmee timestamptz, type text, structure text, telephone text, risque smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.parent_id, r.date_confirmee, r.type, s.nom, u.telephone, r.risque_absence
    FROM rendez_vous r JOIN structures s ON s.id = r.structure_id JOIN users u ON u.id = r.parent_id
   WHERE r.statut = 'CONFIRME' AND r.risque_absence >= p_seuil
     AND r.date_confirmee BETWEEN NOW() + INTERVAL '24 hours' AND NOW() + INTERVAL '48 hours'
$$;
