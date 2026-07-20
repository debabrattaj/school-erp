package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Direct port of models.py's StudentEnrollment. */
@Entity
@Table(name = "student_enrollments")
public class StudentEnrollment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(name = "class_id")
    private Long classId;

    @Column(nullable = false)
    private String academicYear;
    private String classNameSnapshot;
    private String sectionSnapshot;
    private String rollNo;

    private String enrollmentStatus = "Active";
    private String promotionStatus = "Not Promoted";

    private LocalDate startDate;
    private LocalDate endDate;
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getClassNameSnapshot() { return classNameSnapshot; }
    public void setClassNameSnapshot(String v) { this.classNameSnapshot = v; }
    public String getSectionSnapshot() { return sectionSnapshot; }
    public void setSectionSnapshot(String v) { this.sectionSnapshot = v; }
    public String getRollNo() { return rollNo; }
    public void setRollNo(String v) { this.rollNo = v; }
    public String getEnrollmentStatus() { return enrollmentStatus; }
    public void setEnrollmentStatus(String v) { this.enrollmentStatus = v; }
    public String getPromotionStatus() { return promotionStatus; }
    public void setPromotionStatus(String v) { this.promotionStatus = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
