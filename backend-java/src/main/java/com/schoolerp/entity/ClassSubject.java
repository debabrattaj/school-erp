package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "class_subjects", uniqueConstraints = {
        @UniqueConstraint(name = "uq_class_subject_name", columnNames = {"class_id", "academic_year", "subject_name"})
})
public class ClassSubject {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "class_id", nullable = false)
    private Long classId;

    @Column(name = "subject_id")
    private Long subjectId;

    @Column(nullable = false)
    private String subjectName;

    @Column(nullable = false)
    private String academicYear = "2026-27";

    @Column(name = "teacher_id")
    private Long teacherId;

    private Integer weeklyPeriods = 0;
    private boolean isActive = true;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
    @com.fasterxml.jackson.annotation.JsonProperty("is_active")
    public boolean isActive() { return isActive; }
    public void setActive(boolean v) { this.isActive = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
