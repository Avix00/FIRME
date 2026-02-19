const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;

try {
    if (supabaseUrl && supabaseKey) {
        supabase = createClient(supabaseUrl, supabaseKey);
    } else {
        console.error('WARNING: Missing SUPABASE_URL or SUPABASE_KEY - check Vercel environment variables');
    }
} catch (e) {
    console.error('Failed to init Supabase:', e.message);
}

module.exports = { supabase };
