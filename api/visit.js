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
            <img src="https://firme-eight.vercel.app/image-Photoroom.png" alt="ArTen" style="width:120px;height:auto;">
            <p style="margin:0;color:#888;">Registro Visitatori</p>
          </div>
          <div style="padding:24px 0;">
            <p>Gentile <strong>${nome}</strong>,</p>
            <p>Il suo ingresso è stato registrato con successo.</p>
            <div style="background:#f0fdf4;border:2px solid #16A34A;border-radius:12px;padding:20px;text-align:center;margin:16px 0;">
              <p style="margin:0 0 4px;color:#666;font-size:12px;">IL SUO CODICE ACCESSO</p>
              <p style="margin:0;font-size:32px;font-weight:bold;color:#16A34A;letter-spacing:4px;">${codice}</p>
            </div>
            <div style="text-align:center;margin:16px 0;">
              <p style="margin:0 0 8px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:2px;">OPPURE SCANSIONA IL QR CODE</p>
              <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(codice)}&size=200x200&bgcolor=ffffff&color=000000" alt="QR Code ${codice}" style="width:200px;height:200px;border-radius:8px;">
            </div>
            <p><strong>Data:</strong> ${dateStr}<br><strong>Ora:</strong> ${timeStr}</p>
            <p style="color:#666;font-size:13px;">Conservi questo codice per accessi futuri.</p>
          </div>
          <div style="border-top:1px solid #eee;padding-top:16px;color:#999;font-size:11px;text-align:center;">ArTen S.r.l. — Registro Visitatori Digitale</div>
        </div>`
    });
}

async function sendExitEmail(to, nome, codice, oraUscita) {
    const timeStr = new Date(oraUscita).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
    const dateStr = new Date(oraUscita).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
    await transporter.sendMail({
        from: '"ArTen Registro Visitatori" <service@arten.it>',
        to,
        subject: `Conferma Uscita - ${codice}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
          <div style="background:#111;color:#fff;padding:24px;border-radius:12px;text-align:center;">
            <img src="https://firme-eight.vercel.app/image-Photoroom.png" alt="ArTen" style="width:120px;height:auto;">
            <p style="margin:0;color:#888;">Registro Visitatori</p>
          </div>
          <div style="padding:24px 0;">
            <p>Gentile <strong>${nome}</strong>,</p>
            <p>La sua uscita è stata registrata con successo.</p>
            <p><strong>Data:</strong> ${dateStr}<br><strong>Ora uscita:</strong> ${timeStr}</p>
            <p>Grazie per la visita. A presto!</p>
          </div>
          <div style="border-top:1px solid #eee;padding-top:16px;color:#999;font-size:11px;text-align:center;">ArTen S.r.l. — Registro Visitatori Digitale</div>
        </div>`
    });
}

// === CODE GENERATOR ===
function generateCode() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return 'ARTEN-' + num;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!supabase) {
        return res.status(500).json({ success: false, message: 'Configurazione database mancante. Controlla le env vars SUPABASE_URL e SUPABASE_KEY su Vercel.' });
    }

    try {
        // POST: CHECK-IN
        if (req.method === 'POST') {
            const { nome, ditta, email, referente, zona, firma, firma_pdf, privacy_accettata } = req.body;
            if (!nome || !ditta || !email) {
                return res.status(400).json({ success: false, message: 'Nome, Ditta e Email sono obbligatori' });
            }

            let codice;
            let tries = 0;
            while (tries < 10) {
                codice = generateCode();
                const { data: existing } = await supabase.from('visitors').select('id').eq('codice_univoco', codice).maybeSingle();
                if (!existing) break;
                tries++;
            }

            let firma_url = null;
            // Prefer signed PDF if available, fall back to signature PNG
            if (firma_pdf) {
                try {
                    const base64Data = firma_pdf.replace(/^data:application\/pdf;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    const fileName = `firmato_${codice}_${Date.now()}.pdf`;
                    const { data: uploadData, error: uploadError } = await supabase.storage.from('signatures').upload(fileName, buffer, { contentType: 'application/pdf', upsert: false });
                    if (!uploadError) {
                        const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(fileName);
                        firma_url = urlData.publicUrl;
                    } else {
                        console.error('PDF upload error:', uploadError);
                    }
                } catch (e) { console.error('PDF upload failed:', e); }
            }
            // Fallback: upload just the signature image if PDF upload failed
            if (!firma_url && firma) {
                try {
                    const base64Data = firma.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    const fileName = `firma_${codice}_${Date.now()}.png`;
                    const { data: uploadData, error: uploadError } = await supabase.storage.from('signatures').upload(fileName, buffer, { contentType: 'image/png', upsert: false });
                    if (!uploadError) {
                        const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(fileName);
                        firma_url = urlData.publicUrl;
                    }
                } catch (e) { console.error('Signature upload failed:', e); }
            }

            const now = new Date().toISOString();
            const { data, error } = await supabase.from('visitors').insert({
                nome, ditta, email,
                referente: referente || null,
                zona: zona || null,
                codice_univoco: codice,
                ora_entrata: now,
                firma_url,
                privacy_accettata: privacy_accettata || false
            }).select().single();

            if (error) throw error;

            try { await sendEntryEmail(email, nome, codice, now); } catch (e) { console.error('Email failed:', e); }

            return res.status(201).json({ success: true, message: 'Ingresso registrato', codice, visitor: data });
        }

        // PUT: CHECK-OUT
        if (req.method === 'PUT') {
            const { id } = req.body;
            if (!id) return res.status(400).json({ success: false, message: 'ID visitatore obbligatorio' });

            const now = new Date().toISOString();
            const { data, error } = await supabase.from('visitors').update({ ora_uscita: now }).eq('id', id).is('ora_uscita', null).select().single();
            if (error) throw error;
            if (!data) return res.status(404).json({ success: false, message: 'Visitatore non trovato o già uscito' });

            try { await sendExitEmail(data.email, data.nome, data.codice_univoco, now); } catch (e) { console.error('Exit email failed:', e); }

            return res.status(200).json({ success: true, message: 'Uscita registrata', visitor: data });
        }

        // GET: List visitors
        if (req.method === 'GET') {
            const date = req.query.date;
            let query = supabase.from('visitors').select('*').order('ora_entrata', { ascending: false });

            if (date) {
                query = query.gte('ora_entrata', `${date}T00:00:00`).lt('ora_entrata', `${date}T23:59:59`);
            } else {
                const today = new Date().toISOString().split('T')[0];
                query = query.gte('ora_entrata', `${today}T00:00:00`).lt('ora_entrata', `${today}T23:59:59`);
            }

            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ success: true, visitors: data });
        }

        return res.status(405).json({ success: false, message: 'Method not allowed' });
    } catch (err) {
        console.error('Visit API Error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
