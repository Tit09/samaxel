-- ============================================================================
--  SAMA XHEL Santé — Fonctions métier sécurisées et journal d'audit chaîné
-- ============================================================================

-- ─── Création de la consultation d'une téléconsultation confirmée ───────────
-- Une secrétaire confirme les rendez-vous mais ne peut pas lire/écrire les
-- consultations (secret médical). Cette fonction SECURITY DEFINER crée
-- UNIQUEMENT une consultation vide « PLANIFIEE » liée au rendez-vous, après
-- avoir vérifié que l'appelant est un professionnel de la même structure.
CREATE OR REPLACE FUNCTION creer_consultation_planifiee(p_rdv uuid, p_pro uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r rendez_vous%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO r FROM rendez_vous WHERE id = p_rdv;
  IF NOT FOUND THEN RAISE EXCEPTION 'rendez-vous introuvable' USING ERRCODE = '42501'; END IF;
  IF NOT (app_is_pro() AND r.structure_id = app_sid()) THEN
    RAISE EXCEPTION 'accès refusé' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM membres_structure
                 WHERE user_id = p_pro AND structure_id = r.structure_id AND statut = 'ACTIF'
                   AND role IN ('MEDECIN', 'THERAPEUTE', 'ADMIN_STRUCTURE')) THEN
    RAISE EXCEPTION 'le professionnel doit être un clinicien de la structure' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_id FROM consultations WHERE rdv_id = p_rdv;
  IF FOUND THEN RETURN v_id; END IF;
  INSERT INTO consultations (structure_id, rdv_id, suivi_id, enfant_id, parent_id, professionnel_id,
                             date_consultation, type, statut, visible_parent)
  VALUES (r.structure_id, r.id, r.suivi_id, r.enfant_id, r.parent_id, p_pro,
          coalesce(r.date_confirmee, r.date_souhaitee, NOW()), r.type, 'PLANIFIEE', true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ─── Informations minimales d'une téléconsultation pour rejoindre la salle ──
-- Renvoie la consultation seulement si l'appelant y participe :
--   • le parent de l'enfant, ou
--   • un clinicien (médecin/thérapeute) de la structure active.
CREATE OR REPLACE FUNCTION acces_teleconsultation(p_consultation uuid)
RETURNS TABLE (id uuid, structure_id uuid, type text, statut text, date_consultation timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.structure_id, c.type, c.statut, c.date_consultation
  FROM consultations c
  WHERE c.id = p_consultation
    AND ( (app_role() = 'PARENT' AND c.parent_id = app_uid())
       OR (app_is_clinicien() AND c.structure_id = app_sid()) )
$$;

-- ─── Journal d'audit chaîné (inspiré de la blockchain) ──────────────────────
-- Chaque entrée contient l'empreinte SHA-256 de l'entrée précédente :
-- toute suppression ou modification rompt la chaîne et devient détectable.
ALTER TABLE audit_logs ADD COLUMN hash_precedent text;
ALTER TABLE audit_logs ADD COLUMN hash text;

CREATE OR REPLACE FUNCTION audit_chainer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_prec text;
BEGIN
  -- Verrou : une seule insertion à la fois pour garder une chaîne linéaire
  PERFORM pg_advisory_xact_lock(424242);
  SELECT hash INTO v_prec FROM audit_logs ORDER BY id DESC LIMIT 1;
  NEW.hash_precedent := coalesce(v_prec, 'GENESE');
  NEW.hash := encode(digest(
    concat_ws('|', NEW.hash_precedent, NEW.user_id, NEW.role, NEW.structure_id, NEW.action,
              NEW.ressource, NEW.ressource_id, NEW.ip, NEW.statut_http, NEW.created_at), 'sha256'), 'hex');
  RETURN NEW;
END $$;

CREATE TRIGGER audit_chainage BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_chainer();

-- Vérification de l'intégrité de toute la chaîne (super-administrateur)
CREATE OR REPLACE FUNCTION audit_verifier()
RETURNS TABLE (valide boolean, entrees bigint, premiere_rupture bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
  v_prec text := 'GENESE';
  v_n bigint := 0;
BEGIN
  IF NOT app_is_super() THEN RAISE EXCEPTION 'accès refusé' USING ERRCODE = '42501'; END IF;
  FOR rec IN SELECT * FROM audit_logs ORDER BY id LOOP
    v_n := v_n + 1;
    IF rec.hash_precedent IS DISTINCT FROM v_prec OR rec.hash IS DISTINCT FROM encode(digest(
         concat_ws('|', rec.hash_precedent, rec.user_id, rec.role, rec.structure_id, rec.action,
                   rec.ressource, rec.ressource_id, rec.ip, rec.statut_http, rec.created_at), 'sha256'), 'hex') THEN
      RETURN QUERY SELECT false, v_n, rec.id; RETURN;
    END IF;
    v_prec := rec.hash;
  END LOOP;
  RETURN QUERY SELECT true, v_n, NULL::bigint;
END $$;
