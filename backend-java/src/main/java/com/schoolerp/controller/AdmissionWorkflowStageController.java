package com.schoolerp.controller;

import com.schoolerp.dto.admission.AdmissionWorkflowStageCreate;
import com.schoolerp.entity.AdmissionInquiry;
import com.schoolerp.entity.AdmissionWorkflowStage;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.AdmissionInquiryRepository;
import com.schoolerp.repository.AdmissionWorkflowStageRepository;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.AdmissionWorkflowService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/admission_workflow.py. */
@RestController
@RequestMapping("/admission-workflow-stages")
public class AdmissionWorkflowStageController {

    private final AdmissionWorkflowStageRepository admissionWorkflowStageRepository;
    private final AdmissionInquiryRepository admissionInquiryRepository;
    private final AdmissionWorkflowService admissionWorkflowService;
    private final PermissionService permissionService;

    public AdmissionWorkflowStageController(
            AdmissionWorkflowStageRepository admissionWorkflowStageRepository,
            AdmissionInquiryRepository admissionInquiryRepository,
            AdmissionWorkflowService admissionWorkflowService,
            PermissionService permissionService
    ) {
        this.admissionWorkflowStageRepository = admissionWorkflowStageRepository;
        this.admissionInquiryRepository = admissionInquiryRepository;
        this.admissionWorkflowService = admissionWorkflowService;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<AdmissionWorkflowStage> listStages() {
        admissionWorkflowService.ensureDefaultStages();
        return admissionWorkflowStageRepository.findAll().stream()
                .sorted(Comparator.comparing(AdmissionWorkflowStage::getSortOrder, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(AdmissionWorkflowStage::getId))
                .toList();
    }

    @PostMapping({"", "/"})
    public AdmissionWorkflowStage createStage(@Valid @RequestBody AdmissionWorkflowStageCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        admissionWorkflowService.ensureDefaultStages();

        String name = payload.getName().trim();
        if (name.isEmpty()) {
            throw ApiException.badRequest("Stage name is required");
        }
        if (admissionWorkflowStageRepository.findByName(name).isPresent()) {
            throw ApiException.badRequest("A stage with this name already exists");
        }

        long maxOrder = admissionWorkflowStageRepository.count();
        AdmissionWorkflowStage stage = new AdmissionWorkflowStage();
        stage.setName(name);
        stage.setSortOrder(payload.getSortOrder() != null ? payload.getSortOrder() : (int) maxOrder + 1);
        stage.setTerminal(Boolean.TRUE.equals(payload.getIsTerminal()));

        return admissionWorkflowStageRepository.save(stage);
    }

    @PutMapping("/{stageId}")
    public AdmissionWorkflowStage updateStage(@PathVariable Long stageId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Principal");

        AdmissionWorkflowStage stage = admissionWorkflowStageRepository.findById(stageId)
                .orElseThrow(() -> ApiException.notFound("Stage not found"));

        String oldName = stage.getName();

        if (updateData.containsKey("name") && updateData.get("name") != null) {
            String newName = updateData.get("name").toString().trim();
            if (newName.isEmpty()) {
                throw ApiException.badRequest("Stage name is required");
            }
            admissionWorkflowStageRepository.findByName(newName).ifPresent(existing -> {
                if (!existing.getId().equals(stageId)) {
                    throw ApiException.badRequest("A stage with this name already exists");
                }
            });
            stage.setName(newName);
        }
        if (updateData.containsKey("sort_order") && updateData.get("sort_order") != null) {
            stage.setSortOrder(Integer.valueOf(updateData.get("sort_order").toString()));
        }
        if (updateData.containsKey("is_terminal") && updateData.get("is_terminal") != null) {
            stage.setTerminal(Boolean.parseBoolean(updateData.get("is_terminal").toString()));
        }

        stage = admissionWorkflowStageRepository.save(stage);

        if (!stage.getName().equals(oldName)) {
            for (AdmissionInquiry inquiry : admissionInquiryRepository.findAll()) {
                if (oldName.equals(inquiry.getStage())) {
                    inquiry.setStage(stage.getName());
                    admissionInquiryRepository.save(inquiry);
                }
            }
        }

        return stage;
    }

    @DeleteMapping("/{stageId}")
    public Map<String, String> deleteStage(@PathVariable Long stageId) {
        permissionService.requireRoles("Admin", "Principal");

        AdmissionWorkflowStage stage = admissionWorkflowStageRepository.findById(stageId)
                .orElseThrow(() -> ApiException.notFound("Stage not found"));

        long inUse = admissionInquiryRepository.findAll().stream()
                .filter(i -> stage.getName().equals(i.getStage()))
                .count();
        if (inUse > 0) {
            throw ApiException.badRequest("Cannot delete: " + inUse + " inquiry(ies) are currently in this stage");
        }

        admissionWorkflowStageRepository.delete(stage);
        return Map.of("message", "Stage deleted successfully");
    }
}
