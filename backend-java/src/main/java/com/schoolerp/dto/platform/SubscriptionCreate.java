package com.schoolerp.dto.platform;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class SubscriptionCreate {
    @NotNull
    private Long accountId;
    @NotNull
    private Long planId;
    private String billingCycle = "yearly";
    private Integer amountPaid = 0;
    private String currency = "INR";
    @NotBlank
    private String startDate;
    private Integer months = 12;
    private String paymentReference;
    private String remarks;

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
    public String getStartDate() { return startDate; }
    public void setStartDate(String v) { this.startDate = v; }
    public Integer getMonths() { return months; }
    public void setMonths(Integer v) { this.months = v; }
    public String getPaymentReference() { return paymentReference; }
    public void setPaymentReference(String v) { this.paymentReference = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
