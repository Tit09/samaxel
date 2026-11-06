-- ═══════════════════════════════════════════════════════════════════════════
-- 016 — Messagerie sur tous les appareils, messages vocaux, appels audio/vidéo
--
-- 1. Sauvegarde de la clé de messagerie : la clé PRIVÉE de l'utilisateur est chiffrée
--    SUR SON APPAREIL avec une clé tirée de son mot de passe (PBKDF2-SHA256), puis
--    déposée ici. Le serveur ne connaît pas le mot de passe (seulement son empreinte
--    Argon2id) : il ne peut pas ouvrir cette sauvegarde. Sur un nouvel appareil, la
--    connexion avec le mot de passe la rouvre → les anciens messages restent lisibles.
-- 2. Messages vocaux : même chiffrement de bout en bout que le texte (type AUDIO).
-- 3. Journal des appels (qui, quand, audio ou vidéo, décroché ou manqué) — jamais le contenu.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS cle_messagerie_sauvegarde jsonb;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'TEXTE';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS duree_s smallint;
DO $$ BEGIN
  ALTER TABLE messages ADD CONSTRAINT messages_type_ck CHECK (type IN ('TEXTE', 'AUDIO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS appels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  appelant_id     uuid NOT NULL REFERENCES users(id),
  mode            text NOT NULL CHECK (mode IN ('AUDIO', 'VIDEO')),
  statut          text NOT NULL DEFAULT 'SONNE' CHECK (statut IN ('SONNE', 'EN_COURS', 'REFUSE', 'MANQUE', 'TERMINE')),
  debut_at        timestamptz NOT NULL DEFAULT NOW(),
  decroche_at     timestamptz,
  fin_at          timestamptz
);
CREATE INDEX IF NOT EXISTS appels_conv_idx ON appels (conversation_id, debut_at DESC);

-- Seuls les deux participants de la conversation voient et modifient l'appel
ALTER TABLE appels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appels_participants ON appels;
CREATE POLICY appels_participants ON appels
  USING      (EXISTS (SELECT 1 FROM conversations c WHERE c.id = appels.conversation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = appels.conversation_id));
