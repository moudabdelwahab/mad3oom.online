// ==================== Theme Manager ====================
/**
 * Theme Manager for Dark/Light Mode Toggle
 * Manages theme switching, localStorage persistence, and smooth transitions
 * Works under HTTPS and handles edge cases
 */

(function() {
    'use strict';
    
    const THEME_KEY = 'theme-preference';
    const NO_TRANSITION_CLASS = 'no-transition';
    
    /**
     * Get stored theme from localStorage (works under HTTPS)
     */
    function getStoredTheme() {
        try {
            // Check if localStorage is available and accessible
            if (typeof Storage !== 'undefined' && window.localStorage) {
                const stored = localStorage.getItem(THEME_KEY);
                // Validate stored value
                if (stored === 'light' || stored === 'dark') {
                    return stored;
                }
            }
        } catch (e) {
            // localStorage may be disabled or unavailable
            console.warn('Unable to access localStorage:', e);
        }
        return null;
    }

    /**
     * Get system theme preference
     */
    function getSystemTheme() {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        } catch (e) {
            console.warn('Unable to detect system theme:', e);
        }
        return 'light';
    }

    /**
     * Set theme attribute on HTML element immediately
     * This must run before CSS loads to prevent flash
     */
    function setThemeAttribute(theme) {
        if (document.documentElement && (theme === 'light' || theme === 'dark')) {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    /**
     * Apply theme to document
     */
    function applyTheme(theme, enableTransitions = true) {
        if (!theme || (theme !== 'light' && theme !== 'dark')) {
            theme = 'light';
        }

        if (!enableTransitions && document.documentElement) {
            // Disable transitions during initial load to prevent flash
            document.documentElement.classList.add(NO_TRANSITION_CLASS);
        }

        setThemeAttribute(theme);

        // Store preference (works under HTTPS)
        try {
            if (typeof Storage !== 'undefined' && window.localStorage) {
                localStorage.setItem(THEME_KEY, theme);
            }
        } catch (e) {
            console.warn('Unable to save theme preference:', e);
        }

        // Re-enable transitions after a short delay
        if (!enableTransitions && document.documentElement) {
            setTimeout(() => {
                if (document.documentElement) {
                    document.documentElement.classList.remove(NO_TRANSITION_CLASS);
                }
            }, 100);
        }
    }

    /**
     * Initialize theme immediately (before DOM is ready)
     * This prevents flash of unstyled content
     */
    function initializeTheme() {
        const storedTheme = getStoredTheme();
        const systemTheme = getSystemTheme();
        const theme = storedTheme || systemTheme;
        
        // Apply theme immediately to HTML element
        setThemeAttribute(theme);
        
        return theme;
    }

    /**
     * Theme Manager Class
     */
    class ThemeManager {
        constructor() {
            this.currentTheme = getStoredTheme() || getSystemTheme() || 'light';
            this.init();
        }

        /**
         * Initialize theme manager
         */
        init() {
            // Apply theme immediately to prevent flash
            applyTheme(this.currentTheme, false);
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupToggleButton());
            } else {
                this.setupToggleButton();
            }
        }

        /**
         * Apply theme to document
         */
        applyTheme(theme, enableTransitions = true) {
            if (!theme || (theme !== 'light' && theme !== 'dark')) {
                theme = 'light';
            }
            
            this.currentTheme = theme;
            applyTheme(theme, enableTransitions);
        }

        /**
         * Toggle between light and dark theme
         */
        toggleTheme() {
            const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.applyTheme(newTheme, true);
            return newTheme;
        }

        /**
         * Setup theme toggle button
         */
        setupToggleButton() {
            // Find theme toggle buttons (by ID or class)
            const getButtons = () => document.querySelectorAll('#themeToggleBtn, .theme-toggle:not(.notification-btn)');
            const toggleButtons = getButtons();
            
            if (toggleButtons.length === 0) {
                // Button might not be loaded yet, try again after a delay
                setTimeout(() => this.setupToggleButton(), 500);
                return;
            }

            // Add click handlers to all toggle buttons
            toggleButtons.forEach(button => {
                if (button.dataset.themeInitialized) return;
                
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleTheme();
                });

                button.dataset.themeInitialized = 'true';
                this.updateToggleButton(button);
            });

            // Watch for theme changes and update all buttons
            if (!this.observer) {
                this.observer = new MutationObserver(() => {
                    getButtons().forEach(button => this.updateToggleButton(button));
                });

                this.observer.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-theme']
                });
            }
        }

        /**
         * Update toggle button state
         */
        updateToggleButton(button) {
            if (!button) return;
            
            const theme = document.documentElement.getAttribute('data-theme') || 'light';
            const sunIcon = button.querySelector('.sun-icon');
            const moonIcon = button.querySelector('.moon-icon');
            
            if (sunIcon && moonIcon) {
                if (theme === 'dark') {
                    sunIcon.style.display = 'block';
                    moonIcon.style.display = 'none';
                } else {
                    sunIcon.style.display = 'none';
                    moonIcon.style.display = 'block';
                }
            }
        }

        /**
         * Get current theme
         */
        getTheme() {
            return this.currentTheme;
        }

        /**
         * Set theme programmatically
         */
        setTheme(theme) {
            if (theme === 'light' || theme === 'dark') {
                this.applyTheme(theme, true);
            }
        }
    }

    // Initialize theme IMMEDIATELY before DOM is ready
    // This prevents flash of unstyled content (FOUC)
    const initialTheme = initializeTheme();
    
    // Wait for DOM to be ready before creating ThemeManager instance
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.themeManager = new ThemeManager();
        });
    } else {
        window.themeManager = new ThemeManager();
    }

    // Export for use in other scripts
    window.initTheme = function() {
        if (!window.themeManager) {
            window.themeManager = new ThemeManager();
        }
        return window.themeManager;
    };
})();

