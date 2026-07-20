package com.schoolerp.dto.enrollment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

public class StudentPromotionRequest {
    @NotNull
    private List<Long> studentIds;
    @NotNull
    private Long fromClassId;
    @NotNull
    private Long toClassId;
    @NotBlank
    private String fromAcademicYear;
    @NotBlank
    private String toAcademicYear;
    private LocalDate startDate;
    private String remarks;

    public List<Long> getStudentIds() { return studentIds; }
    public void setStudentIds(List<Long> v) { this.studentIds = v; }
    public Long getFromClassId() { return fromClassId; }
    public void setFromClassId(Long v) { this.fromClassId = v; }
    public Long getToClassId() { return toClassId; }
    public void setToClassId(Long v) { this.toClassId = v; }
    public String getFromAcademicYear() { return fromAcademicYear; }
    public void setFromAcademicYear(String v) { this.fromAcademicYear = v; }
    public String getToAcademicYear() { return toAcademicYear; }
    public void setToAcademicYear(String v) { this.toAcademicYear = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
