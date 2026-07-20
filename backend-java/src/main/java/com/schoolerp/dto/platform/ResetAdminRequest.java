package com.schoolerp.dto.platform;

import jakarta.validation.constraints.NotBlank;

public class ResetAdminRequest {
    @NotBlank
    private String adminEmail;
    @NotBlank
    private String newPassword;
    private String adminName;

    public String getAdminEmail() { return adminEmail; }
    public void setAdminEmail(String v) { this.adminEmail = v; }
    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String v) { this.newPassword = v; }
    public String getAdminName() { return adminName; }
    public void setAdminName(String v) { this.adminName = v; }
}
