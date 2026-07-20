package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "health_infirmary_visits")
public class HealthInfirmaryVisit {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(nullable = false)
    private LocalDate visitDate;

    private String visitTime;

    @Lob
    @Column(nullable = false)
    private String symptoms;

    @Lob
    private String diagnosis;

    @Lob
    private String treatment;

    private String medicineGiven;
    private String attendedBy;
    private Boolean referredToHospital = false;
    private LocalDate followUpDate;
    private String status = "Open";
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public LocalDate getVisitDate() { return visitDate; }
    public void setVisitDate(LocalDate v) { this.visitDate = v; }
    public String getVisitTime() { return visitTime; }
    public void setVisitTime(String v) { this.visitTime = v; }
    public String getSymptoms() { return symptoms; }
    public void setSymptoms(String v) { this.symptoms = v; }
    public String getDiagnosis() { return diagnosis; }
    public void setDiagnosis(String v) { this.diagnosis = v; }
    public String getTreatment() { return treatment; }
    public void setTreatment(String v) { this.treatment = v; }
    public String getMedicineGiven() { return medicineGiven; }
    public void setMedicineGiven(String v) { this.medicineGiven = v; }
    public String getAttendedBy() { return attendedBy; }
    public void setAttendedBy(String v) { this.attendedBy = v; }
    public Boolean getReferredToHospital() { return referredToHospital; }
    public void setReferredToHospital(Boolean v) { this.referredToHospital = v; }
    public LocalDate getFollowUpDate() { return followUpDate; }
    public void setFollowUpDate(LocalDate v) { this.followUpDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
