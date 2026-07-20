package com.schoolerp.dto.transport;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class TransportAssignmentCreate {
    @NotNull
    private Long studentId;
    @NotNull
    private Long routeId;
    private Long vehicleId;
    private Long stopId;
    private LocalDate startDate;
    private LocalDate endDate;
    private String status = "Active";
    private String remarks;

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public Long getRouteId() { return routeId; }
    public void setRouteId(Long v) { this.routeId = v; }
    public Long getVehicleId() { return vehicleId; }
    public void setVehicleId(Long v) { this.vehicleId = v; }
    public Long getStopId() { return stopId; }
    public void setStopId(Long v) { this.stopId = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
