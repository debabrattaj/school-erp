package com.schoolerp.dto.auth;

import jakarta.validation.constraints.NotBlank;

public class MfaCodeRequest {
    @NotBlank
    private String code;

    public String getCode() { return code; }
    public void setCode(String v) { this.code = v; }
}
