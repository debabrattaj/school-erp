package com.schoolerp.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.schoolerp.dto.customfields.ModuleLayoutSave;
import com.schoolerp.entity.ModuleLayout;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.ModuleLayoutRepository;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Direct port of backend/app/routes/module_layouts.py. Deliberately has no
 * auth checks on any endpoint, matching the Python source exactly.
 */
@RestController
@RequestMapping("/module-layouts")
public class ModuleLayoutController {

    private static final Map<String, String> ALLOWED_MODULES = new LinkedHashMap<>();
    static {
        ALLOWED_MODULES.put("students", "Students");
        ALLOWED_MODULES.put("teachers", "Teachers");
        ALLOWED_MODULES.put("classes", "Classes");
        ALLOWED_MODULES.put("fees", "Fees");
        ALLOWED_MODULES.put("attendance", "Attendance");
        ALLOWED_MODULES.put("exams", "Exams");
        ALLOWED_MODULES.put("marks", "Marks");
    }

    private final ModuleLayoutRepository layoutRepository;
    private final ObjectMapper objectMapper;

    public ModuleLayoutController(ModuleLayoutRepository layoutRepository, ObjectMapper objectMapper) {
        this.layoutRepository = layoutRepository;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/{moduleName}")
    public Map<String, Object> getModuleLayout(@PathVariable String moduleName) {
        String normalized = normalizeModuleName(moduleName);
        ModuleLayout layout = layoutRepository.findByModuleNameAndIsActiveTrue(normalized)
                .orElseThrow(() -> ApiException.notFound("Module layout not found"));
        return buildLayoutResponse(layout);
    }

    @PostMapping("/{moduleName}")
    public Map<String, Object> createModuleLayout(@PathVariable String moduleName, @RequestBody ModuleLayoutSave payload) {
        String normalized = normalizeModuleName(moduleName);

        if (layoutRepository.findByModuleName(normalized).isPresent()) {
            throw ApiException.badRequest("Layout already exists. Use PUT to update it.");
        }

        ModuleLayout layout = new ModuleLayout();
        layout.setModuleName(normalized);
        layout.setLayoutJson(writeJson(payload.getLayoutJson()));
        layout.setIsActive(true);

        return buildLayoutResponse(layoutRepository.save(layout));
    }

    @PutMapping("/{moduleName}")
    public Map<String, Object> updateModuleLayout(@PathVariable String moduleName, @RequestBody ModuleLayoutSave payload) {
        String normalized = normalizeModuleName(moduleName);

        ModuleLayout layout = layoutRepository.findByModuleName(normalized).orElseGet(() -> {
            ModuleLayout fresh = new ModuleLayout();
            fresh.setModuleName(normalized);
            return fresh;
        });
        layout.setLayoutJson(writeJson(payload.getLayoutJson()));
        layout.setIsActive(true);

        return buildLayoutResponse(layoutRepository.save(layout));
    }

    @DeleteMapping("/{moduleName}")
    public Map<String, String> deleteModuleLayout(@PathVariable String moduleName) {
        String normalized = normalizeModuleName(moduleName);
        ModuleLayout layout = layoutRepository.findByModuleName(normalized)
                .orElseThrow(() -> ApiException.notFound("Module layout not found"));

        layout.setIsActive(false);
        layoutRepository.save(layout);

        return Map.of("message", normalized + " layout disabled successfully");
    }

    // ===================== helpers =====================

    private String normalizeModuleName(String moduleName) {
        String key = moduleName == null ? "" : moduleName.trim().toLowerCase();
        String normalized = ALLOWED_MODULES.get(key);
        if (normalized == null) {
            throw ApiException.badRequest("Invalid module name. Allowed modules: " + String.join(", ", ALLOWED_MODULES.values()));
        }
        return normalized;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> buildLayoutResponse(ModuleLayout layout) {
        Object parsedLayout;
        try {
            parsedLayout = objectMapper.readValue(layout.getLayoutJson(), Object.class);
        } catch (Exception e) {
            parsedLayout = List.of();
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", layout.getId());
        body.put("module_name", layout.getModuleName());
        body.put("layout_json", parsedLayout);
        body.put("is_active", layout.getIsActive());
        return body;
    }
}
