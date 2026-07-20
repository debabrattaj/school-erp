package com.schoolerp.controller;

import com.schoolerp.dto.admission.AdmissionConvertRequest;
import com.schoolerp.dto.admission.AdmissionFollowUpCreate;
import com.schoolerp.dto.admission.AdmissionInquiryCreate;
import com.schoolerp.entity.AdmissionFollowUp;
import com.schoolerp.entity.AdmissionInquiry;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.AdmissionFollowUpRepository;
import com.schoolerp.repository.AdmissionInquiryRepository;
import com.schoolerp.repository.AdmissionWorkflowStageRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.service.AdmissionWorkflowService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Direct port of backend/app/routes/admissions.py. Deliberately has no auth
 * checks on any endpoint, matching the Python source exactly.
 */
@RestController
@RequestMapping("/admissions")
public class AdmissionController {

    private final AdmissionInquiryRepository admissionInquiryRepository;
    private final AdmissionFollowUpRepository admissionFollowUpRepository;
    private final AdmissionWorkflowStageRepository admissionWorkflowStageRepository;
    private final AdmissionWorkflowService admissionWorkflowService;
    private final StudentRepository studentRepository;

    public AdmissionController(
            AdmissionInquiryRepository admissionInquiryRepository,
            AdmissionFollowUpRepository admissionFollowUpRepository,
            AdmissionWorkflowStageRepository admissionWorkflowStageRepository,
            AdmissionWorkflowService admissionWorkflowService,
            StudentRepository studentRepository
    ) {
        this.admissionInquiryRepository = admissionInquiryRepository;
        this.admissionFollowUpRepository = admissionFollowUpRepository;
        this.admissionWorkflowStageRepository = admissionWorkflowStageRepository;
        this.admissionWorkflowService = admissionWorkflowService;
        this.studentRepository = studentRepository;
    }

    @GetMapping({"", "/"})
    public List<AdmissionInquiry> getAdmissionInquiries(
            @RequestParam(required = false) String stage,
            @RequestParam(name = "academic_year", required = false) String academicYear
    ) {
        return admissionInquiryRepository.findAll().stream()
                .filter(i -> stage == null || stage.equals(i.getStage()))
                .filter(i -> academicYear == null || academicYear.equals(i.getAcademicYear()))
                .sorted(Comparator.comparing(AdmissionInquiry::getId).reversed())
                .toList();
    }

    @GetMapping("/next-admission-no")
    public Map<String, String> getNextStudentAdmissionNo() {
        return Map.of("admission_no", nextStudentAdmissionNo());
    }

    @GetMapping("/{inquiryId}")
    public AdmissionInquiry getAdmissionInquiry(@PathVariable Long inquiryId) {
        return requireInquiry(inquiryId);
    }

    @PostMapping({"", "/"})
    public AdmissionInquiry createAdmissionInquiry(@Valid @RequestBody AdmissionInquiryCreate payload) {
        String inquiryNo = payload.getInquiryNo() != null ? payload.getInquiryNo().trim() : "";
        if (inquiryNo.isEmpty()) {
            inquiryNo = nextInquiryNo();
        }
        validateStage(payload.getStage());

        if (admissionInquiryRepository.findByInquiryNo(inquiryNo).isPresent()) {
            throw ApiException.badRequest("Admission inquiry number already exists");
        }

        AdmissionInquiry inquiry = new AdmissionInquiry();
        inquiry.setInquiryNo(inquiryNo);
        applyPayload(inquiry, payload);

        return admissionInquiryRepository.save(inquiry);
    }

    @PutMapping("/{inquiryId}")
    public AdmissionInquiry updateAdmissionInquiry(@PathVariable Long inquiryId, @Valid @RequestBody AdmissionInquiryCreate payload) {
        AdmissionInquiry inquiry = requireInquiry(inquiryId);

        String inquiryNo = payload.getInquiryNo() != null ? payload.getInquiryNo().trim() : "";
        if (inquiryNo.isEmpty()) {
            inquiryNo = inquiry.getInquiryNo();
        }
        validateStage(payload.getStage());

        String finalInquiryNo = inquiryNo;
        admissionInquiryRepository.findByInquiryNo(inquiryNo).ifPresent(existing -> {
            if (!existing.getId().equals(inquiryId)) {
                throw ApiException.badRequest("Admission inquiry number already exists");
            }
        });

        inquiry.setInquiryNo(finalInquiryNo);
        applyPayload(inquiry, payload);

        return admissionInquiryRepository.save(inquiry);
    }

    @GetMapping("/{inquiryId}/follow-ups")
    public List<AdmissionFollowUp> getAdmissionFollowUps(@PathVariable Long inquiryId) {
        requireInquiry(inquiryId);
        return admissionFollowUpRepository.findByInquiryId(inquiryId).stream()
                .sorted(Comparator.comparing(AdmissionFollowUp::getActivityDate, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Comparator.comparing(AdmissionFollowUp::getId).reversed()))
                .toList();
    }

