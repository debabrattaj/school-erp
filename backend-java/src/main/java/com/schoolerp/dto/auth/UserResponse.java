package com.schoolerp.dto.auth;

import com.schoolerp.entity.User;

public class UserResponse {
    private Long id;
    private String name;
    private String email;
    private String role;

    public static UserResponse from(User user) {
        UserResponse dto = new UserResponse();
        dto.id = user.getId();
        dto.name = user.getName();
        dto.email = user.getEmail();
        dto.role = user.getRole();
        return dto;
    }

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getRole() { return role; }
    public void setRole(String v) { this.role = v; }
}
