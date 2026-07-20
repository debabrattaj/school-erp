package com.schoolerp.dto.auth;

import jakarta.validation.constraints.NotBlank;

public class LoginRequest {
    @NotBlank
    private String email;
    @NotBlank
    private String password;
    private String accountCode = "default";
    private String mfaCode;

    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getPassword() { return password; }
    public void setPassword(String v) { this.password = v; }
    public String getAccountCode() { return accountCode; }
    public void setAccountCode(String v) { this.accountCode = v; }
    public String getMfaCode() { return mfaCode; }
    public void setMfaCode(String v) { this.mfaCode = v; }
}
