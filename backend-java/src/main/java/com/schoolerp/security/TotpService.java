package com.schoolerp.security;

import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.Objects;

/**
 * TOTP (RFC 6238) for authenticator-app multi-factor auth. Direct port of
 * backend/app/totp.py: 6-digit codes, 30s step, HMAC-SHA1, +/-1 step window.
 */
@Service
public class TotpService {

    private static final int DIGITS = 6;
    private static final int STEP_SECONDS = 30;
    private static final String ISSUER = "School ERP";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    /** A fresh base32 secret (no padding), 160 bits per RFC recommendation. */
    public String generateSecret() {
        byte[] raw = new byte[20];
        RANDOM.nextBytes(raw);
        return base32Encode(raw);
    }

    public boolean verifyTotp(String secretB32, String code) {
        return verifyTotp(secretB32, code, 1);
    }

    public boolean verifyTotp(String secretB32, String code, int window) {
        if (secretB32 == null || secretB32.isBlank() || code == null || code.isBlank()) {
            return false;
        }
        String cleaned = code.trim().replace(" ", "");
        if (!cleaned.chars().allMatch(Character::isDigit)) {
            return false;
        }
        String padded = cleaned.length() >= DIGITS ? cleaned : "0".repeat(DIGITS - cleaned.length()) + cleaned;
        long counter = System.currentTimeMillis() / 1000L / STEP_SECONDS;
        for (int drift = -window; drift <= window; drift++) {
            String expected = hotp(secretB32, counter + drift);
            if (constantTimeEquals(expected, padded)) {
                return true;
            }
        }
        return false;
    }

    public String provisioningUri(String secretB32, String accountName) {
        return provisioningUri(secretB32, accountName, ISSUER);
    }

    public String provisioningUri(String secretB32, String accountName, String issuer) {
        String label = urlEncode(issuer + ":" + accountName);
        return "otpauth://totp/" + label
                + "?secret=" + secretB32
                + "&issuer=" + urlEncode(issuer)
                + "&digits=" + DIGITS
                + "&period=" + STEP_SECONDS;
    }

    private String hotp(String secretB32, long counter) {
        try {
            byte[] key = base32Decode(secretB32);
            byte[] counterBytes = ByteBuffer.allocate(8).putLong(counter).array();
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] digest = mac.doFinal(counterBytes);
            int offset = digest[digest.length - 1] & 0x0F;
            int binary = ((digest[offset] & 0x7f) << 24)
                    | ((digest[offset + 1] & 0xff) << 16)
                    | ((digest[offset + 2] & 0xff) << 8)
                    | (digest[offset + 3] & 0xff);
            int code = binary % (int) Math.pow(10, DIGITS);
            return String.format(Locale.ROOT, "%0" + DIGITS + "d", code);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to compute TOTP", e);
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }

    private String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String base32Encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int bits = 0;
        int value = 0;
        for (byte b : data) {
            value = (value << 8) | (b & 0xFF);
            bits += 8;
            while (bits >= 5) {
                sb.append(BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 0x1F));
                bits -= 5;
            }
        }
        if (bits > 0) {
            sb.append(BASE32_ALPHABET.charAt((value << (5 - bits)) & 0x1F));
        }
        return sb.toString();
    }

    private static byte[] base32Decode(String encoded) {
        String clean = Objects.requireNonNullElse(encoded, "").trim().toUpperCase(Locale.ROOT).replace("=", "");
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int bits = 0;
        int value = 0;
        for (char c : clean.toCharArray()) {
            int idx = BASE32_ALPHABET.indexOf(c);
            if (idx < 0) continue;
            value = (value << 5) | idx;
            bits += 5;
            if (bits >= 8) {
                out.write((value >>> (bits - 8)) & 0xFF);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }
}
