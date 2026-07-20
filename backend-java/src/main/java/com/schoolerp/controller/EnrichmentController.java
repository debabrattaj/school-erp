package com.schoolerp.controller;

import com.schoolerp.dto.enrichment.EnrichmentActivityCreate;
import com.schoolerp.entity.EnrichmentActivity;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.EnrichmentActivityRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/enrichment.py. */
@RestController
@RequestMapping("/enrichment")
public class EnrichmentController {

    private static final List<String> VALID_TYPES = List.of(
            "Club", "Sport", "Competition", "Trip", "Service Learning", "CAS", "Workshop", "Event"
    );
    private static final List<String> VALID_STATUSES = List.of("Planned", "Open", "Full", "Completed", "Cancelled");

    private final EnrichmentActivityRepository activityRepository;
    private final PermissionService permissionService;

    public EnrichmentController(EnrichmentActivityRepository activityRepository, PermissionService permissionService) {
        this.activityRepository = activityRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<EnrichmentActivity> getActivities(
            @RequestParam(name = "activity_type", required = false) String activityType,
            @RequestParam(required = false) String status
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return activityRepository.findAll().stream()
                .filter(a -> activityType == null || activityType.equals(a.getActivityType()))
                .filter(a -> status == null || status.equals(a.getStatus()))
                .sorted(Comparator.comparing(EnrichmentActivity::getId).reversed())
                .toList();
    }

    @PostMapping({"", "/"})
    public EnrichmentActivity createActivity(@Valid @RequestBody EnrichmentActivityCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        validatePayload(payload);

        String activityCode = payload.getActivityCode() != null ? payload.getActivityCode().trim() : "";
        if (activityCode.isEmpty()) {
            activityCode = nextActivityCode();
        }
        if (activityRepository.findByActivityCode(activityCode).isPresent()) {
            throw ApiException.badRequest("Activity code already exists");
        }

        EnrichmentActivity activity = new EnrichmentActivity();
        activity.setActivityCode(activityCode);
        applyPayload(activity, payload);

        return activityRepository.save(activity);
    }

    @PutMapping("/{activityId}")
    public EnrichmentActivity updateActivity(@PathVariable Long activityId, @Valid @RequestBody EnrichmentActivityCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        EnrichmentActivity activity = requireActivity(activityId);
        validatePayload(payload);

        String activityCode = payload.getActivityCode() != null ? payload.getActivityCode().trim() : "";
        if (activityCode.isEmpty()) {
            activityCode = activity.getActivityCode();
        }
        String finalCode = activityCode;
        activityRepository.findByActivityCode(activityCode).ifPresent(existing -> {
            if (!existing.getId().equals(activityId)) {
                throw ApiException.badRequest("Activity code already exists");
            }
        });

        activity.setActivityCode(finalCode);
        applyPayload(activity, payload);

        return activityRepository.save(activity);
    }

    @DeleteMapping("/{activityId}")
    public Map<String, String> deleteActivity(@PathVariable Long activityId) {
        permissionService.requireRoles("Admin");
        EnrichmentActivity activity = requireActivity(activityId);
        activityRepository.delete(activity);
        return Map.of("message", "Activity deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(EnrichmentActivity activity, EnrichmentActivityCreate payload) {
        activity.setActivityName(payload.getActivityName());
        activity.setActivityType(payload.getActivityType());
        activity.setCategory(payload.getCategory());
        activity.setCoordinator(payload.getCoordinator());
        activity.setStartDate(payload.getStartDate());
        activity.setEndDate(payload.getEndDate());
        activity.setVenue(payload.getVenue());
        activity.setEligibleClasses(payload.getEligibleClasses());
        activity.setCapacity(payload.getCapacity());
        activity.setEnrolledCount(payload.getEnrolledCount());
        activity.setFeeAmount(payload.getFeeAmount());
        activity.setStatus(payload.getStatus());
        activity.setDescription(payload.getDescription());
        activity.setRemarks(payload.getRemarks());
    }

    private void validatePayload(EnrichmentActivityCreate payload) {
        if (payload.getActivityName() == null || payload.getActivityName().trim().isEmpty()) {
            throw ApiException.badRequest("Activity name is required");
        }
        if (payload.getActivityType() == null || !VALID_TYPES.contains(payload.getActivityType())) {
            throw ApiException.badRequest("Invalid activity type");
        }
        if (payload.getStatus() != null && !VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid activity status");
        }
        if (payload.getCapacity() != null && payload.getCapacity() < 0) {
            throw ApiException.badRequest("Capacity cannot be negative");
        }
        if (payload.getEnrolledCount() != null && payload.getEnrolledCount() < 0) {
            throw ApiException.badRequest("Enrolled count cannot be negative");
        }
        if (payload.getFeeAmount() != null && payload.getFeeAmount() < 0) {
            throw ApiException.badRequest("Fee amount cannot be negative");
        }
    }

    private EnrichmentActivity requireActivity(Long id) {
        return activityRepository.findById(id).orElseThrow(() -> ApiException.notFound("Activity not found"));
    }

    private String nextActivityCode() {
        Long latestId = activityRepository.findTopByOrderByIdDesc().map(EnrichmentActivity::getId).orElse(null);
        long nextNumber = (latestId != null ? latestId : 0) + 1;
        return String.format("ACT-%04d", nextNumber);
    }
}
