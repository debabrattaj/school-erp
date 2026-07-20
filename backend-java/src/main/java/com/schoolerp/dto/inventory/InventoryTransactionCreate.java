package com.schoolerp.dto.inventory;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class InventoryTransactionCreate {
    @NotNull
    private Long itemId;
    @NotNull
    private LocalDate transactionDate;
    @NotBlank
    private String transactionType;
    @NotNull
    private Double quantity;
    private Long issuedToStudentId;
    private String issuedToStaff;
    private String referenceNo;
    private Double unitCost;
    private String remarks;
    private String cycle;
    private String academicYear;
    private Double unitPrice;
    private String paymentStatus;

    public Long getItemId() { return itemId; }
    public void setItemId(Long v) { this.itemId = v; }
    public LocalDate getTransactionDate() { return transactionDate; }
    public void setTransactionDate(LocalDate v) { this.transactionDate = v; }
    public String getTransactionType() { return transactionType; }
    public void setTransactionType(String v) { this.transactionType = v; }
    public Double getQuantity() { return quantity; }
    public void setQuantity(Double v) { this.quantity = v; }
    public Long getIssuedToStudentId() { return issuedToStudentId; }
    public void setIssuedToStudentId(Long v) { this.issuedToStudentId = v; }
    public String getIssuedToStaff() { return issuedToStaff; }
    public void setIssuedToStaff(String v) { this.issuedToStaff = v; }
    public String getReferenceNo() { return referenceNo; }
    public void setReferenceNo(String v) { this.referenceNo = v; }
    public Double getUnitCost() { return unitCost; }
    public void setUnitCost(Double v) { this.unitCost = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public String getCycle() { return cycle; }
    public void setCycle(String v) { this.cycle = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Double getUnitPrice() { return unitPrice; }
    public void setUnitPrice(Double v) { this.unitPrice = v; }
    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String v) { this.paymentStatus = v; }
}
