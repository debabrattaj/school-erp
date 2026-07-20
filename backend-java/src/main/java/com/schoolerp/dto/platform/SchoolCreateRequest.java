package com.schoolerp.dto.platform;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

public class SchoolCreateRequest {
    @NotBlank
    private String schoolName;
    @NotBlank
    private String accountCode;
    private String domain;
    private String schoolType = "English Medium";
    private String curriculum = "CBSE";
    private String country = "India";
    private String timezone = "Asia/Calcutta";
    @NotBlank
    private String adminName;
    @NotBlank
    private String adminEmail;
    @NotBlank
    private String adminPassword;
    private Map<String, Boolean> features;

    public String getSchoolName() { return schoolName; }
    public void setSchoolName(String v) { this.schoolName = v; }
    public String getAccountCode() { return accountCode; }
    public void setAccountCode(String v) { this.accountCode = v; }
    public String getDomain() { return domain; }
    public void setDomain(String v) { this.domain = v; }
    public String getSchoolType() { return schoolType; }
    public void setSchoolType(String v) { this.schoolType = v; }
    public String getCurriculum() { return curriculum; }
    public void setCurriculum(String v) { this.curriculum = v; }
    public String getCountry() { return country; }
    public void setCountry(String v) { this.country = v; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String v) { this.timezone = v; }
    public String getAdminName() { return adminName; }
    public void setAdminName(String v) { this.adminName = v; }
    public String getAdminEmail() { return adminEmail; }
    public void setAdminEmail(String v) { this.adminEmail = v; }
    public String getAdminPassword() { return adminPassword; }
    public void setAdminPassword(String v) { this.adminPassword = v; }
    public Map<String, Boolean> getFeatures() { return features; }
    public void setFeatures(Map<String, Boolean> v) { this.features = v; }
}
