package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "class_exam_mappings", uniqueConstraints = {
        @UniqueConstraint(name = "uq_class_exam_academic_year", columnNames = {"class_id", "exam_id", "academic_year"})
})
public class ClassExamMapping {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "class_id", nullable = false)
    private Long classId;

    @Column(name = "exam_id", nullable = false)
    private Long examId;

    @Column(nullable = false)
    private String academicYear;

    private LocalDate examDate;
    private boolean isActive = true;
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public Long getExamId() { return examId; }
    public void setExamId(Long v) { this.examId = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate v) { this.examDate = v; }
    @com.fasterxml.jackson.annotation.JsonProperty("is_active")
    public boolean isActive() { return isActive; }
    public void setActive(boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
