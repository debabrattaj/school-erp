package com.schoolerp.dto.subject;

import jakarta.validation.constraints.NotBlank;

public class SubjectCreate {
    @NotBlank
    private String subjectCode;
    @NotBlank
    private String subjectName;
    private String subjectType = "Scholastic";
    private Boolean isActive = true;

    public String getSubjectCode() { return subjectCode; }
    public void setSubjectCode(String v) { this.subjectCode = v; }
    public String getSubjectName() { return subjectName; }
    public void setSubjectName(String v) { this.subjectName = v; }
    public String getSubjectType() { return subjectType; }
    public void setSubjectType(String v) { this.subjectType = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
}
