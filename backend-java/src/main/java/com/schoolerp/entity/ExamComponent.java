package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "exam_components")
public class ExamComponent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "exam_id", nullable = false)
    private Long examId;

    @Column(nullable = false)
    private String componentName;

    private Double maxMarks = 100.0;
    private Double weightage;
    private Integer sortOrder = 0;
    private boolean isActive = true;
    private String remarks;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
    @com.fasterxml.jackson.annotation.JsonProperty("is_active")
    public boolean isActive() { return isActive; }
    public void setActive(boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
