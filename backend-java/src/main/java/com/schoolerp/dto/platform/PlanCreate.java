package com.schoolerp.dto.platform;

import jakarta.validation.constraints.NotBlank;

public class PlanCreate {
    @NotBlank
    private String name;
    private Integer priceMonthly = 0;
    private Integer priceYearly = 0;
    private Integer maxStudents;
    private Integer maxUsers;
    private String description;

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
}
