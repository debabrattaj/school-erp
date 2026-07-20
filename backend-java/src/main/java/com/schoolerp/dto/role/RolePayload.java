package com.schoolerp.dto.role;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Map;

public class RolePayload {
    @NotBlank
    private String name;
    private String description;
    @NotNull
    private Map<String, String> permissions;

    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { this.description = v; }
    public Map<String, String> getPermissions() { return permissions; }
    public void setPermissions(Map<String, String> v) { this.permissions = v; }
}
