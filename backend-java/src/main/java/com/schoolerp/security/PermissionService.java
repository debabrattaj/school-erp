package com.schoolerp.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.schoolerp.entity.Role;
import com.schoolerp.entity.User;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.RoleRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;
import java.util.Set;

/**
 * Authorization, direct port of backend/app/security.py's get_current_user +
 * require_roles(). System roles keep their exact legacy name-based check;
 * custom roles are authorized by their JSON permission map (see
 * PermissionCatalog, ported from backend/app/permissions.py).
 */
@Service
public class PermissionService {

    private final RoleRepository roleRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PermissionService(RoleRepository roleRepository) {
        this.roleRepository = roleRepository;
    }

    /** Equivalent of Depends(get_current_user): the caller must have a valid token. */
    public User getCurrentUser() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            throw ApiException.unauthorized("Invalid or expired token");
        }
        return user;
    }

    /** Equivalent of Depends(require_roles([...])). */
    public User requireRoles(String... allowedRoles) {
        User currentUser = getCurrentUser();
        String roleName = currentUser.getRole();
        Set<String> allowed = Set.of(allowedRoles);

        // System roles: unchanged name-based check.
        if (PermissionCatalog.SYSTEM_ROLE_PERMISSIONS.containsKey(roleName)) {
            if (allowed.contains(roleName)) {
                return currentUser;
            }
            throw forbidden();
        }

        // Custom role: permission-map driven.
        Role role = roleRepository.findByName(roleName).orElse(null);
        if (role != null && !role.isSystem()) {
            Map<String, String> permissions = parsePermissions(role.getPermissions());
            HttpServletRequest request = currentRequest();
            String feature = request != null ? PermissionCatalog.featureForPath(request.getRequestURI()) : null;
            if (feature != null && request != null
                    && PermissionCatalog.permissionGrants(permissions, feature, PermissionCatalog.actionForMethod(request.getMethod()))) {
                return currentUser;
            }
            throw forbidden();
        }

        // Fallback (unknown role): legacy name check.
        if (allowed.contains(roleName)) {
            return currentUser;
        }
        throw forbidden();
    }

    private Map<String, String> parsePermissions(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private HttpServletRequest currentRequest() {
        var attrs = RequestContextHolder.getRequestAttributes();
        return attrs instanceof ServletRequestAttributes servletAttrs ? servletAttrs.getRequest() : null;
    }

    private ApiException forbidden() {
        return new ApiException(HttpStatus.FORBIDDEN, "You do not have permission to access this resource");
    }
}
