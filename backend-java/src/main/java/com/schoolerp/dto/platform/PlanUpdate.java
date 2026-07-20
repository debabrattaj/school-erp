package com.schoolerp.dto.platform;

public class PlanUpdate {
    private String name;
    private Integer priceMonthly;
    private Integer priceYearly;
    private Integer maxStudents;
    private Integer maxUsers;
    private String description;
    private Boolean isActive;

    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public Integer getPriceMonthly() { return priceMonthly; }
    public void setPriceMonthly(Integer v) { this.priceMonthly = v; }
    public Integer getPriceYearly() { return priceYearly; }
    public void setPriceYearly(Integer v) { this.priceYearly = v; }
    public Integer getMaxStudents() { return maxStudents; }
    public void setMaxStudents(Integer v) { this.maxStudents = v; }
    public Integer getMaxUsers() { return maxUsers; }
    public void setMaxUsers(Integer v) { this.maxUsers = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { this.description = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
}
