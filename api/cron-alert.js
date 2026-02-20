const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// === SUPABASE ===
const supabase = (() => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) { console.error('Missing SUPABASE env vars'); return null; }
    return createClient(url, key);
})();

// === EMAIL ===
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtps.aruba.it',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
        user: process.env.SMTP_USER || 'service@arten.it',
        pass: process.env.SMTP_PASS
    }
});

// Admin email address to receive alerts
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'service@arten.it';

module.exports = async function handler(req, res) {
    // Verify cron secret (Vercel sends this header for cron jobs)
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!supabase) {
        return res.status(500).json({ success: false, message: 'DB config missing' });
    }

    try {
        // Get today's date in Rome timezone
        const now = new Date();
        const romeDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

        // Find visitors who entered today but have NOT checked out
        const startOfDay = `${romeDateStr}T00:00:00.000Z`;
        const endOfDay = `${romeDateStr}T23:59:59.999Z`;

        const { data: stillPresent, error } = await supabase
            .from('visitors')
            .select('*')
            .gte('ora_entrata', startOfDay)
            .lte('ora_entrata', endOfDay)
            .is('ora_uscita', null)
            .order('ora_entrata', { ascending: true });

        if (error) throw error;

        if (!stillPresent || stillPresent.length === 0) {
            return res.status(200).json({ success: true, message: 'Nessun visitatore ancora presente.' });
        }

        // Build the email
        const romeTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
        const romeDate = now.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });

        const visitorRows = stillPresent.map(v => {
            const entryTime = new Date(v.ora_entrata).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
            return `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">${v.nome}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">${v.ditta || '-'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">${v.referente || '-'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">${entryTime}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">${v.codice_univoco}</td>
            </tr>`;
        }).join('');

        const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#111;color:#fff;padding:24px;border-radius:12px;text-align:center;">
            <img src="https://firme-eight.vercel.app/image-Photoroom.png" alt="ArTen" style="width:100px;height:auto;">
            <p style="margin:8px 0 0;color:#888;">Registro Visitatori</p>
          </div>
          <div style="padding:24px 0;">
            <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;">
              <p style="margin:0;font-size:18px;font-weight:bold;color:#92400e;">⚠️ Attenzione: ${stillPresent.length} visitator${stillPresent.length === 1 ? 'e' : 'i'} ancora present${stillPresent.length === 1 ? 'e' : 'i'}</p>
              <p style="margin:4px 0 0;color:#92400e;font-size:13px;">${romeDate} — ore ${romeTime}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:8px 12px;text-align:left;">Nome</th>
                  <th style="padding:8px 12px;text-align:left;">Ditta</th>
                  <th style="padding:8px 12px;text-align:left;">Referente</th>
                  <th style="padding:8px 12px;text-align:left;">Entrata</th>
                  <th style="padding:8px 12px;text-align:left;">Codice</th>
                </tr>
              </thead>
              <tbody>${visitorRows}</tbody>
            </table>
            <p style="color:#666;font-size:12px;margin-top:16px;">Questi visitatori risultano ancora all'interno della struttura. Si prega di verificare e, se necessario, registrare la loro uscita.</p>
          </div>
          <div style="border-top:1px solid #eee;padding-top:16px;color:#999;font-size:11px;text-align:center;">ArTen S.r.l. — Registro Visitatori Digitale</div>
        </div>`;

        await transporter.sendMail({
            from: '"ArTen Registro Visitatori" <service@arten.it>',
            to: ADMIN_EMAIL,
            subject: `⚠️ ${stillPresent.length} visitator${stillPresent.length === 1 ? 'e' : 'i'} ancora present${stillPresent.length === 1 ? 'e' : 'i'} — ${romeDate}`,
            html: emailHtml
        });

        return res.status(200).json({
            success: true,
            message: `Alert inviato: ${stillPresent.length} visitatori ancora presenti.`
        });

    } catch (err) {
        console.error('Cron Alert Error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
