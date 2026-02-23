const { createClient } = require('@supabase/supabase-js');

// === SUPABASE ===
const supabase = (() => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) { console.error('Missing SUPABASE env vars'); return null; }
    return createClient(url, key);
})();

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    if (!supabase) {
        return res.status(500).json({ success: false, message: 'Configurazione database manca.' });
    }

    try {
        const { q } = req.query;
        if (!q || q.length < 3) {
            return res.status(200).json({ success: true, suggestions: [] });
        }

        // Query distinct ditta names that match the query
        const { data, error } = await supabase
            .from('visitors')
            .select('ditta')
            .not('ditta', 'is', null)
            .neq('ditta', '')
            .ilike('ditta', `%${q}%`)
            .order('ditta')
            .limit(10);

        if (error) throw error;

        // Extract unique names
        const suggestions = [...new Set(data.map(item => item.ditta))];

        return res.status(200).json({ success: true, suggestions });
    } catch (err) {
        console.error('Suggest Ditta Error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
