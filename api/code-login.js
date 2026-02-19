const { supabase } = require('./lib/supabase');
const { sendEntryEmail } = require('./lib/email');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { codice } = req.body;

        if (!codice || !codice.startsWith('ARTEN-')) {
            return res.status(400).json({ success: false, message: 'Codice non valido. Formato: ARTEN-XXXX' });
        }

        // Find the most recent visit with this code
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

        // Create a new entry with the same visitor data
        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('visitors')
            .insert({
                nome: original.nome,
                ditta: original.ditta,
                email: original.email,
                referente: original.referente,
                zona: original.zona,
                codice_univoco: codice, // Same code
                ora_entrata: now,
                firma_url: original.firma_url, // Reuse previous signature
                privacy_accettata: true // Already accepted
            })
            .select()
            .single();

        if (error) throw error;

        // Send entry email
        try {
            await sendEntryEmail(original.email, original.nome, codice, now);
        } catch (emailErr) {
            console.error('Email failed:', emailErr);
        }

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
