package com.schoolerp.dto.platform;

import jakarta.validation.constraints.NotNull;

import java.util.Map;

public class FeatureUpdateRequest {
    @NotNull
    private Map<String, Boolean> features;

    public Map<String, Boolean> getFeatures() { return features; }
    public void setFeatures(Map<String, Boolean> v) { this.features = v; }
}
