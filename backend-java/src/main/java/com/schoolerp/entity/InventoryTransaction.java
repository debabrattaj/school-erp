package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "inventory_transactions")
public class InventoryTransaction {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "item_id", nullable = false)
    private Long itemId;

    @Column(nullable = false)
    private LocalDate transactionDate;

    @Column(nullable = false)
    private String transactionType;

    @Column(nullable = false)
    private Double quantity;

    @Column(name = "issued_to_student_id")
    private Long issuedToStudentId;

    private String issuedToStaff;
    private String referenceNo;
    private Double unitCost;
    private Double totalCost;
    private String remarks;
    private String cycle;
    private String academicYear;
    private Double unitPrice;
    private Double amount;
    private String paymentStatus;

    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
    public Double getTotalCost() { return totalCost; }
    public void setTotalCost(Double v) { this.totalCost = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public String getCycle() { return cycle; }
    public void setCycle(String v) { this.cycle = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Double getUnitPrice() { return unitPrice; }
    public void setUnitPrice(Double v) { this.unitPrice = v; }
    public Double getAmount() { return amount; }
    public void setAmount(Double v) { this.amount = v; }
    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String v) { this.paymentStatus = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
}
