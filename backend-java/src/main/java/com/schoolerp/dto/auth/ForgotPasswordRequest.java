package com.schoolerp.dto.auth;

import jakarta.validation.constraints.NotBlank;

public class ForgotPasswordRequest {
    @NotBlank
    private String email;
    private String accountCode = "default";

    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getAccountCode() { return accountCode; }
    public void setAccountCode(String v) { this.accountCode = v; }
}
