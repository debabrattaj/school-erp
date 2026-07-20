package com.schoolerp.controller;

import com.schoolerp.dto.compliance.ComplianceTaskCreate;
import com.schoolerp.entity.ComplianceTask;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.ComplianceTaskRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/compliance.py. */
@RestController
@RequestMapping("/compliance")
public class ComplianceController {

    private static final List<String> VALID_BODIES = List.of(
            "IB", "Cambridge", "CBSE", "ICSE", "State", "Local Authority", "Internal", "Other"
    );
    private static final List<String> VALID_RISK_LEVELS = List.of("Low", "Medium", "High", "Critical");
    private static final List<String> VALID_STATUSES = List.of(
            "Open", "In Progress", "Evidence Ready", "Reviewed", "Completed", "Deferred"
    );

    private final ComplianceTaskRepository taskRepository;
    private final PermissionService permissionService;

    public ComplianceController(ComplianceTaskRepository taskRepository, PermissionService permissionService) {
        this.taskRepository = taskRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<ComplianceTask> getTasks(
            @RequestParam(name = "accreditation_body", required = false) String accreditationBody,
            @RequestParam(required = false) String status,
            @RequestParam(name = "risk_level", required = false) String riskLevel
    ) {
        permissionService.requireRoles("Admin", "Principal");
        return taskRepository.findAll().stream()
                .filter(t -> accreditationBody == null || accreditationBody.equals(t.getAccreditationBody()))
                .filter(t -> status == null || status.equals(t.getStatus()))
                .filter(t -> riskLevel == null || riskLevel.equals(t.getRiskLevel()))
                .sorted(Comparator.comparing(ComplianceTask::getId).reversed())
                .toList();
    }

    @PostMapping({"", "/"})
    public ComplianceTask createTask(@Valid @RequestBody ComplianceTaskCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        validatePayload(payload);

        String taskCode = payload.getTaskCode() != null ? payload.getTaskCode().trim() : "";
        if (taskCode.isEmpty()) {
            taskCode = nextTaskCode();
        }
        if (taskRepository.findByTaskCode(taskCode).isPresent()) {
            throw ApiException.badRequest("Compliance task code already exists");
        }

        ComplianceTask task = new ComplianceTask();
        task.setTaskCode(taskCode);
        applyPayload(task, payload);

        return taskRepository.save(task);
    }

    @PutMapping("/{taskId}")
    public ComplianceTask updateTask(@PathVariable Long taskId, @Valid @RequestBody ComplianceTaskCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        ComplianceTask task = requireTask(taskId);
        validatePayload(payload);

        String taskCode = payload.getTaskCode() != null ? payload.getTaskCode().trim() : "";
        if (taskCode.isEmpty()) {
            taskCode = task.getTaskCode();
        }
        String finalCode = taskCode;
        taskRepository.findByTaskCode(taskCode).ifPresent(existing -> {
            if (!existing.getId().equals(taskId)) {
                throw ApiException.badRequest("Compliance task code already exists");
            }
        });

        task.setTaskCode(finalCode);
        applyPayload(task, payload);

        return taskRepository.save(task);
    }

    @DeleteMapping("/{taskId}")
    public Map<String, String> deleteTask(@PathVariable Long taskId) {
        permissionService.requireRoles("Admin");
        ComplianceTask task = requireTask(taskId);
        taskRepository.delete(task);
        return Map.of("message", "Compliance task deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(ComplianceTask task, ComplianceTaskCreate payload) {
        task.setAccreditationBody(payload.getAccreditationBody());
        task.setStandardArea(payload.getStandardArea());
        task.setRequirement(payload.getRequirement());
        task.setEvidenceLink(payload.getEvidenceLink());
        task.setOwner(payload.getOwner());
        task.setDueDate(payload.getDueDate());
        task.setReviewDate(payload.getReviewDate());
        task.setRiskLevel(payload.getRiskLevel());
        task.setStatus(payload.getStatus());
        task.setFinding(payload.getFinding());
        task.setActionPlan(payload.getActionPlan());
        task.setCompletedDate(payload.getCompletedDate());
        task.setRemarks(payload.getRemarks());
    }

    private void validatePayload(ComplianceTaskCreate payload) {
        if (payload.getAccreditationBody() == null || !VALID_BODIES.contains(payload.getAccreditationBody())) {
            throw ApiException.badRequest("Invalid accreditation body");
        }
        if (payload.getStandardArea() == null || payload.getStandardArea().trim().isEmpty()) {
            throw ApiException.badRequest("Standard area is required");
        }
        if (payload.getRequirement() == null || payload.getRequirement().trim().isEmpty()) {
            throw ApiException.badRequest("Requirement is required");
        }
        if (payload.getRiskLevel() != null && !VALID_RISK_LEVELS.contains(payload.getRiskLevel())) {
            throw ApiException.badRequest("Invalid risk level");
        }
        if (payload.getStatus() != null && !VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid compliance status");
        }
    }

    private ComplianceTask requireTask(Long id) {
        return taskRepository.findById(id).orElseThrow(() -> ApiException.notFound("Compliance task not found"));
    }

    private String nextTaskCode() {
        Long latestId = taskRepository.findTopByOrderByIdDesc().map(ComplianceTask::getId).orElse(null);
        long nextNumber = (latestId != null ? latestId : 0) + 1;
        return String.format("CMP-%04d", nextNumber);
    }
}
