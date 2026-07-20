package com.schoolerp.dto.inventory;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

public class InventoryBulkIssueRequest {
    @NotEmpty
    private List<Item> items;
    @NotEmpty
    private List<Long> studentIds;
    @NotNull
    private LocalDate transactionDate;
    @NotNull
    private String cycle;
    @NotNull
    private String academicYear;
    private String referenceNo;
    private String remarks;

    public List<Item> getItems() { return items; }
    public void setItems(List<Item> v) { this.items = v; }
    public List<Long> getStudentIds() { return studentIds; }
    public void setStudentIds(List<Long> v) { this.studentIds = v; }
    public LocalDate getTransactionDate() { return transactionDate; }
    public void setTransactionDate(LocalDate v) { this.transactionDate = v; }
    public String getCycle() { return cycle; }
    public void setCycle(String v) { this.cycle = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getReferenceNo() { return referenceNo; }
    public void setReferenceNo(String v) { this.referenceNo = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }

    public static class Item {
        @NotNull
        private Long itemId;
        @NotNull
        private Double quantityPerStudent;

        public Long getItemId() { return itemId; }
        public void setItemId(Long v) { this.itemId = v; }
        public Double getQuantityPerStudent() { return quantityPerStudent; }
        public void setQuantityPerStudent(Double v) { this.quantityPerStudent = v; }
    }
}
