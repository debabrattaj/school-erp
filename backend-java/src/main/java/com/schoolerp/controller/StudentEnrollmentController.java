package com.schoolerp.controller;

import com.schoolerp.dto.enrollment.StudentEnrollmentCreate;
import com.schoolerp.dto.enrollment.StudentPromotionRequest;
import com.schoolerp.dto.enrollment.YearEndRequest;
import com.schoolerp.entity.*;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Direct port of backend/app/routes/student_enrollments.py. Deliberately
 * has no auth checks on any endpoint, matching the Python source exactly
 * (it never calls Depends(get_current_user)/require_roles anywhere).
 */
@RestController
public class StudentEnrollmentController {

    private final StudentEnrollmentRepository studentEnrollmentRepository;
    private final StudentRepository studentRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final MasterDataRepository masterDataRepository;
    private final MarkRepository markRepository;
    private final FeeRepository feeRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;

    public StudentEnrollmentController(
            StudentEnrollmentRepository studentEnrollmentRepository,
            StudentRepository studentRepository,
            SchoolClassRepository schoolClassRepository,
            MasterDataRepository masterDataRepository,
            MarkRepository markRepository,
            FeeRepository feeRepository,
            SchoolSettingsRepository schoolSettingsRepository
    ) {
        this.studentEnrollmentRepository = studentEnrollmentRepository;
        this.studentRepository = studentRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.masterDataRepository = masterDataRepository;
        this.markRepository = markRepository;
        this.feeRepository = feeRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
    }

    @GetMapping({"/student-enrollments", "/student-enrollments/"})
    public List<Map<String, Object>> getStudentEnrollments(
            @RequestParam(name = "student_id", required = false) Long studentId,
            @RequestParam(name = "class_id", required = false) Long classId,
            @RequestParam(name = "academic_year", required = false) String academicYear,
            @RequestParam(name = "enrollment_status", required = false) String enrollmentStatus
    ) {
        return studentEnrollmentRepository.findAll().stream()
                .filter(e -> studentId == null || studentId.equals(e.getStudentId()))
                .filter(e -> classId == null || classId.equals(e.getClassId()))
                .filter(e -> academicYear == null || academicYear.equals(e.getAcademicYear()))
                .filter(e -> enrollmentStatus == null || enrollmentStatus.equals(e.getEnrollmentStatus()))
                .sorted(Comparator.comparing(StudentEnrollment::getId).reversed())
                .map(this::serializeEnrollment)
                .toList();
    }

    @PostMapping({"/student-enrollments", "/student-enrollments/"})
    public Map<String, Object> createStudentEnrollment(@Valid @RequestBody StudentEnrollmentCreate payload) {
        Student student = requireStudent(payload.getStudentId());
        SchoolClass classRecord = requireClass(payload.getClassId());
        validateAcademicYear(payload.getAcademicYear());

        studentEnrollmentRepository.findByStudentIdAndClassIdAndAcademicYear(payload.getStudentId(), payload.getClassId(), payload.getAcademicYear())
                .ifPresent(existing -> { throw ApiException.badRequest("Enrollment already exists for this student, class and academic year"); });

        StudentEnrollment enrollment = new StudentEnrollment();
        enrollment.setStudentId(payload.getStudentId());
        enrollment.setClassId(payload.getClassId());
        enrollment.setAcademicYear(payload.getAcademicYear());
        enrollment.setRollNo(payload.getRollNo());
        enrollment.setEnrollmentStatus(payload.getEnrollmentStatus() != null ? payload.getEnrollmentStatus() : "Active");
        enrollment.setPromotionStatus("Not Promoted");
        enrollment.setStartDate(payload.getStartDate());
        enrollment.setEndDate(payload.getEndDate());
        enrollment.setRemarks(payload.getRemarks());
        applyClassSnapshot(enrollment, classRecord);

        enrollment = studentEnrollmentRepository.save(enrollment);

        student.setClassId(classRecord.getId());
        student.setClassName(classRecord.getClassName());
        student.setSection(classRecord.getSection());
        if (payload.getRollNo() != null && !payload.getRollNo().isBlank()) {
            student.setRollNo(payload.getRollNo());
        }
        studentRepository.save(student);

        return serializeEnrollment(enrollment);
    }

