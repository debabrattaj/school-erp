package com.schoolerp.dto.counseling;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class CounselingCaseCreate {
    private String caseNo = "";
    @NotNull
    private Long studentId;
    @NotNull
    private String concernType;
    private String riskLevel = "Low";
    private String reportedBy;
    private String counselor;
    private LocalDate sessionDate;
    private LocalDate nextFollowUpDate;
    private Boolean guardianContacted = false;
    private String actionPlan;
    private String confidentialityLevel = "Restricted";
    private String status = "Open";
    private String outcome;
    private String remarks;

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
}
