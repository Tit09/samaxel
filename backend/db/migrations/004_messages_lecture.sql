-- ═══════════════════════════════════════════════════════════════════════════
-- 004 — Accusé de lecture des messages
-- La politique unique de 002 exigeait sender_id = utilisateur pour TOUTE écriture :
-- le destinataire ne pouvait donc pas marquer un message comme lu.
-- On sépare les droits : lire / envoyer / accuser réception (lu_at uniquement).
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS messages_acces ON messages;

CREATE POLICY messages_lecture ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id));

CREATE POLICY messages_envoi ON messages FOR INSERT
  WITH CHECK (sender_id = app_uid()
              AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id));

-- Seul le DESTINATAIRE peut modifier un message, et seulement la colonne lu_at
-- (droit de colonne accordé dans scripts/migrate.js). Aucune politique DELETE : effacement impossible.
CREATE POLICY messages_accuse_lecture ON messages FOR UPDATE
  USING (sender_id <> app_uid() AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id))
  WITH CHECK (sender_id <> app_uid() AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id));
