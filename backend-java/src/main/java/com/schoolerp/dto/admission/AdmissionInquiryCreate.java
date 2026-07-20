package com.schoolerp.dto.admission;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class AdmissionInquiryCreate {
    private String inquiryNo = "";
    @NotBlank
    private String studentName;
    @NotBlank
    private String gradeApplying;
    @NotBlank
    private String academicYear;
    @NotBlank
    private String guardianName;
    @NotBlank
    private String guardianPhone;
    private String guardianEmail;
    private String source;
    private String stage = "Inquiry";
    private LocalDate followUpDate;
    private String assignedTo;
    private Long convertedStudentId;
    private String notes;

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
}
