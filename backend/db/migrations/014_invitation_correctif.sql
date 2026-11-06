-- 014 — Correctif : dans utiliser_invitation, les colonnes de sortie (structure_id, role…)
-- portent le même nom que des colonnes de table ; on indique à PL/pgSQL de privilégier les colonnes.
CREATE OR REPLACE FUNCTION utiliser_invitation(p_jeton_hash text, p_user uuid)
RETURNS TABLE (structure_id uuid, service_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
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
