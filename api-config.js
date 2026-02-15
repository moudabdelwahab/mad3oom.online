import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import {
    validateSupabaseConfig,
    logSupabaseConfigDev,
    logSupabaseAuthDiagnostics
} from './supabase-config.js';

const supabaseConfig = validateSupabaseConfig();
logSupabaseConfigDev(supabaseConfig);

export const supabase = createClient(
    supabaseConfig.url,
    supabaseConfig.anonKey
);

export function debugSupabaseAuthError(error) {
    logSupabaseAuthDiagnostics(error, supabaseConfig);
}

export async function supabaseRestFetch(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
        apikey: supabaseConfig.anonKey,
        Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : `Bearer ${supabaseConfig.anonKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    return fetch(`${supabaseConfig.url}/rest/v1/${path}`, {
        ...options,
        headers
    });
}