    @PutMapping("/student-enrollments/{enrollmentId}")
    public Map<String, Object> updateStudentEnrollment(@PathVariable Long enrollmentId, @Valid @RequestBody StudentEnrollmentCreate payload) {
        StudentEnrollment enrollment = studentEnrollmentRepository.findById(enrollmentId)
                .orElseThrow(() -> ApiException.notFound("Enrollment not found"));

        Student student = requireStudent(payload.getStudentId());
        SchoolClass classRecord = requireClass(payload.getClassId());
        validateAcademicYear(payload.getAcademicYear());

        enrollment.setStudentId(payload.getStudentId());
        enrollment.setClassId(payload.getClassId());
        enrollment.setAcademicYear(payload.getAcademicYear());
        enrollment.setRollNo(payload.getRollNo());
        enrollment.setEnrollmentStatus(payload.getEnrollmentStatus() != null ? payload.getEnrollmentStatus() : "Active");
        enrollment.setPromotionStatus(payload.getPromotionStatus() != null ? payload.getPromotionStatus() : "Not Promoted");
        enrollment.setStartDate(payload.getStartDate());
        enrollment.setEndDate(payload.getEndDate());
        enrollment.setRemarks(payload.getRemarks());
        enrollment.setUpdatedAt(LocalDateTime.now());
        applyClassSnapshot(enrollment, classRecord);

        if ("Active".equals(enrollment.getEnrollmentStatus())) {
            student.setClassId(classRecord.getId());
            student.setClassName(classRecord.getClassName());
            student.setSection(classRecord.getSection());
            if (payload.getRollNo() != null && !payload.getRollNo().isBlank()) {
                student.setRollNo(payload.getRollNo());
            }
            studentRepository.save(student);
        }

        enrollment = studentEnrollmentRepository.save(enrollment);
        return serializeEnrollment(enrollment);
    }

    @DeleteMapping("/student-enrollments/{enrollmentId}")
    public Map<String, String> deleteStudentEnrollment(@PathVariable Long enrollmentId) {
        StudentEnrollment enrollment = studentEnrollmentRepository.findById(enrollmentId)
                .orElseThrow(() -> ApiException.notFound("Enrollment not found"));
        studentEnrollmentRepository.delete(enrollment);
        return Map.of("message", "Enrollment deleted successfully");
    }

