/**
 * Centralized Error Logging System - Frontend Tracker
 * Project: mad3oom.online
 * Author: Senior Full-Stack Engineer (Manus)
 */

(function() {
    const EXPECTED_PROJECT_REF = 'nlcxrkzlikhzyqxexego';

    function readRuntimeEnv(name) {
        return window.__ENV__?.[name] || null;
    }

    function extractProjectRef(url) {
        if (!url) return null;

        try {
            const { hostname } = new URL(url);
            return hostname.split('.')[0] || null;
        } catch (_) {
            return null;
        }
    }

    const SUPABASE_URL = readRuntimeEnv('SUPABASE_URL');
    const SUPABASE_ANON_KEY = readRuntimeEnv('SUPABASE_ANON_KEY');
    const detectedProjectRef = extractProjectRef(SUPABASE_URL);

    // Configuration - Unified with api-config.js
    const CONFIG = {
        PROJECT_ID: detectedProjectRef,
        API_URL: SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/site_errors` : null,
        API_KEY: SUPABASE_ANON_KEY,
        DEBOUNCE_MS: 300,
        MAX_ERRORS_PER_SESSION: 200,
        IGNORE_PATTERNS: [
            /extensions\//i,
            /chrome-extension:/i,
            /moz-extension:/i,
            /safari-extension:/i,
            /top\.GLOBALS/i,
            /originalPrompt/i
        ]
    };

    if (!CONFIG.API_URL || !CONFIG.API_KEY || detectedProjectRef !== EXPECTED_PROJECT_REF) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.warn('[Error Tracker] Disabled: invalid Supabase environment configuration.');
        }
        return;
    }

    let errorCount = 0;
    let lastErrorTime = 0;

    /**
     * Send error to Supabase
     */
    async function reportError(errorData) {
        const now = Date.now();
        if (now - lastErrorTime < CONFIG.DEBOUNCE_MS) return;
        if (errorCount >= CONFIG.MAX_ERRORS_PER_SESSION) return;

        const searchString = `${errorData.message} ${errorData.file_name} ${errorData.stack_trace}`;
        if (CONFIG.IGNORE_PATTERNS.some(pattern => pattern.test(searchString))) return;

        errorCount++;
        lastErrorTime = now;

        try {
            let userId = null;
            try {
                const supabaseAuth = localStorage.getItem(`sb-${CONFIG.PROJECT_ID}-auth-token`);
                if (supabaseAuth) {
                    const authData = JSON.parse(supabaseAuth);
                    userId = authData.user?.id;
                }
            } catch (e) {}

            const payload = {
                ...errorData,
                user_id: userId,
                user_agent: navigator.userAgent,
                page_url: window.location.href,
                created_at: new Date().toISOString()
            };

            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: CONFIG.API_KEY,
                    Authorization: `Bearer ${CONFIG.API_KEY}`,
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(payload),
                keepalive: true
            });

            if (!response.ok && window.location.hostname === 'localhost') {
                console.error('❌ Failed to report error:', response.status, response.statusText);
            }
        } catch (err) {
            if (window.location.hostname === 'localhost') {
                console.error('❌ Error Tracker Network Error:', err);
            }
        }
    }

    window.addEventListener('error', function(event) {
        if (event.error) {
            reportError({
                type: 'js',
                message: event.message,
                file_name: event.filename,
                line_number: event.lineno,
                column_number: event.colno,
                stack_trace: event.error.stack
            });
        } else {
            const target = event.target || event.srcElement;
            if (target instanceof HTMLElement) {
                const url = target.src || target.href;
                reportError({
                    type: 'network',
                    message: `Failed to load resource: ${target.tagName} (${url})`,
                    file_name: url,
                    stack_trace: `Element: ${target.outerHTML.substring(0, 200)}`
                });
            }
        }
    }, true);

    window.addEventListener('unhandledrejection', function(event) {
        const reason = event.reason;
        reportError({
            type: 'promise',
            message: reason instanceof Error ? reason.message : String(reason),
            stack_trace: reason instanceof Error ? reason.stack : null,
            file_name: window.location.pathname
        });
    });

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : args[0].url;
            if (!response.ok && !url.includes('site_errors')) {
                reportError({
                    type: 'network',
                    message: `HTTP Error ${response.status}: ${response.statusText}`,
                    file_name: url,
                    stack_trace: `Method: ${args[1]?.method || 'GET'}`
                });
            }
            return response;
        } catch (err) {
            reportError({
                type: 'network',
                message: `Fetch failed: ${err.message}`,
                file_name: typeof args[0] === 'string' ? args[0] : args[0].url,
                stack_trace: err.stack
            });
            throw err;
        }
    };

    if (window.location.hostname === 'localhost') {
        console.log('🚀 Error Tracker initialized and ready');
    }
})();
