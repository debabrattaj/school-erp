package com.schoolerp.dto.user;

import jakarta.validation.constraints.NotBlank;

public class UserCreate {
    @NotBlank
    private String name;
    @NotBlank
    private String email;
    @NotBlank
    private String password;
    @NotBlank
    private String role;

    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getPassword() { return password; }
    public void setPassword(String v) { this.password = v; }
    public String getRole() { return role; }
    public void setRole(String v) { this.role = v; }
}