    @PostMapping("/student-enrollments/sync-current")
    public Map<String, Object> syncCurrentStudentEnrollments(@RequestParam(name = "academic_year") String academicYear) {
        validateAcademicYear(academicYear);

        int created = 0;
        int skipped = 0;

        for (Student student : studentRepository.findAll()) {
            if (student.getClassId() == null) {
                skipped++;
                continue;
            }

            SchoolClass classRecord = requireClass(student.getClassId());

            if (studentEnrollmentRepository.findByStudentIdAndClassIdAndAcademicYear(student.getId(), student.getClassId(), academicYear).isPresent()) {
                skipped++;
                continue;
            }

            StudentEnrollment enrollment = new StudentEnrollment();
            enrollment.setStudentId(student.getId());
            enrollment.setClassId(student.getClassId());
            enrollment.setAcademicYear(academicYear);
            enrollment.setRollNo(student.getRollNo());
            enrollment.setEnrollmentStatus("Active");
            enrollment.setPromotionStatus("Not Promoted");
            enrollment.setRemarks("Created from current student profile");
            applyClassSnapshot(enrollment, classRecord);
            studentEnrollmentRepository.save(enrollment);
            created++;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Current student enrollments synced successfully");
        body.put("created", created);
        body.put("skipped", skipped);
        return body;
    }

    @PostMapping("/student-enrollments/promote")
    public Map<String, Object> promoteStudents(@Valid @RequestBody StudentPromotionRequest payload) {
        validateAcademicYear(payload.getFromAcademicYear());
        validateAcademicYear(payload.getToAcademicYear());

        SchoolClass fromClass = requireClass(payload.getFromClassId());
        SchoolClass toClass = requireClass(payload.getToClassId());

        List<Long> promoted = new ArrayList<>();
        List<Long> skipped = new ArrayList<>();

        for (Long studentId : payload.getStudentIds()) {
            Student student = requireStudent(studentId);

            if (studentEnrollmentRepository.findByStudentIdAndClassIdAndAcademicYear(studentId, payload.getToClassId(), payload.getToAcademicYear()).isPresent()) {
                skipped.add(studentId);
                continue;
            }

            studentEnrollmentRepository.findByStudentIdAndClassIdAndAcademicYear(studentId, payload.getFromClassId(), payload.getFromAcademicYear())
                    .ifPresent(source -> {
                        source.setPromotionStatus("Promoted");
                        source.setEnrollmentStatus("Completed");
                        source.setEndDate(payload.getStartDate());
                        source.setUpdatedAt(LocalDateTime.now());
                        studentEnrollmentRepository.save(source);
                    });

            StudentEnrollment newEnrollment = new StudentEnrollment();
            newEnrollment.setStudentId(studentId);
            newEnrollment.setClassId(payload.getToClassId());
            newEnrollment.setAcademicYear(payload.getToAcademicYear());
            newEnrollment.setRollNo(student.getRollNo());
            newEnrollment.setEnrollmentStatus("Active");
            newEnrollment.setPromotionStatus("Not Promoted");
            newEnrollment.setStartDate(payload.getStartDate());
            newEnrollment.setRemarks(payload.getRemarks() != null ? payload.getRemarks() : "Created by promotion");
            applyClassSnapshot(newEnrollment, toClass);
            studentEnrollmentRepository.save(newEnrollment);

            student.setClassId(toClass.getId());
            student.setClassName(toClass.getClassName());
            student.setSection(toClass.getSection());
            student.setStudentStatus("Active");
            studentRepository.save(student);

            promoted.add(studentId);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Promotion completed");
        body.put("from_class", classDisplay(fromClass));
        body.put("to_class", classDisplay(toClass));
        body.put("from_academic_year", payload.getFromAcademicYear());
        body.put("to_academic_year", payload.getToAcademicYear());
        body.put("promoted_count", promoted.size());
        body.put("skipped_count", skipped.size());
        body.put("promoted_students", promoted);
        body.put("skipped_students", skipped);
        return body;
    }

    @PostMapping("/student-enrollments/year-end")
    public Map<String, Object> processYearEnd(@Valid @RequestBody YearEndRequest payload) {
        validateAcademicYear(payload.getFromAcademicYear());

        boolean needsTargetYear = payload.getActions().stream().anyMatch(a -> "promote".equals(a.getAction()) || "detain".equals(a.getAction()));
        if (needsTargetYear) {
            if (payload.getToAcademicYear() == null || payload.getToAcademicYear().isBlank()) {
                throw ApiException.badRequest("to_academic_year is required when promoting or detaining");
            }
            if (payload.getToAcademicYear().equals(payload.getFromAcademicYear())) {
                throw ApiException.badRequest("Target academic year must differ from source year");
            }
            validateAcademicYear(payload.getToAcademicYear());
        }

        List<Long> promotedIds = new ArrayList<>();
        List<Long> detainedIds = new ArrayList<>();
        List<Long> graduatedIds = new ArrayList<>();
        List<Map<String, Object>> skipped = new ArrayList<>();
        int feesCarried = 0;
        Set<Long> seenStudents = new HashSet<>();

        for (YearEndRequest.Action actionItem : payload.getActions()) {
            if (seenStudents.contains(actionItem.getStudentId())) {
                skipped.add(skip(actionItem.getStudentId(), "Duplicate student in request; only first action applied"));
                continue;
            }
            seenStudents.add(actionItem.getStudentId());

            String action = actionItem.getAction() == null ? "" : actionItem.getAction().trim().toLowerCase();
            if (!Set.of("promote", "detain", "graduate").contains(action)) {
                skipped.add(skip(actionItem.getStudentId(), "Unknown action '" + actionItem.getAction() + "'"));
                continue;
            }

            Student student = studentRepository.findById(actionItem.getStudentId()).orElse(null);
            if (student == null) {
                skipped.add(skip(actionItem.getStudentId(), "Student not found"));
                continue;
            }

            StudentEnrollment sourceEnrollment = studentEnrollmentRepository
                    .findByStudentIdAndAcademicYearAndEnrollmentStatus(student.getId(), payload.getFromAcademicYear(), "Active")
                    .orElse(null);
            if (sourceEnrollment == null) {
                skipped.add(skip(student.getId(), "No active enrollment in " + payload.getFromAcademicYear()));
                continue;
            }

            if ("graduate".equals(action)) {
                sourceEnrollment.setEnrollmentStatus("Completed");
                sourceEnrollment.setPromotionStatus("Graduated");
                sourceEnrollment.setEndDate(payload.getStartDate());
                sourceEnrollment.setUpdatedAt(LocalDateTime.now());
                studentEnrollmentRepository.save(sourceEnrollment);

                student.setStudentStatus("Graduated");
                studentRepository.save(student);

                graduatedIds.add(student.getId());
                continue;
            }

            SchoolClass targetClass;
            String sourceStatus;
            if ("promote".equals(action)) {
                if (actionItem.getToClassId() == null) {
                    skipped.add(skip(student.getId(), "to_class_id required for promote"));
                    continue;
                }
                targetClass = schoolClassRepository.findById(actionItem.getToClassId()).orElse(null);
                if (targetClass == null) {
                    skipped.add(skip(student.getId(), "Target class not found"));
                    continue;
                }
                sourceStatus = "Promoted";
            } else {
                targetClass = sourceEnrollment.getClassId() != null ? schoolClassRepository.findById(sourceEnrollment.getClassId()).orElse(null) : null;
                if (targetClass == null) {
                    skipped.add(skip(student.getId(), "Current class not found for detention"));
                    continue;
                }
                sourceStatus = "Detained";
            }

            if (studentEnrollmentRepository.findByStudentIdAndClassIdAndAcademicYear(student.getId(), targetClass.getId(), payload.getToAcademicYear()).isPresent()) {
                skipped.add(skip(student.getId(), "Already enrolled in " + payload.getToAcademicYear()));
                continue;
            }

            sourceEnrollment.setEnrollmentStatus("Completed");
            sourceEnrollment.setPromotionStatus(sourceStatus);
            sourceEnrollment.setEndDate(payload.getStartDate());
            sourceEnrollment.setUpdatedAt(LocalDateTime.now());
            studentEnrollmentRepository.save(sourceEnrollment);

            StudentEnrollment newEnrollment = new StudentEnrollment();
            newEnrollment.setStudentId(student.getId());
            newEnrollment.setClassId(targetClass.getId());
            newEnrollment.setAcademicYear(payload.getToAcademicYear());
            newEnrollment.setRollNo(student.getRollNo());
            newEnrollment.setEnrollmentStatus("Active");
            newEnrollment.setPromotionStatus("Not Promoted");
            newEnrollment.setStartDate(payload.getStartDate());
            newEnrollment.setRemarks(payload.getRemarks() != null ? payload.getRemarks()
                    : ("detain".equals(action) ? "Detained - repeating class" : "Created by year-end promotion"));
            applyClassSnapshot(newEnrollment, targetClass);
            studentEnrollmentRepository.save(newEnrollment);

            student.setClassId(targetClass.getId());
            student.setClassName(targetClass.getClassName());
            student.setSection(targetClass.getSection());
            student.setStudentStatus("Active");
            studentRepository.save(student);

            if (payload.isCarryForwardFees()) {
                List<Fee> unpaid = feeRepository.findByStudentId(student.getId()).stream()
                        .filter(f -> payload.getFromAcademicYear().equals(f.getAcademicYear()))
                        .filter(f -> "Unpaid".equals(f.getPaymentStatus()) || "Partial".equals(f.getPaymentStatus()))
                        .toList();
                double totalDue = unpaid.stream().mapToDouble(f -> f.getDueAmount() != null ? f.getDueAmount() : 0).sum();
                if (totalDue > 0) {
                    Fee carryFee = new Fee();
                    carryFee.setStudentId(student.getId());
                    carryFee.setFeeType("Other");
                    carryFee.setAcademicYear(payload.getToAcademicYear());
                    carryFee.setClassId(targetClass.getId());
                    carryFee.setClassNameSnapshot(targetClass.getClassName());
                    carryFee.setSectionSnapshot(targetClass.getSection());
                    carryFee.setTotalAmount(totalDue);
                    carryFee.setPaidAmount(0.0);
                    carryFee.setDueAmount(totalDue);
                    carryFee.setPaymentStatus("Unpaid");
                    carryFee.setRemarks("Balance carried forward from " + payload.getFromAcademicYear());
                    feeRepository.save(carryFee);
                    feesCarried++;
                }
            }

            if ("promote".equals(action)) {
                promotedIds.add(student.getId());
            } else {
                detainedIds.add(student.getId());
            }
        }

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("promoted", promotedIds);
        details.put("detained", detainedIds);
        details.put("graduated", graduatedIds);
        details.put("skipped", skipped);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Year-end processing completed");
        body.put("from_academic_year", payload.getFromAcademicYear());
        body.put("to_academic_year", payload.getToAcademicYear());
        body.put("promoted_count", promotedIds.size());
        body.put("detained_count", detainedIds.size());
        body.put("graduated_count", graduatedIds.size());
        body.put("skipped_count", skipped.size());
        body.put("fees_carried_forward", feesCarried);
        body.put("details", details);
        return body;
    }

    @GetMapping("/student-enrollments/year-end/suggestions")
    public Map<String, Object> yearEndSuggestions(@RequestParam(name = "academic_year") String academicYear) {
        validateAcademicYear(academicYear);

        List<SchoolSettings> settingsList = schoolSettingsRepository.findAll();
        double passPercentage = !settingsList.isEmpty() && settingsList.get(0).getPassPercentage() != null
                ? settingsList.get(0).getPassPercentage() : 40.0;

        Set<String> yearMatches = yearVariants(academicYear);

        List<StudentEnrollment> enrollments = studentEnrollmentRepository.findByAcademicYearAndEnrollmentStatus(academicYear, "Active");

        List<Map<String, Object>> suggestions = new ArrayList<>();
        for (StudentEnrollment enrollment : enrollments) {
            List<Mark> marks = markRepository.findByStudentId(enrollment.getStudentId()).stream()
                    .filter(m -> yearMatches.contains(m.getAcademicYear()))
                    .toList();

            double totalObtained = marks.stream().mapToDouble(m -> m.getMarksObtained() != null ? m.getMarksObtained() : 0).sum();
            double totalMax = marks.stream()
                    .mapToDouble(m -> m.getMaxMarks() != null ? m.getMaxMarks() : (m.getTotalMarks() != null ? m.getTotalMarks() : 100))
                    .sum();
            Double percentage = totalMax != 0 ? Math.round(totalObtained / totalMax * 1000.0) / 10.0 : null;

            SchoolClass currentClass = enrollment.getClassId() != null ? schoolClassRepository.findById(enrollment.getClassId()).orElse(null) : null;

            SchoolClass suggestedClass = null;
            boolean isFinal = false;
            if (currentClass != null) {
                Object[] result = suggestNextClass(currentClass);
                suggestedClass = (SchoolClass) result[0];
                isFinal = (boolean) result[1];
            }

            String suggestion;
            String reason;
            if (percentage == null) {
                suggestion = null;
                reason = "No marks recorded for this year";
            } else if (percentage < passPercentage) {
                suggestion = "detain";
                reason = percentage + "% is below pass mark of " + passPercentage + "%";
            } else if (isFinal) {
                suggestion = "graduate";
                reason = "Passed with " + percentage + "% in the final class";
            } else {
                suggestion = "promote";
                reason = "Passed with " + percentage + "%";
            }

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("student_id", enrollment.getStudentId());
            entry.put("enrollment_id", enrollment.getId());
            entry.put("percentage", percentage);
            entry.put("marks_count", marks.size());
            entry.put("suggestion", suggestion);
            entry.put("reason", reason);
            entry.put("suggested_to_class_id", ("promote".equals(suggestion) && suggestedClass != null) ? suggestedClass.getId() : null);
            suggestions.add(entry);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("academic_year", academicYear);
        body.put("pass_percentage", passPercentage);
        body.put("suggestions", suggestions);
        return body;
    }

    // ===================== helpers =====================

    private Map<String, Object> skip(Long studentId, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("student_id", studentId);
        m.put("reason", reason);
        return m;
    }

    private Student requireStudent(Long studentId) {
        return studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found"));
    }

    private SchoolClass requireClass(Long classId) {
        return schoolClassRepository.findById(classId).orElseThrow(() -> ApiException.notFound("Class not found"));
    }

    /** No-op if Master Data has no AcademicYear entries at all (nothing to validate against yet). */
    private void validateAcademicYear(String academicYear) {
        boolean hasAcademicYearMaster = masterDataRepository.findAll().stream()
                .anyMatch(m -> "AcademicYear".equals(m.getCategory()));
        if (!hasAcademicYearMaster) {
            return;
        }
        boolean exists = masterDataRepository.findAll().stream()
                .anyMatch(m -> "AcademicYear".equals(m.getCategory()) && academicYear.equals(m.getValue()) && m.isActive());
        if (!exists) {
            throw ApiException.badRequest("Academic year is not available in Master Data");
        }
    }

    private void applyClassSnapshot(StudentEnrollment enrollment, SchoolClass classRecord) {
        enrollment.setClassNameSnapshot(classRecord.getClassName());
        enrollment.setSectionSnapshot(classRecord.getSection());
    }

    private String classDisplay(SchoolClass classRecord) {
        if (classRecord == null) return "-";
        return (classRecord.getClassName() != null ? classRecord.getClassName() : "-")
                + " - Section " + (classRecord.getSection() != null ? classRecord.getSection() : "-");
    }

    private String studentName(Student student) {
        if (student == null) return "-";
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return !name.isBlank() ? name : ("Student ID: " + student.getId());
    }

    private Map<String, Object> serializeEnrollment(StudentEnrollment enrollment) {
        Student student = studentRepository.findById(enrollment.getStudentId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", enrollment.getId());
        body.put("student_id", enrollment.getStudentId());
        body.put("class_id", enrollment.getClassId());
        body.put("academic_year", enrollment.getAcademicYear());
        body.put("class_name_snapshot", enrollment.getClassNameSnapshot());
        body.put("section_snapshot", enrollment.getSectionSnapshot());
        body.put("roll_no", enrollment.getRollNo());
        body.put("enrollment_status", enrollment.getEnrollmentStatus());
        body.put("promotion_status", enrollment.getPromotionStatus());
        body.put("start_date", enrollment.getStartDate());
        body.put("end_date", enrollment.getEndDate());
        body.put("remarks", enrollment.getRemarks());
        body.put("created_at", enrollment.getCreatedAt());
        body.put("updated_at", enrollment.getUpdatedAt());
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_display", (enrollment.getClassNameSnapshot() != null ? enrollment.getClassNameSnapshot() : "-")
                + " - Section " + (enrollment.getSectionSnapshot() != null ? enrollment.getSectionSnapshot() : "-"));
        return body;
    }

    /** Tolerate both '2026-27' and '2026-2027' formats found in existing data. */
    private Set<String> yearVariants(String academicYear) {
        Set<String> variants = new LinkedHashSet<>();
        variants.add(academicYear);
        String[] parts = academicYear.split("-");
        if (parts.length == 2) {
            String start = parts[0];
            String end = parts[1];
            if (start.length() == 4 && end.length() == 2) {
                variants.add(start + "-" + start.substring(0, 2) + end);
            }
            if (start.length() == 4 && end.length() == 4) {
                variants.add(start + "-" + end.substring(2));
            }
        }
        return variants;
    }

    /**
     * If the class name is numeric, suggest the next number up (same section
     * preferred). Returns {SchoolClass suggestedClass, boolean isFinalClass}.
     */
    private Object[] suggestNextClass(SchoolClass currentClass) {
        int nextNumber;
        try {
            nextNumber = Integer.parseInt(String.valueOf(currentClass.getClassName()).trim()) + 1;
        } catch (NumberFormatException e) {
            return new Object[]{null, false};
        }

        List<SchoolClass> candidates = schoolClassRepository.findAll().stream()
                .filter(c -> String.valueOf(nextNumber).equals(c.getClassName()))
                .toList();
        if (candidates.isEmpty()) {
            return new Object[]{null, true};
        }

        SchoolClass sameSection = candidates.stream()
                .filter(c -> Objects.equals(c.getSection(), currentClass.getSection()))
                .findFirst()
                .orElse(candidates.get(0));
        return new Object[]{sameSection, false};
    }
}
