package com.schoolerp.dto.enrollment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class StudentEnrollmentCreate {
    @NotNull
    private Long studentId;
    @NotNull
    private Long classId;
    @NotBlank
    private String academicYear;
    private String rollNo;
    private LocalDate startDate;
    private LocalDate endDate;
    private String enrollmentStatus = "Active";
    private String promotionStatus = "Not Promoted";
    private String remarks;

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getRollNo() { return rollNo; }
    public void setRollNo(String v) { this.rollNo = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public String getEnrollmentStatus() { return enrollmentStatus; }
    public void setEnrollmentStatus(String v) { this.enrollmentStatus = v; }
    public String getPromotionStatus() { return promotionStatus; }
    public void setPromotionStatus(String v) { this.promotionStatus = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
