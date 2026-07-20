package com.schoolerp.dto.accounts;

import jakarta.validation.constraints.NotNull;

import java.util.Map;

public class SchoolFeatureUpdate {
    @NotNull
    private Map<String, Boolean> features;

    public Map<String, Boolean> getFeatures() { return features; }
    public void setFeatures(Map<String, Boolean> v) { this.features = v; }
}
