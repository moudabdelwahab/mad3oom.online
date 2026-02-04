import { supabase } from './api-config.js';

/* ======================================================
   2FA – FRONTEND SAFE IMPLEMENTATION
   ====================================================== */

/**
 * Generate 2FA Secret + QR Code
 * (Server-side via Edge Function)
 */
export async function generate2FASecret() {
    const { data, error } = await supabase.functions.invoke('generate-2fa-secret');

    if (error) {
        console.error('Generate 2FA Secret Error:', error);
        throw error;
    }

    // data => { base32, otpauth_url }
    return data;
}

/**
 * Verify TOTP Code
 * (Server-side verification)
 */
export async function verify2FACode(code, tempSecret) {
    const { data, error } = await supabase.functions.invoke('verify-2fa', {
        body: {
            code,
            tempSecret
        }
    });

    if (error) {
        console.error('Verify 2FA Error:', error);
        throw error;
    }

    return data; // { verified: true | false }
}


/**
 * Enable 2FA for user
 * (CALL ONLY AFTER verify === true)
 */
export async function enable2FA(userId, secretBase32, recoveryCodes) {
    const { data, error } = await supabase
        .from('profiles')
        .update({
            two_factor_enabled: true,
            two_factor_secret: secretBase32,
            recovery_codes: recoveryCodes
        })
        .eq('id', userId);

    if (error) {
        console.error('Enable 2FA Error:', error);
        throw error;
    }

    return data;
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

    if (error) {
        console.error('Disable 2FA Error:', error);
        throw error;
    }

    return data;
}

/* ======================================================
   RECOVERY CODES (Frontend – acceptable, not critical)
   ====================================================== */

export function generateRecoveryCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
        codes.push(
            crypto.randomUUID()
                .replace(/-/g, '')
                .substring(0, 10)
                .toUpperCase()
        );
    }
    return codes;
}

/* ======================================================
   TRUSTED DEVICES
   ====================================================== */

export async function getTrustedDevices(userId) {
    const { data, error } = await supabase
        .from('trusted_devices')
        .select('*')
        .eq('user_id', userId);

    if (error) throw error;
    return data;
}

export async function addTrustedDevice(
    userId,
    deviceName,
    fingerprint,
    ipAddress = null
) {
    const { data, error } = await supabase
        .from('trusted_devices')
        .insert({
            user_id: userId,
            device_name: deviceName,
            device_fingerprint: fingerprint,
            ip_address: ipAddress,
            last_login: new Date().toISOString()
        });

    if (error) throw error;
    return data;
}

export async function removeTrustedDevice(deviceId) {
    const { error } = await supabase
        .from('trusted_devices')
        .delete()
        .eq('id', deviceId);

    if (error) throw error;
}

export async function removeAllTrustedDevices(userId) {
    const { error } = await supabase
        .from('trusted_devices')
        .delete()
        .eq('user_id', userId);

    if (error) throw error;
}
