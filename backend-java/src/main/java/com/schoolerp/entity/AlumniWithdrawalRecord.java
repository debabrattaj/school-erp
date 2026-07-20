package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "alumni_withdrawal_records")
public class AlumniWithdrawalRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "record_no", nullable = false, unique = true)
    private String recordNo;

    @Column(name = "student_id")
    private Long studentId;

    @Column(nullable = false)
    private String studentName;

    private String admissionNo;
    private String lastClass;
    private String recordType = "Withdrawal";
    private LocalDate requestDate;
    private LocalDate leavingDate;

    @Column(nullable = false)
    private String reason;

    private String destinationSchool;
    private String destinationCountry;
    private String certificateStatus = "Pending";
    private String alumniEmail;
    private String alumniPhone;
    private String currentStatus = "Pending";
    private String approvedBy;
    private LocalDate approvalDate;

    @Lob
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getRecordNo() { return recordNo; }
    public void setRecordNo(String v) { this.recordNo = v; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public String getStudentName() { return studentName; }
    public void setStudentName(String v) { this.studentName = v; }
    public String getAdmissionNo() { return admissionNo; }
    public void setAdmissionNo(String v) { this.admissionNo = v; }
    public String getLastClass() { return lastClass; }
    public void setLastClass(String v) { this.lastClass = v; }
    public String getRecordType() { return recordType; }
    public void setRecordType(String v) { this.recordType = v; }
    public LocalDate getRequestDate() { return requestDate; }
    public void setRequestDate(LocalDate v) { this.requestDate = v; }
    public LocalDate getLeavingDate() { return leavingDate; }
    public void setLeavingDate(LocalDate v) { this.leavingDate = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
    public String getDestinationSchool() { return destinationSchool; }
    public void setDestinationSchool(String v) { this.destinationSchool = v; }
    public String getDestinationCountry() { return destinationCountry; }
    public void setDestinationCountry(String v) { this.destinationCountry = v; }
    public String getCertificateStatus() { return certificateStatus; }
    public void setCertificateStatus(String v) { this.certificateStatus = v; }
    public String getAlumniEmail() { return alumniEmail; }
    public void setAlumniEmail(String v) { this.alumniEmail = v; }
    public String getAlumniPhone() { return alumniPhone; }
    public void setAlumniPhone(String v) { this.alumniPhone = v; }
    public String getCurrentStatus() { return currentStatus; }
    public void setCurrentStatus(String v) { this.currentStatus = v; }
    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String v) { this.approvedBy = v; }
    public LocalDate getApprovalDate() { return approvalDate; }
    public void setApprovalDate(LocalDate v) { this.approvalDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
