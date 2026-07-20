package com.schoolerp.dto.admission;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class AdmissionAssessmentCreate {
    @NotNull
    private Long inquiryId;
    @NotBlank
    private String assessmentType;
    @NotNull
    private LocalDate scheduledDate;
    private String scheduledTime;
    private String mode = "On Campus";
    private String panelMembers;
    private String location;
    private String status = "Scheduled";
    private Double score;
    private String outcome = "Pending";
    private LocalDate nextFollowUpDate;
    private String remarks;

    public Long getInquiryId() { return inquiryId; }
    public void setInquiryId(Long v) { this.inquiryId = v; }
    public String getAssessmentType() { return assessmentType; }
    public void setAssessmentType(String v) { this.assessmentType = v; }
    public LocalDate getScheduledDate() { return scheduledDate; }
    public void setScheduledDate(LocalDate v) { this.scheduledDate = v; }
    public String getScheduledTime() { return scheduledTime; }
    public void setScheduledTime(String v) { this.scheduledTime = v; }
    public String getMode() { return mode; }
    public void setMode(String v) { this.mode = v; }
    public String getPanelMembers() { return panelMembers; }
    public void setPanelMembers(String v) { this.panelMembers = v; }
    public String getLocation() { return location; }
    public void setLocation(String v) { this.location = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public Double getScore() { return score; }
    public void setScore(Double v) { this.score = v; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String v) { this.outcome = v; }
    public LocalDate getNextFollowUpDate() { return nextFollowUpDate; }
    public void setNextFollowUpDate(LocalDate v) { this.nextFollowUpDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
