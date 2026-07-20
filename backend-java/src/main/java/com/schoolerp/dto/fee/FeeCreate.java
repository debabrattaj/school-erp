package com.schoolerp.dto.fee;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class FeeCreate {
    @NotNull
    private Long studentId;
    @NotBlank
    private String feeType;
    private String academicYear;
    private Long classId;
    private String classNameSnapshot;
    private String sectionSnapshot;
    @NotNull
    private Double totalAmount;
    private Double paidAmount = 0.0;
    private LocalDate paymentDate;
    private LocalDate dueDate;
    private String receiptNo;
    private String remarks;

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public String getFeeType() { return feeType; }
    public void setFeeType(String v) { this.feeType = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getClassNameSnapshot() { return classNameSnapshot; }
    public void setClassNameSnapshot(String v) { this.classNameSnapshot = v; }
    public String getSectionSnapshot() { return sectionSnapshot; }
    public void setSectionSnapshot(String v) { this.sectionSnapshot = v; }
    public Double getTotalAmount() { return totalAmount; }
    public void setTotalAmount(Double v) { this.totalAmount = v; }
    public Double getPaidAmount() { return paidAmount; }
    public void setPaidAmount(Double v) { this.paidAmount = v; }
    public LocalDate getPaymentDate() { return paymentDate; }
    public void setPaymentDate(LocalDate v) { this.paymentDate = v; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate v) { this.dueDate = v; }
    public String getReceiptNo() { return receiptNo; }
    public void setReceiptNo(String v) { this.receiptNo = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
