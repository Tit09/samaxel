-- ============================================================================
--  011 — Canaux de notification hors application : Telegram, WhatsApp, SMS, e-mail
--
--  Ordre par défaut (du gratuit au payant) : Telegram → WhatsApp → SMS → e-mail.
--  Chaque utilisateur peut relier Telegram, accepter WhatsApp et choisir son ordre.
--  Le journal des envois ne contient AUCUN contenu : seulement canal, type, statut.
-- ============================================================================
ALTER TABLE users
  ADD COLUMN telegram_chat_id text,
  ADD COLUMN telegram_relie_le timestamptz,
  ADD COLUMN whatsapp_accepte boolean NOT NULL DEFAULT false,
  ADD COLUMN canaux_preferes text[] NOT NULL DEFAULT '{}'
    CHECK (canaux_preferes <@ ARRAY['TELEGRAM', 'WHATSAPP', 'SMS', 'EMAIL']::text[]);
CREATE UNIQUE INDEX users_telegram_uq ON users (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE envois (
  id            bigserial PRIMARY KEY,
  user_id       uuid REFERENCES users(id),
  canal         text NOT NULL CHECK (canal IN ('TELEGRAM', 'WHATSAPP', 'SMS', 'EMAIL', 'PUSH')),
  type          text NOT NULL,            -- OTP, RAPPEL_RDV, CONVOCATION, TEST…
  statut        text NOT NULL CHECK (statut IN ('ENVOYE', 'ECHEC')),
  erreur        text,                     -- message du fournisseur, sans donnée personnelle
  fournisseur_id text,                    -- identifiant du message chez le fournisseur
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX envois_user_idx ON envois (user_id, created_at DESC);
CREATE INDEX envois_canal_idx ON envois (canal, created_at DESC);
ALTER TABLE envois ENABLE ROW LEVEL SECURITY;
CREATE POLICY envois_lecture ON envois FOR SELECT USING (user_id = app_uid() OR app_is_super());
CREATE POLICY envois_ecriture ON envois FOR INSERT WITH CHECK (true);
CREATE TRIGGER envois_sans_suppression BEFORE DELETE ON envois FOR EACH STATEMENT EXECUTE FUNCTION interdire_suppression();
