package com.schoolerp.dto.auth;

import jakarta.validation.constraints.NotBlank;

public class ResetPasswordConfirm {
    @NotBlank
    private String token;
    @NotBlank
    private String newPassword;

    public String getToken() { return token; }
    public void setToken(String v) { this.token = v; }
    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String v) { this.newPassword = v; }
}
