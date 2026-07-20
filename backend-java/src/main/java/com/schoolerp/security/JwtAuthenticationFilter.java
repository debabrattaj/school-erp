package com.schoolerp.security;

import com.schoolerp.entity.User;
import com.schoolerp.repository.UserRepository;
import com.schoolerp.tenant.TenantAccountService;
import com.schoolerp.tenant.TenantContext;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Runs on every request: resolves the tenant (equivalent to
 * backend/app/tenant.py's get_tenant_db dependency) and, if a valid bearer
 * token is present, loads the current user into the Spring SecurityContext
 * (equivalent to backend/app/security.py's get_current_user).
 *
 * Deliberately does not reject requests with a missing/invalid token here -
 * some endpoints (login, forgot-password) are intentionally anonymous.
 * Per-endpoint authorization is enforced by PermissionService.requireRoles,
 * matching the explicit Depends(require_roles([...])) call on each FastAPI
 * route.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final TenantAccountService tenantAccountService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, TenantAccountService tenantAccountService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.tenantAccountService = tenantAccountService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        try {
            TenantContext.setTenant(tenantAccountService.resolveAccountCode(request));

            String authHeader = request.getHeader("Authorization");
            if (authHeader != null && authHeader.toLowerCase().startsWith("bearer ")) {
                String token = authHeader.substring(7);
                Optional<Claims> claims = jwtService.parseClaims(token);
                if (claims.isPresent()) {
                    String email = claims.get().getSubject();
                    boolean isPlatformToken = "platform".equals(claims.get().get("scope"));
                    if (email != null && !isPlatformToken) {
                        userRepository.findByEmail(email).ifPresent(user -> {
                            var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole()));
                            var authentication = new UsernamePasswordAuthenticationToken(user, null, authorities);
                            SecurityContextHolder.getContext().setAuthentication(authentication);
                        });
                    }
                }
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            SecurityContextHolder.clearContext();
        }
    }
}
