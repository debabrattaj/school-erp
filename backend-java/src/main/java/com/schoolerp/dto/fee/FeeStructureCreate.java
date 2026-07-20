package com.schoolerp.dto.fee;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class FeeStructureCreate {
    @NotBlank
    private String academicYear;
    private String className;
    private String residentialType;
    @NotBlank
    private String feeType;
    @NotNull
    private Double amount;
    private LocalDate dueDate;
    private String remarks;

    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getResidentialType() { return residentialType; }
    public void setResidentialType(String v) { this.residentialType = v; }
    public String getFeeType() { return feeType; }
    public void setFeeType(String v) { this.feeType = v; }
    public Double getAmount() { return amount; }
    public void setAmount(Double v) { this.amount = v; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate v) { this.dueDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
