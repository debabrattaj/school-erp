package com.schoolerp.controller;

import com.schoolerp.dto.customfields.ModuleCustomFieldBulkSave;
import com.schoolerp.dto.customfields.ModuleCustomFieldItem;
import com.schoolerp.entity.ModuleCustomFieldValue;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Direct port of backend/app/routes/module_custom_fields.py. Deliberately has
 * no auth checks on any endpoint, matching the Python source exactly.
 */
@RestController
@RequestMapping("/module-custom-fields")
public class ModuleCustomFieldController {

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

    private final ModuleCustomFieldValueRepository valueRepository;
    private final StudentRepository studentRepository;
    private final TeacherRepository teacherRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final FeeRepository feeRepository;
    private final AttendanceRepository attendanceRepository;
    private final ExamRepository examRepository;
    private final MarkRepository markRepository;

    public ModuleCustomFieldController(
            ModuleCustomFieldValueRepository valueRepository,
            StudentRepository studentRepository,
            TeacherRepository teacherRepository,
            SchoolClassRepository schoolClassRepository,
            FeeRepository feeRepository,
            AttendanceRepository attendanceRepository,
            ExamRepository examRepository,
            MarkRepository markRepository
    ) {
        this.valueRepository = valueRepository;
        this.studentRepository = studentRepository;
        this.teacherRepository = teacherRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.feeRepository = feeRepository;
        this.attendanceRepository = attendanceRepository;
        this.examRepository = examRepository;
        this.markRepository = markRepository;
    }

    @GetMapping("/{moduleName}/{recordId}")
    public List<ModuleCustomFieldValue> getModuleCustomFields(@PathVariable String moduleName, @PathVariable Long recordId) {
        String normalized = normalizeModuleName(moduleName);
        checkRecordExists(normalized, recordId);
        return valueRepository.findByModuleNameAndRecordIdOrderByIdAsc(normalized, recordId);
    }

    @PostMapping("/{moduleName}/{recordId}")
    public List<ModuleCustomFieldValue> saveModuleCustomFields(
            @PathVariable String moduleName, @PathVariable Long recordId, @Valid @RequestBody ModuleCustomFieldBulkSave payload
    ) {
        String normalized = normalizeModuleName(moduleName);
        checkRecordExists(normalized, recordId);

        Map<String, ModuleCustomFieldValue> existingMap = new LinkedHashMap<>();
        for (ModuleCustomFieldValue value : valueRepository.findByModuleNameAndRecordId(normalized, recordId)) {
            existingMap.put(value.getFieldKey(), value);
        }

        List<ModuleCustomFieldValue> saved = valueRepository.saveAll(buildSavedItems(payload, normalized, recordId, existingMap));
        return saved;
    }

    @PutMapping("/{moduleName}/{recordId}")
    public List<ModuleCustomFieldValue> updateModuleCustomFields(
            @PathVariable String moduleName, @PathVariable Long recordId, @Valid @RequestBody ModuleCustomFieldBulkSave payload
    ) {
        return saveModuleCustomFields(moduleName, recordId, payload);
    }

    @DeleteMapping("/{moduleName}/{recordId}/{fieldKey}")
    public Map<String, String> deleteModuleCustomField(@PathVariable String moduleName, @PathVariable Long recordId, @PathVariable String fieldKey) {
        String normalized = normalizeModuleName(moduleName);
        checkRecordExists(normalized, recordId);

        ModuleCustomFieldValue value = valueRepository.findByModuleNameAndRecordIdAndFieldKey(normalized, recordId, fieldKey)
                .orElseThrow(() -> ApiException.notFound("Custom field value not found"));

        valueRepository.delete(value);
        return Map.of("message", "Custom field value deleted successfully");
    }

    @DeleteMapping("/{moduleName}/{recordId}")
    public Map<String, String> deleteAllModuleCustomFields(@PathVariable String moduleName, @PathVariable Long recordId) {
        String normalized = normalizeModuleName(moduleName);
        checkRecordExists(normalized, recordId);

        List<ModuleCustomFieldValue> values = valueRepository.findByModuleNameAndRecordId(normalized, recordId);
        valueRepository.deleteAll(values);

        return Map.of("message", "All custom field values deleted for " + normalized + " record " + recordId);
    }

    // ===================== helpers =====================

    private List<ModuleCustomFieldValue> buildSavedItems(
            ModuleCustomFieldBulkSave payload, String normalized, Long recordId, Map<String, ModuleCustomFieldValue> existingMap
    ) {
        List<ModuleCustomFieldValue> savedItems = new java.util.ArrayList<>();

        for (ModuleCustomFieldItem item : payload.getValues()) {
            String fieldKey = item.getFieldKey() != null ? item.getFieldKey().trim() : "";
            if (fieldKey.isEmpty()) {
                continue;
            }

            ModuleCustomFieldValue value = existingMap.get(fieldKey);
            if (value == null) {
                value = new ModuleCustomFieldValue();
                value.setModuleName(normalized);
                value.setRecordId(recordId);
                value.setFieldKey(fieldKey);
            }
            value.setFieldLabel(item.getFieldLabel());
            value.setFieldType(item.getFieldType());
            value.setFieldValue(item.getFieldValue());
            savedItems.add(value);
        }

        return savedItems;
    }

    private String normalizeModuleName(String moduleName) {
        String key = moduleName == null ? "" : moduleName.trim().toLowerCase();
        String normalized = ALLOWED_MODULES.get(key);
        if (normalized == null) {
            throw ApiException.badRequest("Invalid module name. Allowed modules: " + String.join(", ", ALLOWED_MODULES.values()));
        }
        return normalized;
    }

    private void checkRecordExists(String moduleName, Long recordId) {
        boolean exists = switch (moduleName) {
            case "Students" -> studentRepository.existsById(recordId);
            case "Teachers" -> teacherRepository.existsById(recordId);
            case "Classes" -> schoolClassRepository.existsById(recordId);
            case "Fees" -> feeRepository.existsById(recordId);
            case "Attendance" -> attendanceRepository.existsById(recordId);
            case "Exams" -> examRepository.existsById(recordId);
            case "Marks" -> markRepository.existsById(recordId);
            default -> false;
        };
        if (!exists) {
            throw ApiException.notFound(moduleName + " record not found");
        }
    }
}
