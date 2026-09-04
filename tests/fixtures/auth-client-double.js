/** بديل اختباري لـ auth-client.js — يرجّع مستخدم ثابت بدون أي جلسة حقيقية. */
export async function requireAuth() {
    return window.__FIXTURES__?.authUser || null;
}
export async function logout() {}
export async function updateProfile(updates) {
    window.__CALLS__ = window.__CALLS__ || [];
    window.__CALLS__.push(['updateProfile', updates]);
    return { data: updates, error: null };
}
export async function updatePassword(pw) {
    window.__CALLS__ = window.__CALLS__ || [];
    window.__CALLS__.push(['updatePassword', pw.length]);
    return { data: {}, error: null };
}
export async function getCurrentUser() { return window.__FIXTURES__?.authUser || null; }
export async function autoRedirect() {}
export async function adminImpersonateUser() {}
