package com.schoolerp.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.schoolerp.dto.role.RolePayload;
import com.schoolerp.entity.Role;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.RoleRepository;
import com.schoolerp.repository.UserRepository;
import com.schoolerp.security.PermissionCatalog;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/roles.py. */
@RestController
@RequestMapping("/roles")
public class RoleController {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final PermissionService permissionService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RoleController(RoleRepository roleRepository, UserRepository userRepository, PermissionService permissionService) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.permissionService = permissionService;
    }

    @GetMapping("/modules")
    public List<Map<String, String>> listModules() {
        permissionService.requireRoles("Admin");
        return PermissionCatalog.MODULES.stream()
                .map(m -> Map.of("key", m.key(), "label", m.label()))
                .toList();
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> listRoles() {
        permissionService.requireRoles("Admin", "Principal");
        ensureSystemRoles();
        return roleRepository.findAll().stream()
                .sorted(Comparator.<Role>comparingInt(r -> r.isSystem() ? 0 : 1).thenComparing(Role::getName))
                .map(this::serialize)
                .toList();
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createRole(@Valid @RequestBody RolePayload payload) {
        permissionService.requireRoles("Admin");

        String name = payload.getName().trim();
        if (name.isEmpty()) {
            throw ApiException.badRequest("Role name is required.");
        }
        if (roleRepository.findByName(name).isPresent()) {
            throw ApiException.badRequest("A role with that name already exists.");
        }

        Role role = new Role();
        role.setName(name);
        String description = payload.getDescription() == null ? null : payload.getDescription().trim();
        role.setDescription(description == null || description.isEmpty() ? null : description);
        role.setPermissions(toJson(cleanPermissions(payload.getPermissions())));
        role.setSystem(false);

        return serialize(roleRepository.save(role));
    }

    @PutMapping("/{roleId}")
    public Map<String, Object> updateRole(@PathVariable Long roleId, @Valid @RequestBody RolePayload payload) {
        permissionService.requireRoles("Admin");

        Role role = roleRepository.findById(roleId).orElseThrow(() -> ApiException.notFound("Role not found"));
        if (role.isSystem()) {
            throw ApiException.badRequest("Built-in roles cannot be edited.");
        }

        String description = payload.getDescription() == null ? null : payload.getDescription().trim();
        role.setDescription(description == null || description.isEmpty() ? null : description);
        role.setPermissions(toJson(cleanPermissions(payload.getPermissions())));

        return serialize(roleRepository.save(role));
    }

    @DeleteMapping("/{roleId}")
    public Map<String, String> deleteRole(@PathVariable Long roleId) {
        permissionService.requireRoles("Admin");

        Role role = roleRepository.findById(roleId).orElseThrow(() -> ApiException.notFound("Role not found"));
        if (role.isSystem()) {
            throw ApiException.badRequest("Built-in roles cannot be deleted.");
        }

        long inUse = userRepository.findAll().stream().filter(u -> role.getName().equals(u.getRole())).count();
        if (inUse > 0) {
            throw ApiException.badRequest(inUse + " user(s) still have this role. Reassign them first.");
        }

        roleRepository.delete(role);
        return Map.of("message", "Role deleted");
    }

    /** Idempotently make sure the built-in roles exist (for the roles UI). */
    private void ensureSystemRoles() {
        for (Map.Entry<String, Map<String, String>> entry : PermissionCatalog.SYSTEM_ROLE_PERMISSIONS.entrySet()) {
            if (roleRepository.findByName(entry.getKey()).isEmpty()) {
                Role role = new Role();
                role.setName(entry.getKey());
                role.setPermissions(toJson(entry.getValue()));
                role.setSystem(true);
                roleRepository.save(role);
            }
        }
    }

    private Map<String, String> cleanPermissions(Map<String, String> permissions) {
        Map<String, String> out = new LinkedHashMap<>();
        if (permissions == null) {
            return out;
        }
        for (Map.Entry<String, String> entry : permissions.entrySet()) {
            if (PermissionCatalog.MODULE_KEYS.contains(entry.getKey()) && ("view".equals(entry.getValue()) || "manage".equals(entry.getValue()))) {
                out.put(entry.getKey(), entry.getValue());
            }
        }
        return out;
    }

    private Map<String, Object> serialize(Role role) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", role.getId());
        body.put("name", role.getName());
        body.put("description", role.getDescription());
        body.put("is_system", role.isSystem());
        body.put("permissions", parsePermissions(role.getPermissions()));
        return body;
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

    private String toJson(Map<String, String> permissions) {
        try {
            return objectMapper.writeValueAsString(permissions);
        } catch (Exception e) {
            return "{}";
        }
    }
}
