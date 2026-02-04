/**
 * Centralized Error Logging System - Frontend Tracker
 * Project: mad3oom.online
 * Author: Senior Full-Stack Engineer (Manus)
 */

(function() {
    // Configuration
    const CONFIG = {
        API_URL: 'https://srnelrdpqkcntbgudyto.supabase.co/rest/v1/site_errors',
        API_KEY: 'sb_publishable_0pvB8_xD0txjdJBkYqXMyg__jKMw71W',
        DEBOUNCE_MS: 1000,
        MAX_ERRORS_PER_SESSION: 50,
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
        // Rate limiting & Spam prevention
        const now = Date.now();
        if (now - lastErrorTime < CONFIG.DEBOUNCE_MS) return;
        if (errorCount >= CONFIG.MAX_ERRORS_PER_SESSION) return;

        // Ignore browser extensions and common noise
        if (CONFIG.IGNORE_PATTERNS.some(pattern => 
            pattern.test(errorData.message) || 
            pattern.test(errorData.file_name) || 
            pattern.test(errorData.stack_trace)
        )) return;

        errorCount++;
        lastErrorTime = now;

        try {
            // Get current user ID if available (from localStorage or global state)
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

            // Use Beacon API if available for better performance on page unload
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                const success = navigator.sendBeacon(CONFIG.API_URL, blob);
                if (success) return;
            }

            // Fallback to fetch
            await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.API_KEY,
                    'Authorization': `Bearer ${CONFIG.API_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            // Silently fail to avoid infinite loops
            console.warn('Error Tracker failed to report:', err);
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
        return false; // Let the error propagate to console
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

    // 3. Capture Network Errors (Optional/Enhanced)
    const originalFetch = window.fetch;
    window.fetch = function() {
        return originalFetch.apply(this, arguments).catch(err => {
            reportError({
                type: 'network',
                message: `Fetch failed: ${err.message}`,
                file_name: arguments[0],
                stack_trace: err.stack
            });
            throw err;
        });
    };

    console.log('🚀 Error Tracker initialized');
})();
