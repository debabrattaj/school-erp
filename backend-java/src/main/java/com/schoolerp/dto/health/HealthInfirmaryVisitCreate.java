package com.schoolerp.dto.health;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class HealthInfirmaryVisitCreate {
    @NotNull
    private Long studentId;
    @NotNull
    private LocalDate visitDate;
    private String visitTime;
    @NotBlank
    private String symptoms;
    private String diagnosis;
    private String treatment;
    private String medicineGiven;
    private String attendedBy;
    private Boolean referredToHospital = false;
    private LocalDate followUpDate;
    private String status = "Open";
    private String remarks;

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
}
