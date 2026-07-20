package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "multi_curriculum_plans")
public class MultiCurriculumPlan {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String programName;

    @Column(nullable = false)
    private String curriculumTrack;

    @Column(nullable = false)
    private String gradeLevel;

    @Column(nullable = false)
    private String academicYear;

    @Column(name = "class_id")
    private Long classId;

    @Lob
    private String subjectGroups;

    private String assessmentModel;
    private String coordinator;
    private String status = "Draft";

    @Lob
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getProgramName() { return programName; }
    public void setProgramName(String v) { this.programName = v; }
    public String getCurriculumTrack() { return curriculumTrack; }
    public void setCurriculumTrack(String v) { this.curriculumTrack = v; }
    public String getGradeLevel() { return gradeLevel; }
    public void setGradeLevel(String v) { this.gradeLevel = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getSubjectGroups() { return subjectGroups; }
    public void setSubjectGroups(String v) { this.subjectGroups = v; }
    public String getAssessmentModel() { return assessmentModel; }
    public void setAssessmentModel(String v) { this.assessmentModel = v; }
    public String getCoordinator() { return coordinator; }
    public void setCoordinator(String v) { this.coordinator = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
