package com.schoolerp.dto.accounting;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class AccountTransactionCreate {
    @NotNull
    private LocalDate entryDate;
    @NotBlank
    private String entryType;
    @NotBlank
    private String category;
    @NotNull
    private Double amount;
    private String paymentMode;
    private String referenceNo;
    private String description;

    public LocalDate getEntryDate() { return entryDate; }
    public void setEntryDate(LocalDate v) { this.entryDate = v; }
    public String getEntryType() { return entryType; }
    public void setEntryType(String v) { this.entryType = v; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public Double getAmount() { return amount; }
    public void setAmount(Double v) { this.amount = v; }
    public String getPaymentMode() { return paymentMode; }
    public void setPaymentMode(String v) { this.paymentMode = v; }
    public String getReferenceNo() { return referenceNo; }
    public void setReferenceNo(String v) { this.referenceNo = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { this.description = v; }
}
