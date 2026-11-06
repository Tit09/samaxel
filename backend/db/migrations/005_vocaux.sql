-- ═══════════════════════════════════════════════════════════════════════════
-- 005 — Messages vocaux (parents qui ne lisent pas) et assistant vocal
--
-- Un parent parle comme sur WhatsApp. Chaque vocal est :
--   • chiffré (AES-256-GCM) dans la base, comme toute donnée de santé ;
--   • transcrit par l'IA vocale hébergée chez nous, SI le parent a donné le consentement IA_ANALYSE ;
--   • transmis aux cliniciens de la structure qui suit l'enfant (une ligne par structure),
--     qui peuvent répondre… par un vocal.
-- Rien n'est jamais supprimé (pas de politique DELETE, droit DELETE retiré).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE vocaux (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id              uuid NOT NULL REFERENCES users(id),
  enfant_id              uuid REFERENCES enfants(id),
  structure_id           uuid REFERENCES structures(id),      -- NULL = échange avec l'assistant seulement
  auteur_id              uuid REFERENCES users(id),           -- NULL quand c'est l'assistant qui répond
  sens                   text NOT NULL CHECK (sens IN ('PARENT', 'ASSISTANT', 'SOIGNANT')),
  langue                 text NOT NULL,
  audio_chiffre          bytea,                               -- iv(12) | tag(16) | audio chiffré
  audio_type             text,
  duree_s                numeric(5,1),
  transcription_chiffree text,
  confiance              numeric(3,2),
  intention              text,
  mots_reconnus          text[] NOT NULL DEFAULT '{}',
  niveau_emotion         text,
  reponse_cle            text,                                -- phrase validée jouée au parent
  reponse_texte          text,
  action                 jsonb,
  en_reponse_a           uuid REFERENCES vocaux(id),
  lu_at                  timestamptz,
  created_at             timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX vocaux_parent_idx ON vocaux (parent_id, created_at);
CREATE INDEX vocaux_structure_idx ON vocaux (structure_id, created_at) WHERE structure_id IS NOT NULL;

ALTER TABLE vocaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocaux FORCE ROW LEVEL SECURITY;

-- Lecture : le parent voit son fil ; les cliniciens voient les vocaux adressés à LEUR structure active.
CREATE POLICY vocaux_lecture ON vocaux FOR SELECT
  USING (parent_id = app_uid()
         OR (structure_id IS NOT NULL AND app_is_clinicien() AND structure_id = app_sid()));

-- Écriture : le parent dépose ses vocaux (et les réponses de l'assistant à son fil) ;
-- un clinicien ne répond que dans sa structure active.
CREATE POLICY vocaux_ecriture ON vocaux FOR INSERT
  WITH CHECK ((sens IN ('PARENT', 'ASSISTANT') AND parent_id = app_uid())
              OR (sens = 'SOIGNANT' AND auteur_id = app_uid() AND app_is_clinicien() AND structure_id = app_sid()));

-- Seul l'accusé de lecture peut changer (droit de colonne lu_at, voir scripts/migrate.js)
CREATE POLICY vocaux_lu ON vocaux FOR UPDATE
  USING (parent_id = app_uid() OR (structure_id IS NOT NULL AND app_is_clinicien() AND structure_id = app_sid()))
  WITH CHECK (parent_id = app_uid() OR (structure_id IS NOT NULL AND app_is_clinicien() AND structure_id = app_sid()));
