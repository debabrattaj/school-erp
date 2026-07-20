package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "student_custom_field_values")
public class StudentCustomFieldValue {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(nullable = false)
    private String fieldKey;

    private String fieldLabel;
    private String fieldType;

    @Lob
    private String fieldValue;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String v) { this.fieldKey = v; }
    public String getFieldLabel() { return fieldLabel; }
    public void setFieldLabel(String v) { this.fieldLabel = v; }
    public String getFieldType() { return fieldType; }
    public void setFieldType(String v) { this.fieldType = v; }
    public String getFieldValue() { return fieldValue; }
    public void setFieldValue(String v) { this.fieldValue = v; }
}
