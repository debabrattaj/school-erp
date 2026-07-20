package com.schoolerp.dto.admission;

import jakarta.validation.constraints.NotBlank;

public class AdmissionWorkflowStageCreate {
    @NotBlank
    private String name;
    private Integer sortOrder;
    private Boolean isTerminal = false;

    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { this.sortOrder = v; }
    public Boolean getIsTerminal() { return isTerminal; }
    public void setIsTerminal(Boolean v) { this.isTerminal = v; }
}
