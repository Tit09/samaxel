-- 008 — Photo de chaque structure (fournie par la structure, ou photo publique créditée)
ALTER TABLE structures ADD COLUMN photo_url text, ADD COLUMN photo_credit text;
COMMENT ON COLUMN structures.photo_credit IS 'Source et auteur de la photo (obligatoire si la photo n’appartient pas à la structure)';
