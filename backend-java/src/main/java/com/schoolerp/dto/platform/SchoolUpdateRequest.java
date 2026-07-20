package com.schoolerp.dto.platform;

public class SchoolUpdateRequest {
    private String schoolName;
    private String domain;
    private String schoolType;
    private String curriculum;
    private String country;
    private String timezone;
    private String status;

    public String getSchoolName() { return schoolName; }
    public void setSchoolName(String v) { this.schoolName = v; }
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
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
}
