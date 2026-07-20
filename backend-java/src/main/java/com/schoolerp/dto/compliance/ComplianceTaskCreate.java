package com.schoolerp.dto.compliance;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class ComplianceTaskCreate {
    private String taskCode = "";
    @NotBlank
    private String accreditationBody;
    @NotBlank
    private String standardArea;
    @NotBlank
    private String requirement;
    private String evidenceLink;
    private String owner;
    private LocalDate dueDate;
    private LocalDate reviewDate;
    private String riskLevel = "Medium";
    private String status = "Open";
    private String finding;
    private String actionPlan;
    private LocalDate completedDate;
    private String remarks;

    public String getTaskCode() { return taskCode; }
    public void setTaskCode(String v) { this.taskCode = v; }
    public String getAccreditationBody() { return accreditationBody; }
    public void setAccreditationBody(String v) { this.accreditationBody = v; }
    public String getStandardArea() { return standardArea; }
    public void setStandardArea(String v) { this.standardArea = v; }
    public String getRequirement() { return requirement; }
    public void setRequirement(String v) { this.requirement = v; }
    public String getEvidenceLink() { return evidenceLink; }
    public void setEvidenceLink(String v) { this.evidenceLink = v; }
    public String getOwner() { return owner; }
    public void setOwner(String v) { this.owner = v; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate v) { this.dueDate = v; }
    public LocalDate getReviewDate() { return reviewDate; }
    public void setReviewDate(LocalDate v) { this.reviewDate = v; }
    public String getRiskLevel() { return riskLevel; }
    public void setRiskLevel(String v) { this.riskLevel = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getFinding() { return finding; }
    public void setFinding(String v) { this.finding = v; }
    public String getActionPlan() { return actionPlan; }
    public void setActionPlan(String v) { this.actionPlan = v; }
    public LocalDate getCompletedDate() { return completedDate; }
    public void setCompletedDate(LocalDate v) { this.completedDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
