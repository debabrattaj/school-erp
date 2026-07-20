package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "admission_inquiries")
public class AdmissionInquiry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String inquiryNo;

    @Column(nullable = false)
    private String studentName;

    @Column(nullable = false)
    private String gradeApplying;

    @Column(nullable = false)
    private String academicYear;

    @Column(nullable = false)
    private String guardianName;

    @Column(nullable = false)
    private String guardianPhone;

    private String guardianEmail;
    private String source;
    private String stage = "Inquiry";
    private LocalDate followUpDate;
    private String assignedTo;

    @Column(name = "converted_student_id")
    private Long convertedStudentId;

    @Lob
    private String notes;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getInquiryNo() { return inquiryNo; }
    public void setInquiryNo(String v) { this.inquiryNo = v; }
    public String getStudentName() { return studentName; }
    public void setStudentName(String v) { this.studentName = v; }
    public String getGradeApplying() { return gradeApplying; }
    public void setGradeApplying(String v) { this.gradeApplying = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getGuardianName() { return guardianName; }
    public void setGuardianName(String v) { this.guardianName = v; }
    public String getGuardianPhone() { return guardianPhone; }
    public void setGuardianPhone(String v) { this.guardianPhone = v; }
    public String getGuardianEmail() { return guardianEmail; }
    public void setGuardianEmail(String v) { this.guardianEmail = v; }
    public String getSource() { return source; }
    public void setSource(String v) { this.source = v; }
    public String getStage() { return stage; }
    public void setStage(String v) { this.stage = v; }
    public LocalDate getFollowUpDate() { return followUpDate; }
    public void setFollowUpDate(LocalDate v) { this.followUpDate = v; }
    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String v) { this.assignedTo = v; }
    public Long getConvertedStudentId() { return convertedStudentId; }
    public void setConvertedStudentId(Long v) { this.convertedStudentId = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { this.notes = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
