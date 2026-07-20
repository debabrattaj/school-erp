package com.schoolerp.dto.mess;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class MessAttendanceCreate {
    @NotNull
    private Long studentId;
    @NotNull
    private LocalDate mealDate;
    @NotBlank
    private String mealType;
    private String status = "Present";
    private String remarks;

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public LocalDate getMealDate() { return mealDate; }
    public void setMealDate(LocalDate v) { this.mealDate = v; }
    public String getMealType() { return mealType; }
    public void setMealType(String v) { this.mealType = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
