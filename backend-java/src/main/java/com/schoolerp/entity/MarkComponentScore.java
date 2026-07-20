package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "mark_component_scores")
public class MarkComponentScore {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "mark_id", nullable = false)
    private Long markId;

    @Column(name = "exam_component_id")
    private Long examComponentId;

    @Column(nullable = false)
    private String componentName;

    private Double marksObtained = 0.0;
    private Double maxMarks = 100.0;
    private Integer sortOrder = 0;
    private String remarks;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getMarkId() { return markId; }
    public void setMarkId(Long v) { this.markId = v; }
    public Long getExamComponentId() { return examComponentId; }
    public void setExamComponentId(Long v) { this.examComponentId = v; }
    public String getComponentName() { return componentName; }
    public void setComponentName(String v) { this.componentName = v; }
    public Double getMarksObtained() { return marksObtained; }
    public void setMarksObtained(Double v) { this.marksObtained = v; }
    public Double getMaxMarks() { return maxMarks; }
    public void setMaxMarks(Double v) { this.maxMarks = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { this.sortOrder = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
