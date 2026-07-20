package com.schoolerp.security;

import com.schoolerp.config.SchoolErpProperties;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * In-memory login rate limiter, direct port of backend/app/rate_limit.py.
 * Per-process only (same caveat as the Python original about multi-worker
 * deployments needing a shared store).
 */
@Component
public class LoginRateLimiter {

    private final int maxAttempts;
    private final long windowSeconds;
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<Long>> failures = new ConcurrentHashMap<>();

    public LoginRateLimiter(SchoolErpProperties properties) {
        this.maxAttempts = properties.getLoginThrottle().getMaxAttempts();
        this.windowSeconds = properties.getLoginThrottle().getWindowSeconds();
    }

    public List<String> loginKeys(String ip, String email) {
        List<String> keys = new java.util.ArrayList<>();
        keys.add("ip:" + (ip == null || ip.isBlank() ? "unknown" : ip));
        if (email != null && !email.isBlank()) {
            keys.add("user:" + email.trim().toLowerCase(Locale.ROOT));
        }
        return keys;
    }

    /** Returns null if allowed, else the Retry-After seconds until a slot frees. */
    public synchronized Integer checkLoginAllowed(List<String> keys) {
        long now = System.currentTimeMillis() / 1000L;
        Integer retryAfter = null;
        for (String key : keys) {
            prune(key, now);
            List<Long> attempts = failures.getOrDefault(key, new CopyOnWriteArrayList<>());
            if (attempts.size() >= maxAttempts) {
                int wait = (int) (windowSeconds - (now - attempts.get(0))) + 1;
                retryAfter = Math.max(retryAfter != null ? retryAfter : 0, wait);
            }
        }
        return retryAfter;
    }

    public synchronized void recordLoginFailure(List<String> keys) {
        long now = System.currentTimeMillis() / 1000L;
        for (String key : keys) {
            failures.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>()).add(now);
        }
    }

    public synchronized void clearLoginFailures(List<String> keys) {
        for (String key : keys) {
            failures.remove(key);
        }
    }

    private void prune(String key, long now) {
        long cutoff = now - windowSeconds;
        CopyOnWriteArrayList<Long> attempts = failures.get(key);
        if (attempts == null) {
            return;
        }
        attempts.removeIf(t -> t <= cutoff);
        if (attempts.isEmpty()) {
            failures.remove(key);
        }
    }
}
