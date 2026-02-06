/**
 * Centralized Error Logging System - Frontend Tracker (Enhanced)
 * Project: mad3oom.online
 * Author: Senior Full-Stack Engineer (Manus)
 */

(function() {
    // Configuration
    const CONFIG = {
        API_URL: 'https://srnelrdpqkcntbgudyto.supabase.co/rest/v1/site_errors',
        API_KEY: 'sb_publishable_0pvB8_xD0txjdJBkYqXMyg__jKMw71W',
        DEBOUNCE_MS: 500, // Reduced for better capture
        MAX_ERRORS_PER_SESSION: 100,
        IGNORE_PATTERNS: [
            /extensions\//i,
            /chrome-extension:/i,
            /moz-extension:/i,
            /safari-extension:/i,
            /top\.GLOBALS/i,
            /originalPrompt/i,
            /Clarity/i // Ignore Microsoft Clarity noise if any
        ]
    };

    let errorCount = 0;
    let lastErrorTime = 0;

    /**
     * Send error to Supabase
     */
    async function reportError(errorData) {
        // Rate limiting & Spam prevention
        const now = Date.now();
        if (now - lastErrorTime < CONFIG.DEBOUNCE_MS) return;
        if (errorCount >= CONFIG.MAX_ERRORS_PER_SESSION) return;

        // Ignore browser extensions and common noise
        const searchString = `${errorData.message} ${errorData.file_name} ${errorData.stack_trace}`;
        if (CONFIG.IGNORE_PATTERNS.some(pattern => pattern.test(searchString))) return;

        errorCount++;
        lastErrorTime = now;

        try {
            // Get current user ID if available
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

            // Use fetch with keepalive for reliability
            await fetch(CONFIG.API_URL, {
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
        } catch (err) {
            // Silently fail
        }
    }

    // 1. Capture JS Runtime Errors
    window.onerror = function(message, source, lineno, colno, error) {
        reportError({
            type: 'js',
            message: message,
            file_name: source,
            line_number: lineno,
            column_number: colno,
            stack_trace: error ? error.stack : null
        });
        return false;
    };

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

    // 3. Capture Resource Loading Errors (img, script, link)
    window.addEventListener('error', function(event) {
        const target = event.target || event.srcElement;
        const isElement = target instanceof HTMLElement;
        
        if (isElement) {
            const url = target.src || target.href;
            reportError({
                type: 'network',
                message: `Failed to load resource: ${target.tagName} (${url})`,
                file_name: url,
                stack_trace: `Element: ${target.outerHTML.substring(0, 200)}`
            });
        }
    }, true); // Use capture phase to catch resource errors

    // 4. Capture Fetch/XHR Errors (including 4xx and 5xx)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch.apply(this, args);
            if (!response.ok) {
                reportError({
                    type: 'network',
                    message: `HTTP Error ${response.status}: ${response.statusText}`,
                    file_name: typeof args[0] === 'string' ? args[0] : args[0].url,
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

    console.log('🚀 Enhanced Error Tracker initialized');
})();
