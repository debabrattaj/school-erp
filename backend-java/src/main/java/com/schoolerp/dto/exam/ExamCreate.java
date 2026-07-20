package com.schoolerp.dto.exam;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class ExamCreate {
    @NotBlank
    private String examName;
    private String examType;
    private String className = "";
    private String section = "";
    private LocalDate examDate;
    private String academicYear;
    private String remarks;

    public String getExamName() { return examName; }
    public void setExamName(String v) { this.examName = v; }
    public String getExamType() { return examType; }
    public void setExamType(String v) { this.examType = v; }
    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getSection() { return section; }
    public void setSection(String v) { this.section = v; }
    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate v) { this.examDate = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
