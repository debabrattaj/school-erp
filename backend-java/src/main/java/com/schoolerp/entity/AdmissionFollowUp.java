package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "admission_follow_ups")
public class AdmissionFollowUp {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "inquiry_id", nullable = false)
    private Long inquiryId;

    @Column(nullable = false)
    private LocalDate activityDate;

    private String activityType = "Call";

    @Column(nullable = false)
    @Lob
    private String notes;

    private String nextAction;
    private LocalDate nextFollowUpDate;
    private String owner;
    private String outcome;

    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
}