    @PostMapping("/{inquiryId}/follow-ups")
    public AdmissionFollowUp createAdmissionFollowUp(@PathVariable Long inquiryId, @Valid @RequestBody AdmissionFollowUpCreate payload) {
        AdmissionInquiry inquiry = requireInquiry(inquiryId);

        if (payload.getNotes() == null || payload.getNotes().trim().isEmpty()) {
            throw ApiException.badRequest("Follow-up notes are required");
        }

        AdmissionFollowUp followUp = new AdmissionFollowUp();
        followUp.setInquiryId(inquiryId);
        followUp.setActivityDate(payload.getActivityDate());
        followUp.setActivityType(payload.getActivityType());
        followUp.setNotes(payload.getNotes());
        followUp.setNextAction(payload.getNextAction());
        followUp.setNextFollowUpDate(payload.getNextFollowUpDate());
        followUp.setOwner(payload.getOwner());
        followUp.setOutcome(payload.getOutcome());
        followUp = admissionFollowUpRepository.save(followUp);

        inquiry.setFollowUpDate(payload.getNextFollowUpDate());
        if (payload.getOwner() != null && !payload.getOwner().isBlank()) {
            inquiry.setAssignedTo(payload.getOwner());
        }
        if (payload.getNextAction() != null && !payload.getNextAction().isBlank()) {
            String prefix = "Next action: " + payload.getNextAction() + "\n\n";
            inquiry.setNotes((prefix + (inquiry.getNotes() != null ? inquiry.getNotes() : "")).trim());
        }
        admissionInquiryRepository.save(inquiry);

        return followUp;
    }

    @PostMapping("/{inquiryId}/convert")
    public Student convertAdmissionToStudent(@PathVariable Long inquiryId, @Valid @RequestBody AdmissionConvertRequest payload) {
        AdmissionInquiry inquiry = requireInquiry(inquiryId);

        if (inquiry.getConvertedStudentId() != null) {
            throw ApiException.badRequest("Inquiry is already converted");
        }
        if (payload.getFirstName().trim().isEmpty()) {
            throw ApiException.badRequest("First name is required");
        }

        String admissionNo = payload.getAdmissionNo() != null ? payload.getAdmissionNo().trim() : "";
        if (admissionNo.isEmpty()) {
            admissionNo = nextStudentAdmissionNo();
        }

        if (studentRepository.findByAdmissionNo(admissionNo).isPresent()) {
            throw ApiException.badRequest("Student with this admission number already exists");
        }

        Student student = new Student();
        student.setAdmissionNo(admissionNo);
        student.setFirstName(payload.getFirstName().trim());
        String lastName = payload.getLastName() != null ? payload.getLastName().trim() : "";
        student.setLastName(lastName.isEmpty() ? null : lastName);
        student.setClassName(payload.getClassName() != null ? payload.getClassName() : inquiry.getGradeApplying());
        student.setSection(payload.getSection());
        student.setAdmissionDate(payload.getAdmissionDate());
        student.setStudentStatus(payload.getStudentStatus() != null ? payload.getStudentStatus() : "Active");
        student.setGuardianName(payload.getGuardianName() != null ? payload.getGuardianName() : inquiry.getGuardianName());
        student.setGuardianPhone(payload.getGuardianPhone() != null ? payload.getGuardianPhone() : inquiry.getGuardianPhone());
        student.setGuardianEmail(payload.getGuardianEmail() != null ? payload.getGuardianEmail() : inquiry.getGuardianEmail());

        student = studentRepository.save(student);

        inquiry.setConvertedStudentId(student.getId());
        inquiry.setStage("Enrolled");
        admissionInquiryRepository.save(inquiry);

        return student;
    }

    @DeleteMapping("/{inquiryId}")
    public Map<String, String> deleteAdmissionInquiry(@PathVariable Long inquiryId) {
        AdmissionInquiry inquiry = requireInquiry(inquiryId);
        admissionInquiryRepository.delete(inquiry);
        return Map.of("message", "Admission inquiry deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(AdmissionInquiry inquiry, AdmissionInquiryCreate payload) {
        inquiry.setStudentName(payload.getStudentName());
        inquiry.setGradeApplying(payload.getGradeApplying());
        inquiry.setAcademicYear(payload.getAcademicYear());
        inquiry.setGuardianName(payload.getGuardianName());
        inquiry.setGuardianPhone(payload.getGuardianPhone());
        inquiry.setGuardianEmail(payload.getGuardianEmail());
        inquiry.setSource(payload.getSource());
        inquiry.setStage(payload.getStage());
        inquiry.setFollowUpDate(payload.getFollowUpDate());
        inquiry.setAssignedTo(payload.getAssignedTo());
        inquiry.setConvertedStudentId(payload.getConvertedStudentId());
        inquiry.setNotes(payload.getNotes());
    }

    private void validateStage(String stage) {
        if (stage == null || stage.isBlank()) {
            return;
        }
        admissionWorkflowService.ensureDefaultStages();
        if (admissionWorkflowStageRepository.findByName(stage).isEmpty()) {
            throw ApiException.badRequest("Unknown admission stage: " + stage);
        }
    }

    private AdmissionInquiry requireInquiry(Long id) {
        return admissionInquiryRepository.findById(id).orElseThrow(() -> ApiException.notFound("Admission inquiry not found"));
    }

    private String nextInquiryNo() {
        Long latestId = admissionInquiryRepository.findTopByOrderByIdDesc().map(AdmissionInquiry::getId).orElse(null);
        long nextNumber = (latestId != null ? latestId : 0) + 1;
        return String.format("ADM-INQ-%04d", nextNumber);
    }

    private String nextStudentAdmissionNo() {
        Long latestId = studentRepository.findAll().stream()
                .map(Student::getId)
                .max(Long::compareTo)
                .orElse(0L);
        long nextNumber = latestId + 1;
        return String.format("ADM2026%03d", nextNumber);
    }
}
