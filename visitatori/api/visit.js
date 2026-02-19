const { supabase } = require('./lib/supabase');
const { sendEntryEmail, sendExitEmail } = require('./lib/email');

function generateCode() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return 'ARTEN-' + num;
}

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // ============================
        // POST: CHECK-IN (new visit)
        // ============================
        if (req.method === 'POST') {
            const { nome, ditta, email, referente, zona, firma, privacy_accettata } = req.body;

            if (!nome || !ditta || !email) {
                return res.status(400).json({ success: false, message: 'Nome, Ditta e Email sono obbligatori' });
            }

            // Generate unique code (retry if collision)
            let codice;
            let tries = 0;
            while (tries < 10) {
                codice = generateCode();
                const { data: existing } = await supabase
                    .from('visitors')
                    .select('id')
                    .eq('codice_univoco', codice)
                    .maybeSingle();
                if (!existing) break;
                tries++;
            }

            // Upload signature to Supabase Storage
            let firma_url = null;
            if (firma) {
                try {
                    const base64Data = firma.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    const fileName = `firma_${codice}_${Date.now()}.png`;

                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('signatures')
                        .upload(fileName, buffer, {
                            contentType: 'image/png',
                            upsert: false
                        });

                    if (uploadError) {
                        console.error('Upload error:', uploadError);
                    } else {
                        const { data: urlData } = supabase.storage
                            .from('signatures')
                            .getPublicUrl(fileName);
                        firma_url = urlData.publicUrl;
                    }
                } catch (uploadErr) {
                    console.error('Signature upload failed:', uploadErr);
                }
            }

            const now = new Date().toISOString();

            // Insert visitor record
            const { data, error } = await supabase
                .from('visitors')
                .insert({
                    nome,
                    ditta,
                    email,
                    referente: referente || null,
                    zona: zona || null,
                    codice_univoco: codice,
                    ora_entrata: now,
                    firma_url,
                    privacy_accettata: privacy_accettata || false
                })
                .select()
                .single();

            if (error) throw error;

            // Send entry email (non-blocking)
            try {
                await sendEntryEmail(email, nome, codice, now);
            } catch (emailErr) {
                console.error('Email send failed:', emailErr);
                // Don't fail the request if email fails
            }

            return res.status(201).json({
                success: true,
                message: 'Ingresso registrato',
                codice: codice,
                visitor: data
            });
        }

        // ============================
        // PUT: CHECK-OUT (register exit)
        // ============================
        if (req.method === 'PUT') {
            const { id } = req.body;
            if (!id) return res.status(400).json({ success: false, message: 'ID visitatore obbligatorio' });

            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from('visitors')
                .update({ ora_uscita: now })
                .eq('id', id)
                .is('ora_uscita', null)
                .select()
                .single();

            if (error) throw error;
            if (!data) return res.status(404).json({ success: false, message: 'Visitatore non trovato o già uscito' });

            // Send exit email (non-blocking)
            try {
                await sendExitEmail(data.email, data.nome, data.codice_univoco, now);
            } catch (emailErr) {
                console.error('Exit email failed:', emailErr);
            }

            return res.status(200).json({
                success: true,
                message: 'Uscita registrata',
                visitor: data
            });
        }

        // ============================
        // GET: List today's visitors
        // ============================
        if (req.method === 'GET') {
            const date = req.query.date; // optional, format YYYY-MM-DD

            let query = supabase
                .from('visitors')
                .select('*')
                .order('ora_entrata', { ascending: false });

            if (date) {
                query = query
                    .gte('ora_entrata', `${date}T00:00:00`)
                    .lt('ora_entrata', `${date}T23:59:59`);
            } else {
                // Default: today
                const today = new Date().toISOString().split('T')[0];
                query = query
                    .gte('ora_entrata', `${today}T00:00:00`)
                    .lt('ora_entrata', `${today}T23:59:59`);
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
