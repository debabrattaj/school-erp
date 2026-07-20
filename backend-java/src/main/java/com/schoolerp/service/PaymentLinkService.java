package com.schoolerp.service;

import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.security.JwtService;
import io.jsonwebtoken.Claims;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;

/**
 * Signed, expiring links to the public (no-login) fee payment page, direct
 * port of backend/app/payment_links.py. Guardians receive these over
 * WhatsApp/SMS; the token binds the link to one specific fee and expires.
 */
@Service
public class PaymentLinkService {

    private static final long PAYMENT_LINK_MINUTES = 60L * 24 * 30; // 30 days

    private final JwtService jwtService;
    private final SchoolErpProperties properties;

    public PaymentLinkService(JwtService jwtService, SchoolErpProperties properties) {
        this.jwtService = jwtService;
        this.properties = properties;
    }

    public String createPaymentLinkToken(Long feeId) {
        return jwtService.createToken(Map.of("fee_id", feeId), PAYMENT_LINK_MINUTES);
    }

    public boolean verifyPaymentLinkToken(Long feeId, String token) {
        Optional<Claims> claims = jwtService.parseClaims(token);
        if (claims.isEmpty()) {
            return false;
        }
        Object claimedFeeId = claims.get().get("fee_id");
        if (claimedFeeId instanceof Number number) {
            return number.longValue() == feeId;
        }
        return false;
    }

    public String buildPaymentLink(Long feeId) {
        String token = createPaymentLinkToken(feeId);
        return properties.getBackendBaseUrl() + "/fees/" + feeId + "/pay?token=" + token;
    }
}
