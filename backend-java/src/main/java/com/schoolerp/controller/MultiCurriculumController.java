package com.schoolerp.controller;

import com.schoolerp.dto.curriculum.MultiCurriculumPlanCreate;
import com.schoolerp.entity.MultiCurriculumPlan;
import com.schoolerp.entity.SchoolClass;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.MultiCurriculumPlanRepository;
import com.schoolerp.repository.SchoolClassRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/multi_curriculum.py. */
@RestController
@RequestMapping("/multi-curriculum")
public class MultiCurriculumController {

    private static final List<String> VALID_TRACKS = List.of(
            "IB PYP", "IB MYP", "IB DP", "Cambridge Primary", "Cambridge Lower Secondary",
            "IGCSE", "A-Level", "CBSE", "ICSE", "State Board", "Custom"
    );
    private static final List<String> VALID_STATUSES = List.of("Draft", "Active", "Archived");

    private final MultiCurriculumPlanRepository planRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final PermissionService permissionService;

    public MultiCurriculumController(
            MultiCurriculumPlanRepository planRepository,
            SchoolClassRepository schoolClassRepository,
            PermissionService permissionService
    ) {
        this.planRepository = planRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> getCurriculumPlans(
            @RequestParam(name = "curriculum_track", required = false) String curriculumTrack,
            @RequestParam(name = "academic_year", required = false) String academicYear,
            @RequestParam(required = false) String status
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return planRepository.findAll().stream()
                .filter(p -> curriculumTrack == null || curriculumTrack.equals(p.getCurriculumTrack()))
                .filter(p -> academicYear == null || academicYear.equals(p.getAcademicYear()))
                .filter(p -> status == null || status.equals(p.getStatus()))
                .sorted(Comparator.comparing(MultiCurriculumPlan::getId).reversed())
                .map(this::serialize)
                .toList();
    }

    @GetMapping("/{planId}")
    public Map<String, Object> getCurriculumPlan(@PathVariable Long planId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return serialize(requirePlan(planId));
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createCurriculumPlan(@Valid @RequestBody MultiCurriculumPlanCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        validatePayload(payload);

        MultiCurriculumPlan plan = new MultiCurriculumPlan();
        applyPayload(plan, payload);

        return serialize(planRepository.save(plan));
    }

    @PutMapping("/{planId}")
    public Map<String, Object> updateCurriculumPlan(@PathVariable Long planId, @Valid @RequestBody MultiCurriculumPlanCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        MultiCurriculumPlan plan = requirePlan(planId);
        validatePayload(payload);

        applyPayload(plan, payload);

        return serialize(planRepository.save(plan));
    }

    @DeleteMapping("/{planId}")
    public Map<String, String> deleteCurriculumPlan(@PathVariable Long planId) {
        permissionService.requireRoles("Admin");
        MultiCurriculumPlan plan = requirePlan(planId);
        planRepository.delete(plan);
        return Map.of("message", "Curriculum plan deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(MultiCurriculumPlan plan, MultiCurriculumPlanCreate payload) {
        plan.setProgramName(payload.getProgramName());
        plan.setCurriculumTrack(payload.getCurriculumTrack());
        plan.setGradeLevel(payload.getGradeLevel());
        plan.setAcademicYear(payload.getAcademicYear());
        plan.setClassId(payload.getClassId());
        plan.setSubjectGroups(payload.getSubjectGroups());
        plan.setAssessmentModel(payload.getAssessmentModel());
        plan.setCoordinator(payload.getCoordinator());
        plan.setStatus(payload.getStatus());
        plan.setRemarks(payload.getRemarks());
    }

    private void validatePayload(MultiCurriculumPlanCreate payload) {
        if (payload.getProgramName() == null || payload.getProgramName().trim().isEmpty()) {
            throw ApiException.badRequest("Program name is required");
        }
        if (payload.getCurriculumTrack() == null || !VALID_TRACKS.contains(payload.getCurriculumTrack())) {
            throw ApiException.badRequest("Invalid curriculum track");
        }
        if (payload.getGradeLevel() == null || payload.getGradeLevel().trim().isEmpty()) {
            throw ApiException.badRequest("Grade level is required");
        }
        if (payload.getAcademicYear() == null || payload.getAcademicYear().trim().isEmpty()) {
            throw ApiException.badRequest("Academic year is required");
        }
        if (payload.getStatus() != null && !VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid curriculum status");
        }
        if (payload.getClassId() != null && !schoolClassRepository.existsById(payload.getClassId())) {
            throw ApiException.notFound("Class not found");
        }
    }

    private MultiCurriculumPlan requirePlan(Long id) {
        return planRepository.findById(id).orElseThrow(() -> ApiException.notFound("Curriculum plan not found"));
    }

    private Map<String, Object> serialize(MultiCurriculumPlan plan) {
        SchoolClass schoolClass = plan.getClassId() != null
                ? schoolClassRepository.findById(plan.getClassId()).orElse(null)
                : null;

        String className = schoolClass != null ? schoolClass.getClassName() : null;
        String section = schoolClass != null ? schoolClass.getSection() : null;
        String classDisplay = ((className != null ? className : "") + " " + (section != null ? section : "")).trim();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", plan.getId());
        body.put("program_name", plan.getProgramName());
        body.put("curriculum_track", plan.getCurriculumTrack());
        body.put("grade_level", plan.getGradeLevel());
        body.put("academic_year", plan.getAcademicYear());
        body.put("class_id", plan.getClassId());
        body.put("subject_groups", plan.getSubjectGroups());
        body.put("assessment_model", plan.getAssessmentModel());
        body.put("coordinator", plan.getCoordinator());
        body.put("status", plan.getStatus());
        body.put("remarks", plan.getRemarks());
        body.put("created_at", plan.getCreatedAt());
        body.put("updated_at", plan.getUpdatedAt());
        body.put("class_name", className);
        body.put("section", section);
        body.put("class_display", classDisplay.isEmpty() ? null : classDisplay);
        return body;
    }
}
