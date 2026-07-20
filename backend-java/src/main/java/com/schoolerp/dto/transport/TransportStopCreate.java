package com.schoolerp.dto.transport;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class TransportStopCreate {
    @NotNull
    private Long routeId;
    @NotBlank
    private String stopName;
    private String pickupTime;
    private String dropTime;
    private Integer sortOrder = 0;
    private Boolean isActive = true;
    private String remarks;

    public Long getRouteId() { return routeId; }
    public void setRouteId(Long v) { this.routeId = v; }
    public String getStopName() { return stopName; }
    public void setStopName(String v) { this.stopName = v; }
    public String getPickupTime() { return pickupTime; }
    public void setPickupTime(String v) { this.pickupTime = v; }
    public String getDropTime() { return dropTime; }
    public void setDropTime(String v) { this.dropTime = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { this.sortOrder = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
