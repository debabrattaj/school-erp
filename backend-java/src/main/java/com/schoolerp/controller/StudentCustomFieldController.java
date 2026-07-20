package com.schoolerp.controller;

import com.schoolerp.dto.customfields.ModuleCustomFieldBulkSave;
import com.schoolerp.dto.customfields.ModuleCustomFieldItem;
import com.schoolerp.entity.StudentCustomFieldValue;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.StudentCustomFieldValueRepository;
import com.schoolerp.repository.StudentRepository;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Direct port of backend/app/routes/student_custom_fields.py. Deliberately
 * has no auth checks on any endpoint, matching the Python source exactly.
 */
@RestController
@RequestMapping("/students")
public class StudentCustomFieldController {

    private final StudentCustomFieldValueRepository valueRepository;
    private final StudentRepository studentRepository;

    public StudentCustomFieldController(StudentCustomFieldValueRepository valueRepository, StudentRepository studentRepository) {
        this.valueRepository = valueRepository;
        this.studentRepository = studentRepository;
    }

    @GetMapping("/{studentId}/custom-fields")
    public List<StudentCustomFieldValue> getStudentCustomFields(@PathVariable Long studentId) {
        requireStudent(studentId);
        return valueRepository.findByStudentIdOrderByIdAsc(studentId);
    }

    @PostMapping("/{studentId}/custom-fields")
    public List<StudentCustomFieldValue> saveStudentCustomFields(@PathVariable Long studentId, @Valid @RequestBody ModuleCustomFieldBulkSave payload) {
        requireStudent(studentId);

        Map<String, StudentCustomFieldValue> existingMap = new LinkedHashMap<>();
        for (StudentCustomFieldValue value : valueRepository.findByStudentId(studentId)) {
            existingMap.put(value.getFieldKey(), value);
        }

        List<StudentCustomFieldValue> savedItems = new ArrayList<>();
        for (ModuleCustomFieldItem item : payload.getValues()) {
            String fieldKey = item.getFieldKey() != null ? item.getFieldKey().trim() : "";
            if (fieldKey.isEmpty()) {
                continue;
            }

            StudentCustomFieldValue value = existingMap.get(fieldKey);
            if (value == null) {
                value = new StudentCustomFieldValue();
                value.setStudentId(studentId);
                value.setFieldKey(fieldKey);
            }
            value.setFieldLabel(item.getFieldLabel());
            value.setFieldType(item.getFieldType());
            value.setFieldValue(item.getFieldValue());
            savedItems.add(value);
        }

        return valueRepository.saveAll(savedItems);
    }

    @PutMapping("/{studentId}/custom-fields")
    public List<StudentCustomFieldValue> updateStudentCustomFields(@PathVariable Long studentId, @Valid @RequestBody ModuleCustomFieldBulkSave payload) {
        return saveStudentCustomFields(studentId, payload);
    }

    @DeleteMapping("/{studentId}/custom-fields/{fieldKey}")
    public Map<String, String> deleteStudentCustomField(@PathVariable Long studentId, @PathVariable String fieldKey) {
        requireStudent(studentId);

        StudentCustomFieldValue value = valueRepository.findByStudentIdAndFieldKey(studentId, fieldKey)
                .orElseThrow(() -> ApiException.notFound("Custom field value not found"));

        valueRepository.delete(value);
        return Map.of("message", "Custom field value deleted successfully");
    }

    private void requireStudent(Long id) {
        if (!studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }
}
