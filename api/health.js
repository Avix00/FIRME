module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const hasSupabaseUrl = !!process.env.SUPABASE_URL;
    const hasSupabaseKey = !!process.env.SUPABASE_KEY;
    const hasSmtpPass = !!process.env.SMTP_PASS;

    let supabaseOk = false;
    let supabaseError = null;

    try {
        const { createClient } = require('@supabase/supabase-js');
        if (hasSupabaseUrl && hasSupabaseKey) {
            const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
            const { data, error } = await sb.from('referees').select('id').limit(1);
            supabaseOk = !error;
            if (error) supabaseError = error.message;
        }
    } catch (e) {
        supabaseError = e.message;
    }

    return res.status(200).json({
        ok: true,
        timestamp: new Date().toISOString(),
        env: {
            SUPABASE_URL: hasSupabaseUrl ? '✅ set' : '❌ MISSING',
            SUPABASE_KEY: hasSupabaseKey ? '✅ set' : '❌ MISSING',
            SMTP_PASS: hasSmtpPass ? '✅ set' : '❌ MISSING',
        },
        supabase: supabaseOk ? '✅ connected' : `❌ error: ${supabaseError}`,
        node_version: process.version
    });
};
