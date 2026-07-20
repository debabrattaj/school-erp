package com.schoolerp.dto.enrollment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

public class YearEndRequest {
    @NotBlank
    private String fromAcademicYear;
    private String toAcademicYear;
    @NotNull
    private List<Action> actions;
    private LocalDate startDate;
    private boolean carryForwardFees = false;
    private String remarks;

    public String getFromAcademicYear() { return fromAcademicYear; }
    public void setFromAcademicYear(String v) { this.fromAcademicYear = v; }
    public String getToAcademicYear() { return toAcademicYear; }
    public void setToAcademicYear(String v) { this.toAcademicYear = v; }
    public List<Action> getActions() { return actions; }
    public void setActions(List<Action> v) { this.actions = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public boolean isCarryForwardFees() { return carryForwardFees; }
    public void setCarryForwardFees(boolean v) { this.carryForwardFees = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }

    public static class Action {
        @NotNull
        private Long studentId;
        @NotBlank
        private String action;
        private Long toClassId;

        public Long getStudentId() { return studentId; }
        public void setStudentId(Long v) { this.studentId = v; }
        public String getAction() { return action; }
        public void setAction(String v) { this.action = v; }
        public Long getToClassId() { return toClassId; }
        public void setToClassId(Long v) { this.toClassId = v; }
    }
}
