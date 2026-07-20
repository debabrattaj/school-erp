package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "fee_structures", uniqueConstraints = {
        @UniqueConstraint(name = "uq_fee_structure_year_class_res_type",
                columnNames = {"academic_year", "class_name", "residential_type", "fee_type"})
})
public class FeeStructure {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String academicYear;

    private String className;
    private String residentialType;

    @Column(nullable = false)
    private String feeType;

    @Column(nullable = false)
    private Double amount;

    private LocalDate dueDate;
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
