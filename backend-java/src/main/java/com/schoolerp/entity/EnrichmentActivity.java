package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "enrichment_activities")
public class EnrichmentActivity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "activity_code", nullable = false, unique = true)
    private String activityCode;

    @Column(nullable = false)
    private String activityName;

    @Column(nullable = false)
    private String activityType;

    private String category;
    private String coordinator;
    private LocalDate startDate;
    private LocalDate endDate;
    private String venue;
    private String eligibleClasses;
    private Integer capacity;
    private Integer enrolledCount = 0;
    private Double feeAmount = 0.0;
    private String status = "Planned";

    @Lob
    private String description;

    @Lob
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getActivityCode() { return activityCode; }
    public void setActivityCode(String v) { this.activityCode = v; }
    public String getActivityName() { return activityName; }
    public void setActivityName(String v) { this.activityName = v; }
    public String getActivityType() { return activityType; }
    public void setActivityType(String v) { this.activityType = v; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getCoordinator() { return coordinator; }
    public void setCoordinator(String v) { this.coordinator = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public String getVenue() { return venue; }
    public void setVenue(String v) { this.venue = v; }
    public String getEligibleClasses() { return eligibleClasses; }
    public void setEligibleClasses(String v) { this.eligibleClasses = v; }
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer v) { this.capacity = v; }
    public Integer getEnrolledCount() { return enrolledCount; }
    public void setEnrolledCount(Integer v) { this.enrolledCount = v; }
    public Double getFeeAmount() { return feeAmount; }
    public void setFeeAmount(Double v) { this.feeAmount = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { this.description = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
