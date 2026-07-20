package com.schoolerp.dto.customfields;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class ModuleCustomFieldBulkSave {
    @Valid
    @NotNull
    private List<ModuleCustomFieldItem> values;

    public List<ModuleCustomFieldItem> getValues() { return values; }
    public void setValues(List<ModuleCustomFieldItem> v) { this.values = v; }
}
