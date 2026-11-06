-- Compteurs agrégés pour la supervision : la RLS empêche (à juste titre) le super-admin de lire vocaux et
-- demandes de rappel. Cette fonction ne renvoie que des nombres, jamais de contenu (CDP, minimisation, art. 35).
CREATE OR REPLACE FUNCTION supervision_compteurs() RETURNS TABLE (vocaux_7j int, vocaux_non_attribues int, rappels_en_attente int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::int FROM vocaux WHERE sens = 'PARENT' AND created_at > NOW() - INTERVAL '7 days'),
    (SELECT count(*)::int FROM vocaux WHERE sens = 'PARENT' AND structure_id IS NULL AND created_at > NOW() - INTERVAL '7 days'),
    (SELECT count(*)::int FROM demandes_rappel WHERE statut = 'A_RAPPELER');
$$;
REVOKE ALL ON FUNCTION supervision_compteurs() FROM PUBLIC;
-- L'exécution est accordée au rôle applicatif par scripts/migrate.js (GRANT EXECUTE ON ALL FUNCTIONS).
