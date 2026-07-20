package com.schoolerp.controller;

import com.schoolerp.dto.exam.ExamComponentCreate;
import com.schoolerp.entity.ExamComponent;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.ExamComponentRepository;
import com.schoolerp.repository.ExamRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/exam_components.py. */
@RestController
@RequestMapping("/exam-components")
public class ExamComponentController {

    private final ExamComponentRepository examComponentRepository;
    private final ExamRepository examRepository;
    private final PermissionService permissionService;

    public ExamComponentController(ExamComponentRepository examComponentRepository, ExamRepository examRepository, PermissionService permissionService) {
        this.examComponentRepository = examComponentRepository;
        this.examRepository = examRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<ExamComponent> getExamComponents(
            @RequestParam(name = "exam_id", required = false) Long examId,
            @RequestParam(name = "active_only", required = false, defaultValue = "false") boolean activeOnly
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return examComponentRepository.findAll().stream()
                .filter(c -> examId == null || examId.equals(c.getExamId()))
                .filter(c -> !activeOnly || c.isActive())
                .sorted(Comparator.comparing(ExamComponent::getExamId, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(ExamComponent::getSortOrder, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(ExamComponent::getId))
                .toList();
    }

    @PostMapping({"", "/"})
    public ExamComponent createExamComponent(@Valid @RequestBody ExamComponentCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        requireExamExists(payload.getExamId());

        ExamComponent component = new ExamComponent();
        component.setExamId(payload.getExamId());
        component.setComponentName(payload.getComponentName());
        component.setMaxMarks(payload.getMaxMarks());
        component.setWeightage(payload.getWeightage());
        component.setSortOrder(payload.getSortOrder());
        component.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        component.setRemarks(payload.getRemarks());

        return examComponentRepository.save(component);
    }

    @PutMapping("/{componentId}")
    public ExamComponent updateExamComponent(@PathVariable Long componentId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Principal");

        ExamComponent component = examComponentRepository.findById(componentId)
                .orElseThrow(() -> ApiException.notFound("Exam component not found"));

        if (updateData.containsKey("exam_id") && updateData.get("exam_id") != null) {
            Long examId = Long.valueOf(updateData.get("exam_id").toString());
            requireExamExists(examId);
            component.setExamId(examId);
        }
        if (updateData.containsKey("component_name") && updateData.get("component_name") != null) {
            component.setComponentName(updateData.get("component_name").toString());
        }
        if (updateData.containsKey("max_marks")) {
            component.setMaxMarks(updateData.get("max_marks") == null ? null : Double.valueOf(updateData.get("max_marks").toString()));
        }
        if (updateData.containsKey("weightage")) {
            component.setWeightage(updateData.get("weightage") == null ? null : Double.valueOf(updateData.get("weightage").toString()));
        }
        if (updateData.containsKey("sort_order")) {
            component.setSortOrder(updateData.get("sort_order") == null ? null : Integer.valueOf(updateData.get("sort_order").toString()));
        }
        if (updateData.containsKey("is_active") && updateData.get("is_active") != null) {
            component.setActive(Boolean.parseBoolean(updateData.get("is_active").toString()));
        }
        if (updateData.containsKey("remarks")) {
            component.setRemarks(updateData.get("remarks") == null ? null : updateData.get("remarks").toString());
        }

        return examComponentRepository.save(component);
    }

    @DeleteMapping("/{componentId}")
    public Map<String, String> deleteExamComponent(@PathVariable Long componentId) {
        permissionService.requireRoles("Admin", "Principal");
        ExamComponent component = examComponentRepository.findById(componentId)
                .orElseThrow(() -> ApiException.notFound("Exam component not found"));
        examComponentRepository.delete(component);
        return Map.of("message", "Exam component deleted successfully");
    }

    private void requireExamExists(Long examId) {
        if (!examRepository.existsById(examId)) {
            throw ApiException.notFound("Exam not found");
        }
    }
}
