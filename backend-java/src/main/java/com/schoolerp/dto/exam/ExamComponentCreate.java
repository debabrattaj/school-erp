package com.schoolerp.dto.exam;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class ExamComponentCreate {
    @NotNull
    private Long examId;
    @NotBlank
    private String componentName;
    private Double maxMarks = 100.0;
    private Double weightage;
    private Integer sortOrder = 0;
    private Boolean isActive = true;
    private String remarks;

    public Long getExamId() { return examId; }
    public void setExamId(Long v) { this.examId = v; }
    public String getComponentName() { return componentName; }
    public void setComponentName(String v) { this.componentName = v; }
    public Double getMaxMarks() { return maxMarks; }
    public void setMaxMarks(Double v) { this.maxMarks = v; }
    public Double getWeightage() { return weightage; }
    public void setWeightage(Double v) { this.weightage = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { this.sortOrder = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
