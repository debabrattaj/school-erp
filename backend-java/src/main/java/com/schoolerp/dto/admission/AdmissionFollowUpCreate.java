package com.schoolerp.dto.admission;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class AdmissionFollowUpCreate {
    @NotNull
    private Long inquiryId;
    @NotNull
    private LocalDate activityDate;
    private String activityType = "Call";
    @NotBlank
    private String notes;
    private String nextAction;
    private LocalDate nextFollowUpDate;
    private String owner;
    private String outcome;

    public Long getInquiryId() { return inquiryId; }
    public void setInquiryId(Long v) { this.inquiryId = v; }
    public LocalDate getActivityDate() { return activityDate; }
    public void setActivityDate(LocalDate v) { this.activityDate = v; }
    public String getActivityType() { return activityType; }
    public void setActivityType(String v) { this.activityType = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { this.notes = v; }
    public String getNextAction() { return nextAction; }
    public void setNextAction(String v) { this.nextAction = v; }
    public LocalDate getNextFollowUpDate() { return nextFollowUpDate; }
    public void setNextFollowUpDate(LocalDate v) { this.nextFollowUpDate = v; }
    public String getOwner() { return owner; }
    public void setOwner(String v) { this.owner = v; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String v) { this.outcome = v; }
}
