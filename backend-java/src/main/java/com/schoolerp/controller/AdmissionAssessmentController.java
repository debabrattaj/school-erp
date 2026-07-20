package com.schoolerp.controller;

import com.schoolerp.dto.admission.AdmissionAssessmentCreate;
import com.schoolerp.entity.AdmissionAssessment;
import com.schoolerp.entity.AdmissionInquiry;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.AdmissionAssessmentRepository;
import com.schoolerp.repository.AdmissionInquiryRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/admission_assessments.py. */
@RestController
@RequestMapping("/admission-assessments")
public class AdmissionAssessmentController {

    private static final List<String> VALID_TYPES = List.of(
            "Entrance Test", "Student Interview", "Parent Interview", "Portfolio Review",
            "Language Assessment", "Counselor Meeting"
    );
    private static final List<String> VALID_MODES = List.of("On Campus", "Online", "Hybrid", "Phone");
    private static final List<String> VALID_STATUSES = List.of("Scheduled", "Completed", "Rescheduled", "Cancelled", "No Show");
    private static final List<String> VALID_OUTCOMES = List.of("Pending", "Recommended", "Waitlisted", "Not Recommended", "Offer Sent");

    private final AdmissionAssessmentRepository admissionAssessmentRepository;
    private final AdmissionInquiryRepository admissionInquiryRepository;
    private final PermissionService permissionService;

    public AdmissionAssessmentController(
            AdmissionAssessmentRepository admissionAssessmentRepository,
            AdmissionInquiryRepository admissionInquiryRepository,
            PermissionService permissionService
    ) {
        this.admissionAssessmentRepository = admissionAssessmentRepository;
        this.admissionInquiryRepository = admissionInquiryRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> getAdmissionAssessments(
            @RequestParam(name = "inquiry_id", required = false) Long inquiryId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String outcome
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return admissionAssessmentRepository.findAll().stream()
                .filter(a -> inquiryId == null || inquiryId.equals(a.getInquiryId()))
                .filter(a -> status == null || status.equals(a.getStatus()))
                .filter(a -> outcome == null || outcome.equals(a.getOutcome()))
                .sorted(Comparator.comparing(AdmissionAssessment::getId).reversed())
                .map(this::serialize)
                .toList();
    }

    @GetMapping("/{assessmentId}")
    public Map<String, Object> getAdmissionAssessment(@PathVariable Long assessmentId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return serialize(requireAssessment(assessmentId));
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createAdmissionAssessment(@Valid @RequestBody AdmissionAssessmentCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        validatePayload(payload);

        AdmissionAssessment assessment = new AdmissionAssessment();
        applyPayload(assessment, payload);

        return serialize(admissionAssessmentRepository.save(assessment));
    }

    @PutMapping("/{assessmentId}")
    public Map<String, Object> updateAdmissionAssessment(@PathVariable Long assessmentId, @Valid @RequestBody AdmissionAssessmentCreate payload) {
        permissionService.requireRoles("Admin", "Principal");

        AdmissionAssessment assessment = requireAssessment(assessmentId);
        validatePayload(payload);
        applyPayload(assessment, payload);

        return serialize(admissionAssessmentRepository.save(assessment));
    }

    @DeleteMapping("/{assessmentId}")
    public Map<String, String> deleteAdmissionAssessment(@PathVariable Long assessmentId) {
        permissionService.requireRoles("Admin");
        AdmissionAssessment assessment = requireAssessment(assessmentId);
        admissionAssessmentRepository.delete(assessment);
        return Map.of("message", "Admission assessment deleted successfully");
    }

    private void applyPayload(AdmissionAssessment assessment, AdmissionAssessmentCreate payload) {
        assessment.setInquiryId(payload.getInquiryId());
        assessment.setAssessmentType(payload.getAssessmentType());
        assessment.setScheduledDate(payload.getScheduledDate());
        assessment.setScheduledTime(payload.getScheduledTime());
        assessment.setMode(payload.getMode());
        assessment.setPanelMembers(payload.getPanelMembers());
        assessment.setLocation(payload.getLocation());
        assessment.setStatus(payload.getStatus());
        assessment.setScore(payload.getScore());
        assessment.setOutcome(payload.getOutcome());
        assessment.setNextFollowUpDate(payload.getNextFollowUpDate());
        assessment.setRemarks(payload.getRemarks());
    }

    private void validatePayload(AdmissionAssessmentCreate payload) {
        if (!admissionInquiryRepository.existsById(payload.getInquiryId())) {
            throw ApiException.notFound("Admission inquiry not found");
        }
        if (!VALID_TYPES.contains(payload.getAssessmentType())) {
            throw ApiException.badRequest("Invalid assessment type");
        }
        if (payload.getMode() != null && !VALID_MODES.contains(payload.getMode())) {
            throw ApiException.badRequest("Invalid assessment mode");
        }
        if (payload.getStatus() != null && !VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid assessment status");
        }
        if (payload.getOutcome() != null && !VALID_OUTCOMES.contains(payload.getOutcome())) {
            throw ApiException.badRequest("Invalid assessment outcome");
        }
        if (payload.getScore() != null && (payload.getScore() < 0 || payload.getScore() > 100)) {
            throw ApiException.badRequest("Score must be between 0 and 100");
        }
    }

    private AdmissionAssessment requireAssessment(Long id) {
        return admissionAssessmentRepository.findById(id).orElseThrow(() -> ApiException.notFound("Admission assessment not found"));
    }

    private Map<String, Object> serialize(AdmissionAssessment assessment) {
        AdmissionInquiry inquiry = admissionInquiryRepository.findById(assessment.getInquiryId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", assessment.getId());
        body.put("inquiry_id", assessment.getInquiryId());
        body.put("assessment_type", assessment.getAssessmentType());
        body.put("scheduled_date", assessment.getScheduledDate());
        body.put("scheduled_time", assessment.getScheduledTime());
        body.put("mode", assessment.getMode());
        body.put("panel_members", assessment.getPanelMembers());
        body.put("location", assessment.getLocation());
        body.put("status", assessment.getStatus());
        body.put("score", assessment.getScore());
        body.put("outcome", assessment.getOutcome());
        body.put("next_follow_up_date", assessment.getNextFollowUpDate());
        body.put("remarks", assessment.getRemarks());
        body.put("created_at", assessment.getCreatedAt());
        body.put("updated_at", assessment.getUpdatedAt());
        body.put("inquiry_no", inquiry != null ? inquiry.getInquiryNo() : null);
        body.put("student_name", inquiry != null ? inquiry.getStudentName() : null);
        body.put("grade_applying", inquiry != null ? inquiry.getGradeApplying() : null);
        body.put("guardian_name", inquiry != null ? inquiry.getGuardianName() : null);
        body.put("guardian_phone", inquiry != null ? inquiry.getGuardianPhone() : null);
        body.put("admission_stage", inquiry != null ? inquiry.getStage() : null);
        return body;
    }
}
