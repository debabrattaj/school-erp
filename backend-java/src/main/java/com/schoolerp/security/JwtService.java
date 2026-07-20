package com.schoolerp.security;

import com.schoolerp.config.SchoolErpProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Map;
import java.util.Optional;

/** HS256 JWT issuing/verification, equivalent to python-jose usage in backend/app/security.py. */
@Service
public class JwtService {

    private final SchoolErpProperties properties;
    private SecretKey key;

    public JwtService(SchoolErpProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        String secret = properties.getSecurity().getSecretKey();
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("SECRET_KEY is missing. Set it in the environment.");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String createAccessToken(Map<String, Object> claims) {
        Instant expiry = Instant.now().plus(properties.getSecurity().getAccessTokenExpireMinutes(), ChronoUnit.MINUTES);
        return Jwts.builder()
                .claims(claims)
                .expiration(Date.from(expiry))
                .signWith(key)
                .compact();
    }

    /** Returns empty if the token is missing, malformed, or expired. */
    public Optional<Claims> parseClaims(String token) {
        try {
            return Optional.of(Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload());
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
