package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "module_custom_field_values")
public class ModuleCustomFieldValue {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String moduleName;

    @Column(nullable = false)
    private Long recordId;

    @Column(nullable = false)
    private String fieldKey;

    private String fieldLabel;
    private String fieldType;

    @Lob
    private String fieldValue;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getModuleName() { return moduleName; }
    public void setModuleName(String v) { this.moduleName = v; }
    public Long getRecordId() { return recordId; }
    public void setRecordId(Long v) { this.recordId = v; }
    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String v) { this.fieldKey = v; }
    public String getFieldLabel() { return fieldLabel; }
    public void setFieldLabel(String v) { this.fieldLabel = v; }
    public String getFieldType() { return fieldType; }
    public void setFieldType(String v) { this.fieldType = v; }
    public String getFieldValue() { return fieldValue; }
    public void setFieldValue(String v) { this.fieldValue = v; }
}
