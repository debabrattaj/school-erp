package com.schoolerp.dto.subject;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class ClassExamMappingCreate {
    @NotNull
    private Long classId;
    @NotNull
    private Long examId;
    @NotBlank
    private String academicYear;
    private LocalDate examDate;
    private Boolean isActive = true;
    private String remarks;

    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public Long getExamId() { return examId; }
    public void setExamId(Long v) { this.examId = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate v) { this.examDate = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
