package com.schoolerp.controller;

import com.schoolerp.dto.health.HealthInfirmaryVisitCreate;
import com.schoolerp.entity.HealthInfirmaryVisit;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.HealthInfirmaryVisitRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/health_infirmary.py. */
@RestController
@RequestMapping("/health-infirmary")
public class HealthInfirmaryController {

    private final HealthInfirmaryVisitRepository visitRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public HealthInfirmaryController(
            HealthInfirmaryVisitRepository visitRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.visitRepository = visitRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    @GetMapping("/visits/")
    public List<Map<String, Object>> getVisits(
            @RequestParam(required = false) String status,
            @RequestParam(name = "student_id", required = false) Long studentId
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return visitRepository.findAll().stream()
                .filter(v -> status == null || status.equals(v.getStatus()))
                .filter(v -> studentId == null || studentId.equals(v.getStudentId()))
                .sorted(Comparator.comparing(HealthInfirmaryVisit::getId).reversed())
                .map(this::serialize)
                .toList();
    }

    @PostMapping("/visits/")
    public Map<String, Object> createVisit(@Valid @RequestBody HealthInfirmaryVisitCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        requireStudent(payload.getStudentId());
        if (payload.getSymptoms() == null || payload.getSymptoms().trim().isEmpty()) {
            throw ApiException.badRequest("Symptoms are required");
        }

        HealthInfirmaryVisit visit = new HealthInfirmaryVisit();
        applyPayload(visit, payload);

        return serialize(visitRepository.save(visit));
    }

    @PutMapping("/visits/{visitId}")
    public Map<String, Object> updateVisit(@PathVariable Long visitId, @Valid @RequestBody HealthInfirmaryVisitCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        HealthInfirmaryVisit visit = requireVisit(visitId);
        requireStudent(payload.getStudentId());
        if (payload.getSymptoms() == null || payload.getSymptoms().trim().isEmpty()) {
            throw ApiException.badRequest("Symptoms are required");
        }

        applyPayload(visit, payload);

        return serialize(visitRepository.save(visit));
    }

    @DeleteMapping("/visits/{visitId}")
    public Map<String, String> deleteVisit(@PathVariable Long visitId) {
        permissionService.requireRoles("Admin");
        HealthInfirmaryVisit visit = requireVisit(visitId);
        visitRepository.delete(visit);
        return Map.of("message", "Health visit deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(HealthInfirmaryVisit visit, HealthInfirmaryVisitCreate payload) {
        visit.setStudentId(payload.getStudentId());
        visit.setVisitDate(payload.getVisitDate());
        visit.setVisitTime(payload.getVisitTime());
        visit.setSymptoms(payload.getSymptoms());
        visit.setDiagnosis(payload.getDiagnosis());
        visit.setTreatment(payload.getTreatment());
        visit.setMedicineGiven(payload.getMedicineGiven());
        visit.setAttendedBy(payload.getAttendedBy());
        visit.setReferredToHospital(payload.getReferredToHospital());
        visit.setFollowUpDate(payload.getFollowUpDate());
        visit.setStatus(payload.getStatus());
        visit.setRemarks(payload.getRemarks());
    }

    private void requireStudent(Long id) {
        if (id == null || !studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }

    private HealthInfirmaryVisit requireVisit(Long id) {
        return visitRepository.findById(id).orElseThrow(() -> ApiException.notFound("Health visit not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serialize(HealthInfirmaryVisit visit) {
        Student student = studentRepository.findById(visit.getStudentId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", visit.getId());
        body.put("student_id", visit.getStudentId());
        body.put("visit_date", visit.getVisitDate());
        body.put("visit_time", visit.getVisitTime());
        body.put("symptoms", visit.getSymptoms());
        body.put("diagnosis", visit.getDiagnosis());
        body.put("treatment", visit.getTreatment());
        body.put("medicine_given", visit.getMedicineGiven());
        body.put("attended_by", visit.getAttendedBy());
        body.put("referred_to_hospital", visit.getReferredToHospital());
        body.put("follow_up_date", visit.getFollowUpDate());
        body.put("status", visit.getStatus());
        body.put("remarks", visit.getRemarks());
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_name", student != null ? student.getClassName() : null);
        body.put("section", student != null ? student.getSection() : null);
        return body;
    }
}
