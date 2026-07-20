package com.schoolerp.dto.masterdata;

import jakarta.validation.constraints.NotBlank;

public class MasterDataCreate {
    @NotBlank
    private String category;
    @NotBlank
    private String value;
    private Boolean isActive = true;
    private Integer sortOrder = 0;

    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getValue() { return value; }
    public void setValue(String v) { this.value = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { this.sortOrder = v; }
}
