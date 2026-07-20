package com.schoolerp.dto.subject;

import jakarta.validation.constraints.NotNull;

public class ClassSubjectCreate {
    @NotNull
    private Long classId;
    private Long subjectId;
    private String subjectName;
    private String academicYear = "2026-27";
    private Long teacherId;
    private Integer weeklyPeriods = 0;
    private Boolean isActive = true;

    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public Long getSubjectId() { return subjectId; }
    public void setSubjectId(Long v) { this.subjectId = v; }
    public String getSubjectName() { return subjectName; }
    public void setSubjectName(String v) { this.subjectName = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getTeacherId() { return teacherId; }
    public void setTeacherId(Long v) { this.teacherId = v; }
    public Integer getWeeklyPeriods() { return weeklyPeriods; }
    public void setWeeklyPeriods(Integer v) { this.weeklyPeriods = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
}
