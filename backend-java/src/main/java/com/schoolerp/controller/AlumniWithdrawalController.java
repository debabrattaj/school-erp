package com.schoolerp.controller;

import com.schoolerp.dto.alumni.AlumniWithdrawalRecordCreate;
import com.schoolerp.entity.AlumniWithdrawalRecord;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.AlumniWithdrawalRecordRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/alumni_withdrawals.py. */
@RestController
@RequestMapping("/alumni-withdrawals")
public class AlumniWithdrawalController {

    private static final List<String> VALID_TYPES = List.of("Withdrawal", "Transfer", "Alumni");
    private static final List<String> VALID_CERTIFICATE_STATUSES = List.of(
            "Pending", "In Progress", "Issued", "Rejected", "Not Required"
    );
    private static final List<String> VALID_STATUSES = List.of("Pending", "Approved", "Completed", "Rejected", "Archived");

    private final AlumniWithdrawalRecordRepository recordRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public AlumniWithdrawalController(
            AlumniWithdrawalRecordRepository recordRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.recordRepository = recordRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> getRecords(
            @RequestParam(name = "record_type", required = false) String recordType,
            @RequestParam(name = "current_status", required = false) String currentStatus,
            @RequestParam(name = "certificate_status", required = false) String certificateStatus
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return recordRepository.findAll().stream()
                .filter(r -> recordType == null || recordType.equals(r.getRecordType()))
                .filter(r -> currentStatus == null || currentStatus.equals(r.getCurrentStatus()))
                .filter(r -> certificateStatus == null || certificateStatus.equals(r.getCertificateStatus()))
                .sorted(Comparator.comparing(AlumniWithdrawalRecord::getId).reversed())
                .map(this::serialize)
                .toList();
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createRecord(@Valid @RequestBody AlumniWithdrawalRecordCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        validatePayload(payload);
        hydrateStudentSnapshot(payload);

        String recordNo = payload.getRecordNo() != null ? payload.getRecordNo().trim() : "";
        if (recordNo.isEmpty()) {
            recordNo = nextRecordNo();
        }
        if (recordRepository.findByRecordNo(recordNo).isPresent()) {
            throw ApiException.badRequest("Record number already exists");
        }

        AlumniWithdrawalRecord record = new AlumniWithdrawalRecord();
        record.setRecordNo(recordNo);
        applyPayload(record, payload);

        return serialize(recordRepository.save(record));
    }

    @PutMapping("/{recordId}")
    public Map<String, Object> updateRecord(@PathVariable Long recordId, @Valid @RequestBody AlumniWithdrawalRecordCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        AlumniWithdrawalRecord record = requireRecord(recordId);
        validatePayload(payload);
        hydrateStudentSnapshot(payload);

        String recordNo = payload.getRecordNo() != null ? payload.getRecordNo().trim() : "";
        if (recordNo.isEmpty()) {
            recordNo = record.getRecordNo();
        }
        String finalRecordNo = recordNo;
        recordRepository.findByRecordNo(recordNo).ifPresent(existing -> {
            if (!existing.getId().equals(recordId)) {
                throw ApiException.badRequest("Record number already exists");
            }
        });

        record.setRecordNo(finalRecordNo);
        applyPayload(record, payload);

        return serialize(recordRepository.save(record));
    }

    @DeleteMapping("/{recordId}")
    public Map<String, String> deleteRecord(@PathVariable Long recordId) {
        permissionService.requireRoles("Admin");
        AlumniWithdrawalRecord record = requireRecord(recordId);
        recordRepository.delete(record);
        return Map.of("message", "Alumni withdrawal record deleted successfully");
    }

    // ===================== helpers =====================

    private void hydrateStudentSnapshot(AlumniWithdrawalRecordCreate payload) {
        if (payload.getStudentId() == null) {
            return;
        }
        Student student = studentRepository.findById(payload.getStudentId())
                .orElseThrow(() -> ApiException.notFound("Student not found"));

        if (payload.getStudentName() == null || payload.getStudentName().trim().isEmpty()) {
            payload.setStudentName(studentName(student));
        }
        if (payload.getAdmissionNo() == null || payload.getAdmissionNo().isBlank()) {
            payload.setAdmissionNo(student.getAdmissionNo());
        }
        if (payload.getLastClass() == null || payload.getLastClass().isBlank()) {
            String lastClass = ((student.getClassName() != null ? student.getClassName() : "") + " "
                    + (student.getSection() != null ? student.getSection() : "")).trim().replaceAll(" +", " ");
            payload.setLastClass(lastClass.isEmpty() ? null : lastClass);
        }
        if (payload.getAlumniEmail() == null || payload.getAlumniEmail().isBlank()) {
            payload.setAlumniEmail(student.getGuardianEmail());
        }
        if (payload.getAlumniPhone() == null || payload.getAlumniPhone().isBlank()) {
            payload.setAlumniPhone(student.getGuardianPhone());
        }
    }

    private void applyPayload(AlumniWithdrawalRecord record, AlumniWithdrawalRecordCreate payload) {
        record.setStudentId(payload.getStudentId());
        record.setStudentName(payload.getStudentName());
        record.setAdmissionNo(payload.getAdmissionNo());
        record.setLastClass(payload.getLastClass());
        record.setRecordType(payload.getRecordType());
        record.setRequestDate(payload.getRequestDate());
        record.setLeavingDate(payload.getLeavingDate());
        record.setReason(payload.getReason());
        record.setDestinationSchool(payload.getDestinationSchool());
        record.setDestinationCountry(payload.getDestinationCountry());
        record.setCertificateStatus(payload.getCertificateStatus());
        record.setAlumniEmail(payload.getAlumniEmail());
        record.setAlumniPhone(payload.getAlumniPhone());
        record.setCurrentStatus(payload.getCurrentStatus());
        record.setApprovedBy(payload.getApprovedBy());
        record.setApprovalDate(payload.getApprovalDate());
        record.setRemarks(payload.getRemarks());
    }

    private void validatePayload(AlumniWithdrawalRecordCreate payload) {
        if (payload.getRecordType() != null && !VALID_TYPES.contains(payload.getRecordType())) {
            throw ApiException.badRequest("Invalid record type");
        }
        boolean hasStudentName = payload.getStudentName() != null && !payload.getStudentName().trim().isEmpty();
        if (!hasStudentName && payload.getStudentId() == null) {
            throw ApiException.badRequest("Student name is required");
        }
        if (payload.getReason() == null || payload.getReason().trim().isEmpty()) {
            throw ApiException.badRequest("Reason is required");
        }
        if (payload.getCertificateStatus() != null && !VALID_CERTIFICATE_STATUSES.contains(payload.getCertificateStatus())) {
            throw ApiException.badRequest("Invalid certificate status");
        }
        if (payload.getCurrentStatus() != null && !VALID_STATUSES.contains(payload.getCurrentStatus())) {
            throw ApiException.badRequest("Invalid current status");
        }
    }

    private AlumniWithdrawalRecord requireRecord(Long id) {
        return recordRepository.findById(id).orElseThrow(() -> ApiException.notFound("Alumni withdrawal record not found"));
    }

    private String nextRecordNo() {
        Long latestId = recordRepository.findTopByOrderByIdDesc().map(AlumniWithdrawalRecord::getId).orElse(null);
        long nextNumber = (latestId != null ? latestId : 0) + 1;
        return String.format("AW-%04d", nextNumber);
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serialize(AlumniWithdrawalRecord record) {
        Student student = record.getStudentId() != null
                ? studentRepository.findById(record.getStudentId()).orElse(null)
                : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", record.getId());
        body.put("record_no", record.getRecordNo());
        body.put("student_id", record.getStudentId());
        body.put("student_name", record.getStudentName());
        body.put("admission_no", record.getAdmissionNo());
        body.put("last_class", record.getLastClass());
        body.put("record_type", record.getRecordType());
        body.put("request_date", record.getRequestDate());
        body.put("leaving_date", record.getLeavingDate());
        body.put("reason", record.getReason());
        body.put("destination_school", record.getDestinationSchool());
        body.put("destination_country", record.getDestinationCountry());
        body.put("certificate_status", record.getCertificateStatus());
        body.put("alumni_email", record.getAlumniEmail());
        body.put("alumni_phone", record.getAlumniPhone());
        body.put("current_status", record.getCurrentStatus());
        body.put("approved_by", record.getApprovedBy());
        body.put("approval_date", record.getApprovalDate());
        body.put("remarks", record.getRemarks());
        body.put("section", student != null ? student.getSection() : null);
        body.put("guardian_name", student != null ? student.getGuardianName() : null);
        body.put("created_at", record.getCreatedAt());
        body.put("updated_at", record.getUpdatedAt());
        return body;
    }
}
