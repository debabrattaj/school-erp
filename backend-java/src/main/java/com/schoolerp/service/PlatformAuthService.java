package com.schoolerp.service;

import com.schoolerp.central.entity.PlatformAdmin;
import com.schoolerp.central.repository.PlatformAdminRepository;
import com.schoolerp.exception.ApiException;
import com.schoolerp.security.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Shared platform-owner bearer-token verification, direct port of
 * backend/app/routes/platform.py's require_platform_owner() dependency.
 * Used by both PlatformController and AccountController.
 */
@Service
public class PlatformAuthService {

    private final JwtService jwtService;
    private final PlatformAdminRepository platformAdminRepository;

    public PlatformAuthService(JwtService jwtService, PlatformAdminRepository platformAdminRepository) {
        this.jwtService = jwtService;
        this.platformAdminRepository = platformAdminRepository;
    }

    public PlatformAdmin requirePlatformOwner(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.toLowerCase().startsWith("bearer ")) {
            throw ApiException.unauthorized("Invalid or expired token");
        }
        Optional<Claims> claims = jwtService.parseClaims(authHeader.substring(7));
        if (claims.isEmpty()) {
            throw ApiException.unauthorized("Invalid or expired token");
        }
        if (!"platform".equals(claims.get().get("scope"))) {
            throw ApiException.forbidden("Platform owner access required");
        }
        long adminId;
        try {
            adminId = Long.parseLong(String.valueOf(claims.get().getSubject()));
        } catch (NumberFormatException e) {
            throw ApiException.unauthorized("Owner account not found");
        }
        PlatformAdmin admin = platformAdminRepository.findById(adminId).orElse(null);
        if (admin == null || !admin.isActive()) {
            throw ApiException.unauthorized("Owner account not found");
        }
        return admin;
    }
}
