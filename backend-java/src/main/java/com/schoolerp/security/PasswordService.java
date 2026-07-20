package com.schoolerp.security;

import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Argon2id password hashing with the same parameters as argon2-cffi in
 * backend/app/security.py (time_cost=3, memory_cost=65536 KiB,
 * parallelism=4, hash_len=32, salt_len=16).
 */
@Service
public class PasswordService {

    private final Argon2PasswordEncoder encoder =
            new Argon2PasswordEncoder(16, 32, 4, 65536, 3);
    private final SchoolErpProperties properties;

    public PasswordService(SchoolErpProperties properties) {
        this.properties = properties;
    }

    public String hash(String rawPassword) {
        return encoder.encode(rawPassword);
    }

    public boolean verify(String rawPassword, String hashedPassword) {
        try {
            return encoder.matches(rawPassword, hashedPassword);
        } catch (Exception e) {
            return false;
        }
    }

    /** Enforce the password policy. Throws a 400 ApiException if too weak. */
    public void validate(String password) {
        int min = properties.getSecurity().getMinPasswordLength();
        if (password == null || password.length() < min) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least " + min + " characters.");
        }
    }
}
