package com.schoolerp.controller;

import com.schoolerp.dto.auth.UserResponse;
import com.schoolerp.dto.user.PasswordResetRequest;
import com.schoolerp.dto.user.UserCreate;
import com.schoolerp.entity.User;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.RoleRepository;
import com.schoolerp.repository.UserRepository;
import com.schoolerp.security.PasswordService;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/users.py. */
@RestController
@RequestMapping("/users")
public class UserController {

    private static final List<String> ALLOWED_ROLES = List.of("Admin", "Principal", "Accounts", "Teacher", "Parent", "Student");

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordService passwordService;
    private final PermissionService permissionService;

    public UserController(UserRepository userRepository, RoleRepository roleRepository, PasswordService passwordService, PermissionService permissionService) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordService = passwordService;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public UserResponse createUser(@Valid @RequestBody UserCreate payload) {
        permissionService.requireRoles("Admin");

        validateRole(payload.getRole());
        passwordService.validate(payload.getPassword());

        if (userRepository.findByEmail(payload.getEmail()).isPresent()) {
            throw ApiException.badRequest("User with this email already exists");
        }

        User user = new User();
        user.setName(payload.getName());
        user.setEmail(payload.getEmail());
        user.setPasswordHash(passwordService.hash(payload.getPassword()));
        user.setRole(payload.getRole());

        return UserResponse.from(userRepository.save(user));
    }

    @GetMapping({"", "/"})
    public List<UserResponse> getUsers() {
        permissionService.requireRoles("Admin");
        return userRepository.findAll().stream()
                .sorted((a, b) -> Long.compare(b.getId(), a.getId()))
                .map(UserResponse::from)
                .toList();
    }

    @GetMapping("/{userId}")
    public UserResponse getUser(@PathVariable Long userId) {
        permissionService.requireRoles("Admin");
        return UserResponse.from(userRepository.findById(userId).orElseThrow(() -> ApiException.notFound("User not found")));
    }

    @PutMapping("/{userId}")
    public UserResponse updateUser(@PathVariable Long userId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin");

        User user = userRepository.findById(userId).orElseThrow(() -> ApiException.notFound("User not found"));

        if (updateData.containsKey("role") && updateData.get("role") != null) {
            String role = updateData.get("role").toString();
            validateRole(role);
            user.setRole(role);
        }
        if (updateData.containsKey("email") && updateData.get("email") != null) {
            String email = updateData.get("email").toString();
            userRepository.findByEmail(email).ifPresent(existing -> {
                if (!existing.getId().equals(userId)) {
                    throw ApiException.badRequest("Another user with this email already exists");
                }
            });
            user.setEmail(email);
        }
        if (updateData.containsKey("name") && updateData.get("name") != null) {
            user.setName(updateData.get("name").toString());
        }

        return UserResponse.from(userRepository.save(user));
    }

    @PutMapping("/{userId}/reset-password")
    public Map<String, String> resetPassword(@PathVariable Long userId, @Valid @RequestBody PasswordResetRequest payload) {
        permissionService.requireRoles("Admin");

        User user = userRepository.findById(userId).orElseThrow(() -> ApiException.notFound("User not found"));
        passwordService.validate(payload.getNewPassword());
        user.setPasswordHash(passwordService.hash(payload.getNewPassword()));
        userRepository.save(user);

        return Map.of("message", "Password reset successfully");
    }

    @DeleteMapping("/{userId}")
    public Map<String, String> deleteUser(@PathVariable Long userId) {
        User currentUser = permissionService.requireRoles("Admin");

        User user = userRepository.findById(userId).orElseThrow(() -> ApiException.notFound("User not found"));
        if (user.getId().equals(currentUser.getId())) {
            throw ApiException.badRequest("You cannot delete your own account");
        }

        userRepository.delete(user);
        return Map.of("message", "User deleted successfully");
    }

    private void validateRole(String role) {
        if (ALLOWED_ROLES.contains(role)) {
            return;
        }
        if (roleRepository.findByName(role).isPresent()) {
            return;
        }
        throw ApiException.badRequest("Invalid role. Use a built-in role or an existing custom role.");
    }
}
