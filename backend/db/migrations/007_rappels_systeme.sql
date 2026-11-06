-- ═══════════════════════════════════════════════════════════════════════════
-- 007 — Tâches « système » (rappels automatiques, USSD) sans ouvrir la RLS.
-- Les rappels ont besoin de DATES et de STATUTS de toutes les structures, jamais du contenu
-- médical : on passe par des fonctions SECURITY DEFINER qui ne renvoient que ces métadonnées.
-- ═══════════════════════════════════════════════════════════════════════════

-- Les notifications sont créées uniquement par le serveur (y compris USSD et rappels, sans utilisateur
-- connecté). La lecture reste strictement limitée à leur destinataire.
DROP POLICY IF EXISTS notifications_creation ON notifications;
CREATE POLICY notifications_creation ON notifications FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION rappel_rdv_24h()
RETURNS TABLE (id uuid, parent_id uuid, date_confirmee timestamptz, type text, structure text, telephone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.parent_id, r.date_confirmee, r.type, s.nom, u.telephone
  FROM rendez_vous r JOIN structures s ON s.id = r.structure_id JOIN users u ON u.id = r.parent_id
  WHERE r.statut = 'CONFIRME' AND r.date_confirmee BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
$$;

CREATE OR REPLACE FUNCTION rappel_urgents_24h()
RETURNS TABLE (id uuid, structure_id uuid, numero_dossier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, structure_id, numero_dossier FROM suivis
  WHERE statut = 'DEMANDE' AND priorite = 'URGENT' AND created_at < NOW() - INTERVAL '24 hours'
$$;

CREATE OR REPLACE FUNCTION rappel_attente_48h()
RETURNS TABLE (structure_id uuid, n int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT structure_id, count(*)::int FROM suivis
  WHERE statut = 'DEMANDE' AND created_at < NOW() - INTERVAL '48 hours' GROUP BY structure_id
$$;

CREATE OR REPLACE FUNCTION rappel_vocaux_24h()
RETURNS TABLE (structure_id uuid, n int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT structure_id, count(*)::int FROM vocaux
  WHERE sens = 'PARENT' AND structure_id IS NOT NULL AND lu_at IS NULL AND created_at < NOW() - INTERVAL '24 hours'
  GROUP BY structure_id
$$;

CREATE OR REPLACE FUNCTION rappel_demandes_24h()
RETURNS TABLE (structure_id uuid, n int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT structure_id, count(*)::int FROM demandes_rappel
  WHERE statut = 'A_RAPPELER' AND created_at < NOW() - INTERVAL '24 hours' GROUP BY structure_id
$$;
