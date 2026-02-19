const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // GET: List active referees
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('referees')
                .select('id, nome, email')
                .eq('active', true)
                .order('nome');

            if (error) throw error;
            return res.status(200).json({ success: true, referees: data });
        }

        // POST: Add new referee
        if (req.method === 'POST') {
            const { nome, email } = req.body;
            if (!nome) return res.status(400).json({ success: false, message: 'Nome obbligatorio' });

            const { data, error } = await supabase
                .from('referees')
                .insert({ nome, email: email || null })
                .select()
                .single();

            if (error) throw error;
            return res.status(201).json({ success: true, referee: data });
        }

        // DELETE: Deactivate referee
        if (req.method === 'DELETE') {
            const { id } = req.body;
            if (!id) return res.status(400).json({ success: false, message: 'ID obbligatorio' });

            const { error } = await supabase
                .from('referees')
                .update({ active: false })
                .eq('id', id);

            if (error) throw error;
            return res.status(200).json({ success: true, message: 'Referente rimosso' });
        }

        return res.status(405).json({ success: false, message: 'Method not allowed' });
    } catch (err) {
        console.error('Referees API Error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
