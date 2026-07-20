package com.schoolerp.dto.user;

import jakarta.validation.constraints.NotBlank;

public class PasswordResetRequest {
    @NotBlank
    private String newPassword;

    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String v) { this.newPassword = v; }
}
