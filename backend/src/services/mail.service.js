'use strict';
const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    if (!env.mail.host || !env.mail.user) {
      throw new Error('E-mail non configuré (MAIL_HOST / MAIL_USER / MAIL_PASS)');
    }
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }
  return transporter;
}

/** Envoi par l'API HTTPS de Brevo quand le SMTP est bloqué (hébergement gratuit Render) */
async function envoyer(message) {
  if (!env.mail.brevoKey) return getTransporter().sendMail(message);
  const m = /^(.*?)\s*<([^>]+)>$/.exec(message.from) || [null, 'SAMA XHEL', message.from];
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.mail.brevoKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: m[1] || 'SAMA XHEL', email: m[2] }, to: [{ email: message.to }],
      subject: message.subject, textContent: message.text, htmlContent: message.html,
    }),
  });
  if (!r.ok) throw new Error(`Brevo : ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

async function sendMailCode(email, code) {
  await envoyer({
    from: env.mail.from,
    to: email,
    subject: 'SAMA XHEL — Votre code de vérification',
    text: `Votre code SAMA XHEL est : ${code}\nIl est valable 10 minutes. Ne le partagez avec personne.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e3e9df;border-radius:12px">
        <h2 style="color:#187A3B;margin:0 0 8px">SAMA XHEL</h2>
        <p>Votre code de vérification :</p>
        <div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#123D25;margin:20px 0">${code}</div>
        <p style="color:#6D7469;font-size:13px">Valable 10 minutes. Ne le partagez avec personne, même un agent SAMA XHEL.</p>
      </div>`,
  });
}

/** E-mail simple (convocations, rappels) — jamais de donnée de santé dans le contenu */
async function sendMail(email, sujet, texte) {
  await envoyer({
    from: env.mail.from, to: email, subject: sujet, text: texte,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;border:1px solid #e3e9df;border-radius:12px">
      <h2 style="color:#187A3B;margin:0 0 12px">SAMA XHEL</h2><p style="font-size:15px;line-height:1.5">${String(texte)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p></div>`,
  });
}

module.exports = { sendMailCode, sendMail };
