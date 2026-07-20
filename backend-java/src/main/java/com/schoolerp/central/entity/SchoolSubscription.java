package com.schoolerp.central.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** A school's active or past subscription. */
@Entity
@Table(name = "school_subscriptions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_sub_account_start", columnNames = {"account_id", "start_date"})
})
public class SchoolSubscription {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(name = "plan_id", nullable = false)
    private Long planId;

    private String billingCycle = "yearly";
    private Integer amountPaid = 0;
    private String currency = "INR";

    @Column(name = "start_date", nullable = false)
    private LocalDateTime startDate;

    @Column(name = "expiry_date", nullable = false)
    private LocalDateTime expiryDate;

    private String status = "Active";
    private String paymentReference;
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getAccountId() { return accountId; }
    public void setAccountId(Long v) { this.accountId = v; }
    public Long getPlanId() { return planId; }
    public void setPlanId(Long v) { this.planId = v; }
    public String getBillingCycle() { return billingCycle; }
    public void setBillingCycle(String v) { this.billingCycle = v; }
    public Integer getAmountPaid() { return amountPaid; }
    public void setAmountPaid(Integer v) { this.amountPaid = v; }
    public String getCurrency() { return currency; }
    public void setCurrency(String v) { this.currency = v; }
    public LocalDateTime getStartDate() { return startDate; }
    public void setStartDate(LocalDateTime v) { this.startDate = v; }
    public LocalDateTime getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDateTime v) { this.expiryDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getPaymentReference() { return paymentReference; }
    public void setPaymentReference(String v) { this.paymentReference = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
