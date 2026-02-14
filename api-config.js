// api-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://pzufmuolstyiwqeqbasi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pMOWXYBwAx7pZjlAoqGIbQ_-7RQ_mZ9';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env not loaded');
}

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

export async function supabaseRestFetch(path, options = {}) {
    const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(options.headers || {})
    };

    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers
    });
}
