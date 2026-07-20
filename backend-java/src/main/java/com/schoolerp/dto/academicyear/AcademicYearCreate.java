package com.schoolerp.dto.academicyear;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class AcademicYearCreate {
    @NotBlank
    private String name;
    private LocalDate startDate;
    private LocalDate endDate;
    private String remarks;

    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
