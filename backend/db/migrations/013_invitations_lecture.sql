-- 013 — Lecture d'une invitation par son jeton (personne pas encore connectée).
-- La table invitations reste protégée par la RLS ; cette fonction ne renvoie que l'invitation
-- dont on possède le jeton (empreinte SHA-256), et seulement des informations non sensibles.
CREATE OR REPLACE FUNCTION invitation_lire(p_jeton_hash text)
RETURNS TABLE (role text, destinataire text, expire_le timestamptz, utilisee_le timestamptz,
               nom text, code text, logo_url text, couleur text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.role, i.destinataire, i.expire_le, i.utilisee_le, s.nom, s.code, s.logo_url, s.couleur
    FROM invitations i JOIN structures s ON s.id = i.structure_id
   WHERE i.jeton_hash = p_jeton_hash
$$;
