const EXPECTED_SUPABASE_PROJECT_REF = 'nlcxrkzlikhzyqxexego';

function tryReadImportMetaEnv(name) {
    try {
        if (typeof import.meta !== 'undefined' && import.meta?.env?.[name]) {
            return import.meta.env[name];
        }
    } catch (_) {}

    return undefined;
}

export function readRuntimeEnv(name) {
    if (typeof globalThis !== 'undefined' && globalThis.__ENV__?.[name]) {
        return globalThis.__ENV__[name];
    }

    if (typeof process !== 'undefined' && process?.env?.[name]) {
        return process.env[name];
    }

    if (typeof Deno !== 'undefined' && Deno?.env?.get) {
        return Deno.env.get(name);
    }

    return tryReadImportMetaEnv(name);
}

export function extractProjectRefFromUrl(url) {
    if (!url) return null;

    try {
        const { hostname } = new URL(url);
        const [projectRef] = hostname.split('.');
        return projectRef || null;
    } catch (_) {
        return null;
    }
}

function decodeJwtPayload(token) {
    const segments = token?.split('.') || [];
    if (segments.length !== 3) return null;

    try {
        const payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = typeof atob === 'function'
            ? atob(payload)
            : Buffer.from(payload, 'base64').toString('utf-8');
        return JSON.parse(json);
    } catch (_) {
        return null;
    }
}

function detectProjectRefFromAnonKey(anonKey) {
    const payload = decodeJwtPayload(anonKey);
    if (!payload) return null;

    if (payload.iss) {
        const refFromIss = extractProjectRefFromUrl(payload.iss);
        if (refFromIss) return refFromIss;
    }

    return payload.ref || null;
}

export function validateSupabaseConfig(config = {}) {
    const url = (config.url ?? readRuntimeEnv('SUPABASE_URL') ?? '').trim();
    const anonKey = (config.anonKey ?? readRuntimeEnv('SUPABASE_ANON_KEY') ?? '').trim();

    if (!url) {
        throw new Error('Missing SUPABASE_URL. Define it in your environment file.');
    }

    if (!anonKey) {
        throw new Error('Missing SUPABASE_ANON_KEY. Define it in your environment file.');
    }

    const projectRef = extractProjectRefFromUrl(url);
    if (!projectRef) {
        throw new Error(`Invalid SUPABASE_URL: ${url}`);
    }

    if (projectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
        throw new Error(
            `Supabase project mismatch: expected ${EXPECTED_SUPABASE_PROJECT_REF}, got ${projectRef}.`
        );
    }

    const anonKeyProjectRef = detectProjectRefFromAnonKey(anonKey);
    if (anonKeyProjectRef && anonKeyProjectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
        throw new Error(
            `SUPABASE_ANON_KEY project mismatch: expected ${EXPECTED_SUPABASE_PROJECT_REF}, got ${anonKeyProjectRef}.`
        );
    }

    return {
        url,
        anonKey,
        projectRef,
        expectedProjectRef: EXPECTED_SUPABASE_PROJECT_REF,
        anonKeyProjectRef
    };
}

export function logSupabaseConfigDev(config) {
    if (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production') {
        return;
    }

    console.info(`[Supabase] URL: ${config.url}`);
    console.info(`[Supabase] project ref: ${config.projectRef}`);
}

export function logSupabaseAuthDiagnostics(error, config) {
    if (!error) return;

    if (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production') {
        return;
    }

    console.info('[Supabase auth diagnostics]', {
        url: config.url,
        projectRef: config.projectRef,
        errorCode: error.code || 'unknown',
        errorMessage: error.message || 'unknown'
    });
}

export { EXPECTED_SUPABASE_PROJECT_REF };
