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

let currentSession = null;

supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
});

export function debugSupabaseAuthError(error) {
    logSupabaseAuthDiagnostics(error, supabaseConfig);
}

export async function supabaseRestFetch(path, options = {}) {
    const cleanPath = path.replace(/^\/+/, '');

    const headers = {
        apikey: supabaseConfig.anonKey,
        Authorization: currentSession?.access_token
            ? `Bearer ${currentSession.access_token}`
            : `Bearer ${supabaseConfig.anonKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    return fetch(`${supabaseConfig.url}/rest/v1/${cleanPath}`, {
        ...options,
        headers
    });
}
