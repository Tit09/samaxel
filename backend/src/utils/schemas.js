'use strict';
/** Schémas de validation réutilisables (zod) */
const { z } = require('zod');

const uuid = z.string().uuid('identifiant invalide');

/**
 * Téléphone : accepte « 77 123 45 67 », « 771234567 », « +221771234567 », « 00221… »
 * et normalise au format international +221XXXXXXXXX.
 */
const telephone = z.string().trim().transform((v, ctx) => {
  let t = v.replace(/[\s.-]/g, '');
  if (t.startsWith('00')) t = `+${t.slice(2)}`;
  if (/^[37]\d{8}$/.test(t)) t = `+221${t}`;
  if (!/^\+\d{8,15}$/.test(t)) {
    ctx.addIssue({ code: 'custom', message: 'numéro de téléphone invalide' });
    return z.NEVER;
  }
  return t;
});

const email = z.string().trim().toLowerCase().email('e-mail invalide');
const password = z.string()
  .min(8, '8 caractères minimum')
  .max(128)
  .regex(/[A-Za-z]/, 'au moins une lettre')
  .regex(/\d/, 'au moins un chiffre');
const langue = z.enum(['fr', 'en', 'wo', 'ff', 'srr', 'dyo', 'mnk', 'bm']);
const identifier = z.string().trim().min(3).max(120).transform((v) => {
  // Un téléphone sénégalais saisi sans indicatif est normalisé
  const t = v.replace(/[\s.-]/g, '');
  if (/^[37]\d{8}$/.test(t)) return `+221${t}`;
  if (/^00\d+$/.test(t)) return `+${t.slice(2)}`;
  return v.includes('@') ? v.toLowerCase() : t;
});
const code6 = z.string().trim().regex(/^\d{6}$/, 'code à 6 chiffres');
const texte = (max = 2000) => z.string().trim().max(max);
const TROUBLES = ['TSA', 'TDAH', 'DI', 'LANGAGE', 'DYS', 'MOTEUR', 'EPILEPSIE', 'DEPRESSION', 'ADDICTION',
  'PSYCHIATRIE_ADULTE', 'ANXIETE', 'DEMENCE', 'TRAUMA', 'TRISOMIE'];
const trouble = z.enum(TROUBLES);
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

module.exports = {
  z, uuid, telephone, email, password, langue, identifier, code6, texte, trouble, TROUBLES, pagination,
};
