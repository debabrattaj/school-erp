package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "counseling_cases")
public class CounselingCase {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "case_no", nullable = false, unique = true)
    private String caseNo;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(nullable = false)
    private String concernType;

    private String riskLevel = "Low";
    private String reportedBy;
    private String counselor;
    private LocalDate sessionDate;
    private LocalDate nextFollowUpDate;
    private Boolean guardianContacted = false;

    @Lob
    private String actionPlan;

    private String confidentialityLevel = "Restricted";
    private String status = "Open";

    @Lob
    private String outcome;

    @Lob
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCaseNo() { return caseNo; }
    public void setCaseNo(String v) { this.caseNo = v; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public String getConcernType() { return concernType; }
    public void setConcernType(String v) { this.concernType = v; }
    public String getRiskLevel() { return riskLevel; }
    public void setRiskLevel(String v) { this.riskLevel = v; }
    public String getReportedBy() { return reportedBy; }
    public void setReportedBy(String v) { this.reportedBy = v; }
    public String getCounselor() { return counselor; }
    public void setCounselor(String v) { this.counselor = v; }
    public LocalDate getSessionDate() { return sessionDate; }
    public void setSessionDate(LocalDate v) { this.sessionDate = v; }
    public LocalDate getNextFollowUpDate() { return nextFollowUpDate; }
    public void setNextFollowUpDate(LocalDate v) { this.nextFollowUpDate = v; }
    public Boolean getGuardianContacted() { return guardianContacted; }
    public void setGuardianContacted(Boolean v) { this.guardianContacted = v; }
    public String getActionPlan() { return actionPlan; }
    public void setActionPlan(String v) { this.actionPlan = v; }
    public String getConfidentialityLevel() { return confidentialityLevel; }
    public void setConfidentialityLevel(String v) { this.confidentialityLevel = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String v) { this.outcome = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
