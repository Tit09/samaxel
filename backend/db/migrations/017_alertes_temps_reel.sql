-- ═══════════════════════════════════════════════════════════════════════════
-- 017 — Supervision en temps réel
-- Nouveaux types d'alertes, déclenchées immédiatement (et plus seulement par
-- l'analyse périodique des accès) :
--   • COMPTE_VERROUILLE : 5 mots de passe faux de suite (attaque par force brute ?)
--   • JOURNAL_ALTERE    : la chaîne SHA-256 du journal d'audit est rompue
-- Les alertes ne contiennent que des compteurs : jamais de donnée médicale.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE alertes_securite DROP CONSTRAINT IF EXISTS alertes_securite_type_check;
ALTER TABLE alertes_securite ADD CONSTRAINT alertes_securite_type_check CHECK (type IN (
  'VOLUME_INHABITUEL', 'HORAIRE_INHABITUEL', 'REFUS_REPETES', 'NOUVELLE_ADRESSE_IP',
  'COMPTE_VERROUILLE', 'JOURNAL_ALTERE'));

-- Création d'une alerte par le système (connexion, tâches périodiques), qui n'a pas le droit
-- de LIRE les alertes : fonction dédiée, qui renvoie seulement la ligne créée.
CREATE OR REPLACE FUNCTION alerte_creer(p_user uuid, p_structure uuid, p_type text, p_score numeric, p_details jsonb)
RETURNS TABLE (id bigint, type text, score numeric, statut text, created_at timestamptz, structure_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO alertes_securite (user_id, structure_id, type, score, details)
  VALUES (p_user, p_structure, p_type, p_score, COALESCE(p_details, '{}'::jsonb))
  RETURNING id, type, score, statut, created_at, structure_id;
$$;
REVOKE ALL ON FUNCTION alerte_creer(uuid, uuid, text, numeric, jsonb) FROM PUBLIC;
