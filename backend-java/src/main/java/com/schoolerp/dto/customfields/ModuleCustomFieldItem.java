package com.schoolerp.dto.customfields;

import jakarta.validation.constraints.NotNull;

public class ModuleCustomFieldItem {
    @NotNull
    private String fieldKey;
    private String fieldLabel;
    private String fieldType;
    private String fieldValue;

    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String v) { this.fieldKey = v; }
    public String getFieldLabel() { return fieldLabel; }
    public void setFieldLabel(String v) { this.fieldLabel = v; }
    public String getFieldType() { return fieldType; }
    public void setFieldType(String v) { this.fieldType = v; }
    public String getFieldValue() { return fieldValue; }
    public void setFieldValue(String v) { this.fieldValue = v; }
}
