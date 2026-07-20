package com.schoolerp.dto.fee;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class FeeBulkClassCreate {
    @NotBlank
    private String className;
    private String section;
    @NotBlank
    private String feeType;
    private String academicYear;
    private Double totalAmount;
    private Double paidAmount = 0.0;
    private LocalDate paymentDate;
    private LocalDate dueDate;
    private String remarks;

    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getSection() { return section; }
    public void setSection(String v) { this.section = v; }
    public String getFeeType() { return feeType; }
    public void setFeeType(String v) { this.feeType = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Double getTotalAmount() { return totalAmount; }
    public void setTotalAmount(Double v) { this.totalAmount = v; }
    public Double getPaidAmount() { return paidAmount; }
    public void setPaidAmount(Double v) { this.paidAmount = v; }
    public LocalDate getPaymentDate() { return paymentDate; }
    public void setPaymentDate(LocalDate v) { this.paymentDate = v; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate v) { this.dueDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
