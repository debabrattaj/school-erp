package com.schoolerp.dto.transport;

import jakarta.validation.constraints.NotBlank;

public class TransportVehicleCreate {
    @NotBlank
    private String vehicleNo;
    private Long routeId;
    private String vehicleType = "Bus";
    private Integer capacity = 1;
    private String driverName;
    private String driverPhone;
    private String attendantName;
    private Boolean isActive = true;
    private String remarks;

    public String getVehicleNo() { return vehicleNo; }
    public void setVehicleNo(String v) { this.vehicleNo = v; }
    public Long getRouteId() { return routeId; }
    public void setRouteId(Long v) { this.routeId = v; }
    public String getVehicleType() { return vehicleType; }
    public void setVehicleType(String v) { this.vehicleType = v; }
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer v) { this.capacity = v; }
    public String getDriverName() { return driverName; }
    public void setDriverName(String v) { this.driverName = v; }
    public String getDriverPhone() { return driverPhone; }
    public void setDriverPhone(String v) { this.driverPhone = v; }
    public String getAttendantName() { return attendantName; }
    public void setAttendantName(String v) { this.attendantName = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
