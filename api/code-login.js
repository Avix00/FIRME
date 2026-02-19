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

async function sendEntryEmail(to, nome, codice, oraEntrata) {
    const timeStr = new Date(oraEntrata).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
    const dateStr = new Date(oraEntrata).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
    await transporter.sendMail({
        from: '"ArTen Registro Visitatori" <service@arten.it>',
        to,
        subject: `Conferma Ingresso - ${codice}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
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
            <p style="color:#666;font-size:13px;">Conservi questo codice per accessi futuri.</p>
          </div>
          <div style="border-top:1px solid #eee;padding-top:16px;color:#999;font-size:11px;text-align:center;">ArTen S.r.l. — Registro Visitatori Digitale</div>
        </div>`
    });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    if (!supabase) {
        return res.status(500).json({ success: false, message: 'Configurazione database mancante. Controlla le env vars SUPABASE_URL e SUPABASE_KEY su Vercel.' });
    }

    try {
        const { codice } = req.body;

        if (!codice || !codice.startsWith('ARTEN-')) {
            return res.status(400).json({ success: false, message: 'Codice non valido. Formato: ARTEN-XXXX' });
        }

        const { data: original, error: findError } = await supabase
            .from('visitors')
            .select('*')
            .eq('codice_univoco', codice)
            .order('ora_entrata', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (findError) throw findError;
        if (!original) {
            return res.status(404).json({ success: false, message: 'Codice non trovato. Verificare il codice e riprovare.' });
        }

        const now = new Date().toISOString();
        const { data, error } = await supabase.from('visitors').insert({
            nome: original.nome,
            ditta: original.ditta,
            email: original.email,
            referente: original.referente,
            zona: original.zona,
            codice_univoco: codice,
            ora_entrata: now,
            firma_url: original.firma_url,
            privacy_accettata: true
        }).select().single();

        if (error) throw error;

        try { await sendEntryEmail(original.email, original.nome, codice, now); } catch (e) { console.error('Email failed:', e); }

        return res.status(201).json({
            success: true,
            message: `Bentornato ${original.nome}! Ingresso registrato.`,
            visitor: data
        });
    } catch (err) {
        console.error('Code Login Error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
