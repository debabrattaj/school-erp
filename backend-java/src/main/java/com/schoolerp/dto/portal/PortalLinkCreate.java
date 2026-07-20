package com.schoolerp.dto.portal;

import jakarta.validation.constraints.NotNull;

public class PortalLinkCreate {
    @NotNull
    private Long userId;
    @NotNull
    private Long studentId;
    private String relationship;

    public Long getUserId() { return userId; }
    public void setUserId(Long v) { this.userId = v; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public String getRelationship() { return relationship; }
    public void setRelationship(String v) { this.relationship = v; }
}
