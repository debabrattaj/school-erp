package com.schoolerp.dto.transport;

import jakarta.validation.constraints.NotBlank;

public class TransportRouteCreate {
    @NotBlank
    private String routeName;
    private String startPoint;
    private String endPoint;
    private Double monthlyFee = 0.0;
    private Boolean isActive = true;
    private String remarks;

    public String getRouteName() { return routeName; }
    public void setRouteName(String v) { this.routeName = v; }
    public String getStartPoint() { return startPoint; }
    public void setStartPoint(String v) { this.startPoint = v; }
    public String getEndPoint() { return endPoint; }
    public void setEndPoint(String v) { this.endPoint = v; }
    public Double getMonthlyFee() { return monthlyFee; }
    public void setMonthlyFee(Double v) { this.monthlyFee = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
