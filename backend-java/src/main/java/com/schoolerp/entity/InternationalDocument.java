package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "international_documents")
public class InternationalDocument {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(nullable = false)
    private String documentType;

    private String documentNo;
    private LocalDate issueDate;
    private LocalDate expiryDate;
    private String issuingCountry;
    private String status = "Pending";
    private String fileUrl;
    private String verifiedBy;
    private LocalDate verifiedDate;

    @Lob
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public String getDocumentType() { return documentType; }
    public void setDocumentType(String v) { this.documentType = v; }
    public String getDocumentNo() { return documentNo; }
    public void setDocumentNo(String v) { this.documentNo = v; }
    public LocalDate getIssueDate() { return issueDate; }
    public void setIssueDate(LocalDate v) { this.issueDate = v; }
    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate v) { this.expiryDate = v; }
    public String getIssuingCountry() { return issuingCountry; }
    public void setIssuingCountry(String v) { this.issuingCountry = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getFileUrl() { return fileUrl; }
    public void setFileUrl(String v) { this.fileUrl = v; }
    public String getVerifiedBy() { return verifiedBy; }
    public void setVerifiedBy(String v) { this.verifiedBy = v; }
    public LocalDate getVerifiedDate() { return verifiedDate; }
    public void setVerifiedDate(LocalDate v) { this.verifiedDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
