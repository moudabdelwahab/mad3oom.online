import { supabase } from './api-config.js';

/**
 * Generate a random base32 secret for TOTP
 */
export function generateSecret(length = 16) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < length; i++) {
        secret += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return secret;
}

/**
 * Generate a TOTP QR Code URL
 */
export function getQRCodeUrl(email, secret, issuer = 'Mad3oom') {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const issuerParam = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuerParam}`;
}

/**
 * Generate recovery codes
 */
export function generateRecoveryCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
        codes.push(Math.random().toString(36).substring(2, 10).toUpperCase());
    }
    return codes;
}

/**
 * Verify TOTP Code (Client-side simulation or via Edge Function)
 * Note: For real security, this should be verified on the server.
 * Since we are using Supabase, we'll implement an Edge Function for verification.
 */
export async function verify2FACode(userId, code) {
    const { data, error } = await supabase.functions.invoke('verify-2fa', {
        body: { userId, code }
    });
    return { data, error };
}

/**
 * Enable 2FA for user
 */
export async function enable2FA(userId, secret, recoveryCodes) {
    const { data, error } = await supabase
        .from('profiles')
        .update({
            two_factor_enabled: true,
            two_factor_secret: secret,
            recovery_codes: recoveryCodes
        })
        .eq('id', userId);
    
    return { data, error };
}

/**
 * Disable 2FA for user
 */
export async function disable2FA(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .update({
            two_factor_enabled: false,
            two_factor_secret: null,
            recovery_codes: null
        })
        .eq('id', userId);
    
    return { data, error };
}

/**
 * Manage Trusted Devices
 */
export async function getTrustedDevices(userId) {
    return await supabase
        .from('trusted_devices')
        .select('*')
        .eq('user_id', userId);
}

export async function addTrustedDevice(userId, deviceName, fingerprint, ipAddress = null) {
    return await supabase
        .from('trusted_devices')
        .insert({
            user_id: userId,
            device_name: deviceName,
            device_fingerprint: fingerprint,
            ip_address: ipAddress,
            last_login: new Date().toISOString()
        });
}

export async function removeTrustedDevice(deviceId) {
    return await supabase
        .from('trusted_devices')
        .delete()
        .eq('id', deviceId);
}

export async function removeAllTrustedDevices(userId) {
    return await supabase
        .from('trusted_devices')
        .delete()
        .eq('user_id', userId);
}
