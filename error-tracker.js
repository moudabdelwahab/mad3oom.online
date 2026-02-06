/**
 * Centralized Error Logging System - Frontend Tracker (Final Fix)
 * Project: mad3oom.online
 * Author: Senior Full-Stack Engineer (Manus)
 */

(function() {
    // Configuration
    const CONFIG = {
        API_URL: 'https://srnelrdpqkcntbgudyto.supabase.co/rest/v1/site_errors',
        API_KEY: 'sb_publishable_0pvB8_xD0txjdJBkYqXMyg__jKMw71W',
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
                const supabaseAuth = localStorage.getItem('sb-srnelrdpqkcntbgudyto-auth-token');
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

            console.log('📡 Reporting error to Supabase...', payload.message);

            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.API_KEY,
                    'Authorization': `Bearer ${CONFIG.API_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload),
                keepalive: true
            });

            if (!response.ok) {
                console.error('❌ Failed to report error:', response.status, response.statusText);
            } else {
                console.log('✅ Error reported successfully');
            }
        } catch (err) {
            console.error('❌ Error Tracker Network Error:', err);
        }
    }

    // 1. Capture JS Runtime Errors
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
            // Resource errors (img, script, etc)
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

    // 2. Capture Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', function(event) {
        const reason = event.reason;
        reportError({
            type: 'promise',
            message: reason instanceof Error ? reason.message : String(reason),
            stack_trace: reason instanceof Error ? reason.stack : null,
            file_name: window.location.pathname
        });
    });

    // 3. Capture Fetch Errors (including 4xx and 5xx)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch.apply(this, args);
            // Don't report errors for our own logging API to avoid infinite loops
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

    console.log('🚀 Final Error Tracker initialized and ready');
})();
