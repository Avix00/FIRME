const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtps.aruba.it',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true, // SSL
    auth: {
        user: process.env.SMTP_USER || 'service@arten.it',
        pass: process.env.SMTP_PASS
    }
});

/**
 * Send entry confirmation email with unique code
 */
async function sendEntryEmail(to, nome, codice, oraEntrata) {
    const timeStr = new Date(oraEntrata).toLocaleTimeString('it-IT', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
    });
    const dateStr = new Date(oraEntrata).toLocaleDateString('it-IT', {
        timeZone: 'Europe/Rome'
    });

    await transporter.sendMail({
        from: '"ArTen Registro Visitatori" <service@arten.it>',
        to,
        subject: `Conferma Ingresso - ${codice}`,
        html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <div style="background:#111;color:#fff;padding:24px;border-radius:12px;text-align:center;">
          <h1 style="color:#16A34A;margin:0 0 8px;">ArTen</h1>
          <p style="margin:0;color:#888;">Registro Visitatori</p>
        </div>
        <div style="padding:24px 0;">
          <p>Gentile <strong>${nome}</strong>,</p>
          <p>Il suo ingresso è stato registrato con successo.</p>
          <div style="background:#f0fdf4;border:2px solid #16A34A;border-radius:12px;padding:20px;text-align:center;margin:16px 0;">
            <p style="margin:0 0 4px;color:#666;font-size:12px;">IL SUO CODICE ACCESSO</p>
            <p style="margin:0;font-size:32px;font-weight:bold;color:#16A34A;letter-spacing:4px;">${codice}</p>
          </div>
          <p><strong>Data:</strong> ${dateStr}<br><strong>Ora:</strong> ${timeStr}</p>
          <p style="color:#666;font-size:13px;">Conservi questo codice per accessi futuri. Potrà usarlo nella schermata "Accedi con Codice" per registrarsi velocemente.</p>
        </div>
        <div style="border-top:1px solid #eee;padding-top:16px;color:#999;font-size:11px;text-align:center;">
          ArTen S.r.l. — Registro Visitatori Digitale
        </div>
      </div>
    `
    });
}

/**
 * Send exit confirmation email
 */
async function sendExitEmail(to, nome, codice, oraUscita) {
    const timeStr = new Date(oraUscita).toLocaleTimeString('it-IT', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
    });
    const dateStr = new Date(oraUscita).toLocaleDateString('it-IT', {
        timeZone: 'Europe/Rome'
    });

    await transporter.sendMail({
        from: '"ArTen Registro Visitatori" <service@arten.it>',
        to,
        subject: `Conferma Uscita - ${codice}`,
        html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <div style="background:#111;color:#fff;padding:24px;border-radius:12px;text-align:center;">
          <h1 style="color:#16A34A;margin:0 0 8px;">ArTen</h1>
          <p style="margin:0;color:#888;">Registro Visitatori</p>
        </div>
        <div style="padding:24px 0;">
          <p>Gentile <strong>${nome}</strong>,</p>
          <p>La sua uscita è stata registrata con successo.</p>
          <p><strong>Data:</strong> ${dateStr}<br><strong>Ora uscita:</strong> ${timeStr}</p>
          <p>Grazie per la visita. A presto!</p>
        </div>
        <div style="border-top:1px solid #eee;padding-top:16px;color:#999;font-size:11px;text-align:center;">
          ArTen S.r.l. — Registro Visitatori Digitale
        </div>
      </div>
    `
    });
}

module.exports = { sendEntryEmail, sendExitEmail };
