package com.schoolerp.controller;

import com.schoolerp.dto.counseling.CounselingCaseCreate;
import com.schoolerp.entity.CounselingCase;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.CounselingCaseRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/counseling.py. */
@RestController
@RequestMapping("/counseling")
public class CounselingController {

    private static final List<String> VALID_CONCERNS = List.of(
            "Academic Stress", "Behavior", "Emotional Wellbeing", "Peer Relationship",
            "Attendance Concern", "Safeguarding", "Career Guidance", "Other"
    );
    private static final List<String> VALID_RISK_LEVELS = List.of("Low", "Medium", "High", "Critical");
    private static final List<String> VALID_CONFIDENTIALITY = List.of("Standard", "Restricted", "Sensitive");
    private static final List<String> VALID_STATUSES = List.of("Open", "In Progress", "Monitoring", "Closed", "Escalated");

    private final CounselingCaseRepository caseRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public CounselingController(
            CounselingCaseRepository caseRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.caseRepository = caseRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> getCases(
            @RequestParam(required = false) String status,
            @RequestParam(name = "risk_level", required = false) String riskLevel,
            @RequestParam(name = "concern_type", required = false) String concernType
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return caseRepository.findAll().stream()
                .filter(c -> status == null || status.equals(c.getStatus()))
                .filter(c -> riskLevel == null || riskLevel.equals(c.getRiskLevel()))
                .filter(c -> concernType == null || concernType.equals(c.getConcernType()))
                .sorted(Comparator.comparing(CounselingCase::getId).reversed())
                .map(this::serialize)
                .toList();
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createCase(@Valid @RequestBody CounselingCaseCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        validatePayload(payload);

        String caseNo = payload.getCaseNo() != null ? payload.getCaseNo().trim() : "";
        if (caseNo.isEmpty()) {
            caseNo = nextCaseNo();
        }
        if (caseRepository.findByCaseNo(caseNo).isPresent()) {
            throw ApiException.badRequest("Case number already exists");
        }

        CounselingCase caseEntity = new CounselingCase();
        caseEntity.setCaseNo(caseNo);
        applyPayload(caseEntity, payload);

        return serialize(caseRepository.save(caseEntity));
    }

    @PutMapping("/{caseId}")
    public Map<String, Object> updateCase(@PathVariable Long caseId, @Valid @RequestBody CounselingCaseCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        CounselingCase caseEntity = requireCase(caseId);
        validatePayload(payload);

        String caseNo = payload.getCaseNo() != null ? payload.getCaseNo().trim() : "";
        if (caseNo.isEmpty()) {
            caseNo = caseEntity.getCaseNo();
        }
        String finalCaseNo = caseNo;
        caseRepository.findByCaseNo(caseNo).ifPresent(existing -> {
            if (!existing.getId().equals(caseId)) {
                throw ApiException.badRequest("Case number already exists");
            }
        });

        caseEntity.setCaseNo(finalCaseNo);
        applyPayload(caseEntity, payload);

        return serialize(caseRepository.save(caseEntity));
    }

    @DeleteMapping("/{caseId}")
    public Map<String, String> deleteCase(@PathVariable Long caseId) {
        permissionService.requireRoles("Admin");
        CounselingCase caseEntity = requireCase(caseId);
        caseRepository.delete(caseEntity);
        return Map.of("message", "Counseling case deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(CounselingCase caseEntity, CounselingCaseCreate payload) {
        caseEntity.setStudentId(payload.getStudentId());
        caseEntity.setConcernType(payload.getConcernType());
        caseEntity.setRiskLevel(payload.getRiskLevel());
        caseEntity.setReportedBy(payload.getReportedBy());
        caseEntity.setCounselor(payload.getCounselor());
        caseEntity.setSessionDate(payload.getSessionDate());
        caseEntity.setNextFollowUpDate(payload.getNextFollowUpDate());
        caseEntity.setGuardianContacted(payload.getGuardianContacted());
        caseEntity.setActionPlan(payload.getActionPlan());
        caseEntity.setConfidentialityLevel(payload.getConfidentialityLevel());
        caseEntity.setStatus(payload.getStatus());
        caseEntity.setOutcome(payload.getOutcome());
        caseEntity.setRemarks(payload.getRemarks());
    }

    private void validatePayload(CounselingCaseCreate payload) {
        if (payload.getStudentId() == null || !studentRepository.existsById(payload.getStudentId())) {
            throw ApiException.notFound("Student not found");
        }
        if (payload.getConcernType() == null || !VALID_CONCERNS.contains(payload.getConcernType())) {
            throw ApiException.badRequest("Invalid concern type");
        }
        if (payload.getRiskLevel() != null && !VALID_RISK_LEVELS.contains(payload.getRiskLevel())) {
            throw ApiException.badRequest("Invalid risk level");
        }
        if (payload.getConfidentialityLevel() != null && !VALID_CONFIDENTIALITY.contains(payload.getConfidentialityLevel())) {
            throw ApiException.badRequest("Invalid confidentiality level");
        }
        if (payload.getStatus() != null && !VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid counseling status");
        }
    }

    private CounselingCase requireCase(Long id) {
        return caseRepository.findById(id).orElseThrow(() -> ApiException.notFound("Counseling case not found"));
    }

    private String nextCaseNo() {
        Long latestId = caseRepository.findTopByOrderByIdDesc().map(CounselingCase::getId).orElse(null);
        long nextNumber = (latestId != null ? latestId : 0) + 1;
        return String.format("CNS-%04d", nextNumber);
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serialize(CounselingCase caseEntity) {
        Student student = studentRepository.findById(caseEntity.getStudentId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", caseEntity.getId());
        body.put("case_no", caseEntity.getCaseNo());
        body.put("student_id", caseEntity.getStudentId());
        body.put("concern_type", caseEntity.getConcernType());
        body.put("risk_level", caseEntity.getRiskLevel());
        body.put("reported_by", caseEntity.getReportedBy());
        body.put("counselor", caseEntity.getCounselor());
        body.put("session_date", caseEntity.getSessionDate());
        body.put("next_follow_up_date", caseEntity.getNextFollowUpDate());
        body.put("guardian_contacted", caseEntity.getGuardianContacted());
        body.put("action_plan", caseEntity.getActionPlan());
        body.put("confidentiality_level", caseEntity.getConfidentialityLevel());
        body.put("status", caseEntity.getStatus());
        body.put("outcome", caseEntity.getOutcome());
        body.put("remarks", caseEntity.getRemarks());
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_name", student != null ? student.getClassName() : null);
        body.put("section", student != null ? student.getSection() : null);
        body.put("guardian_name", student != null ? student.getGuardianName() : null);
        body.put("guardian_phone", student != null ? student.getGuardianPhone() : null);
        body.put("created_at", caseEntity.getCreatedAt());
        body.put("updated_at", caseEntity.getUpdatedAt());
        return body;
    }
}
