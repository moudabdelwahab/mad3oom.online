import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import {
  validateSupabaseConfig,
  debugSupabaseAuthError
} from './supabase-config.js';

// validate config
const supabaseConfig = validateSupabaseConfig();

// create client
export const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey
);

// keep session cached
let currentSession = null;

supabase.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
});

// optional: helper لإظهار أخطاء auth من أي مكان
export function debugAuthError(error) {
  debugSupabaseAuthError(error);
}

// REST helper
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
