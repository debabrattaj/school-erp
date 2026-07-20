package com.schoolerp.controller;

import com.schoolerp.entity.Mark;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.entity.Student;
import com.schoolerp.entity.StudentEnrollment;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.MarkRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.repository.StudentEnrollmentRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.GradeService;
import com.schoolerp.service.PdfService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

/**
 * Direct port of backend/app/routes/certificates.py. Same /students prefix
 * as StudentController so access is governed by the "students" permission,
 * matching the Python source's comment on the router prefix.
 */
@RestController
@RequestMapping("/students")
public class CertificateController {

    private static final List<String> VIEWERS = List.of("Admin", "Principal", "Accounts", "Teacher");

    private final StudentRepository studentRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final StudentEnrollmentRepository studentEnrollmentRepository;
    private final MarkRepository markRepository;
    private final PermissionService permissionService;
    private final PdfService pdfService;
    private final GradeService gradeService;

    public CertificateController(
            StudentRepository studentRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            StudentEnrollmentRepository studentEnrollmentRepository,
            MarkRepository markRepository,
            PermissionService permissionService,
            PdfService pdfService,
            GradeService gradeService
    ) {
        this.studentRepository = studentRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.studentEnrollmentRepository = studentEnrollmentRepository;
        this.markRepository = markRepository;
        this.permissionService = permissionService;
        this.pdfService = pdfService;
        this.gradeService = gradeService;
    }

    @GetMapping("/{studentId}/bonafide")
    public ResponseEntity<byte[]> bonafide(@PathVariable Long studentId) {
        permissionService.requireRoles(VIEWERS.toArray(new String[0]));
        Student student = requireStudent(studentId);
        SchoolSettings settings = schoolSettingsRepository.findAll().stream().findFirst().orElse(null);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("school_name", settings != null ? settings.getSchoolName() : "School");
        data.put("logo_url", settings != null ? settings.getLogoUrl() : null);
        data.put("school_address", settings != null ? settings.getAddress() : null);
        data.put("student_name", studentName(student));
        data.put("admission_no", student.getAdmissionNo());
        data.put("father_name", student.getFatherName());
        data.put("guardian_name", student.getGuardianName());
        data.put("class_label", classLabel(student));
        data.put("academic_year", settings != null ? settings.getAcademicYear() : null);
        data.put("dob", student.getDob() != null ? student.getDob().toString() : null);
        data.put("issue_date", LocalDate.now().toString());

        byte[] pdf = pdfService.bonafideCertificatePdf(data);
        return pdfResponse(pdf, "bonafide_" + idOrAdmission(student) + ".pdf");
    }

    @GetMapping("/{studentId}/transfer-certificate")
    public ResponseEntity<byte[]> transferCertificate(
            @PathVariable Long studentId,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String conduct
    ) {
        permissionService.requireRoles(VIEWERS.toArray(new String[0]));
        Student student = requireStudent(studentId);
        SchoolSettings settings = schoolSettingsRepository.findAll().stream().findFirst().orElse(null);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("school_name", settings != null ? settings.getSchoolName() : "School");
        data.put("logo_url", settings != null ? settings.getLogoUrl() : null);
        data.put("school_address", settings != null ? settings.getAddress() : null);
        data.put("tc_no", "TC-" + idOrAdmission(student));
        data.put("student_name", studentName(student));
        data.put("admission_no", student.getAdmissionNo());
        data.put("father_name", student.getFatherName());
        data.put("mother_name", student.getMotherName());
        data.put("dob", student.getDob() != null ? student.getDob().toString() : null);
        data.put("nationality", student.getNationality());
        data.put("class_label", classLabel(student));
        data.put("academic_year", settings != null ? settings.getAcademicYear() : null);
        data.put("admission_date", student.getAdmissionDate() != null ? student.getAdmissionDate().toString() : null);
        data.put("leaving_date", LocalDate.now().toString());
        data.put("reason", reason != null ? reason : "-");
        data.put("conduct", conduct != null ? conduct : "Good");
        data.put("issue_date", LocalDate.now().toString());

        byte[] pdf = pdfService.transferCertificatePdf(data);
        return pdfResponse(pdf, "transfer_certificate_" + idOrAdmission(student) + ".pdf");
    }

    @GetMapping("/{studentId}/transcript")
    public ResponseEntity<byte[]> transcript(@PathVariable Long studentId) {
        permissionService.requireRoles(VIEWERS.toArray(new String[0]));
        Student student = requireStudent(studentId);
        SchoolSettings settings = schoolSettingsRepository.findAll().stream().findFirst().orElse(null);

        List<StudentEnrollment> enrollments = studentEnrollmentRepository.findByStudentId(studentId).stream()
                .sorted(Comparator.comparing(StudentEnrollment::getAcademicYear, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        List<String> knownYears = new ArrayList<>();
        for (StudentEnrollment e : enrollments) {
            if (e.getAcademicYear() != null && !knownYears.contains(e.getAcademicYear())) {
                knownYears.add(e.getAcademicYear());
            }
        }
        List<Mark> studentMarks = markRepository.findByStudentId(studentId);
        for (Mark m : studentMarks) {
            if (m.getAcademicYear() != null && !knownYears.contains(m.getAcademicYear())) {
                knownYears.add(m.getAcademicYear());
            }
        }
        Collections.sort(knownYears);

        Map<String, String> classLabelByYear = new LinkedHashMap<>();
        for (StudentEnrollment e : enrollments) {
            if (e.getAcademicYear() == null) continue;
            String label = (e.getClassNameSnapshot() != null && e.getSectionSnapshot() != null)
                    ? e.getClassNameSnapshot() + " - " + e.getSectionSnapshot()
                    : (e.getClassNameSnapshot() != null ? e.getClassNameSnapshot() : "-");
            classLabelByYear.put(e.getAcademicYear(), label);
        }

        List<Map<String, Object>> yearsBlock = new ArrayList<>();
        for (String year : knownYears) {
            List<Mark> yearMarks = studentMarks.stream()
                    .filter(m -> year.equals(m.getAcademicYear()))
                    .sorted(Comparator.comparing((Mark m) -> m.getExamId() != null ? m.getExamId() : 0L)
                            .thenComparing(Mark::getSubjectName, Comparator.nullsLast(Comparator.naturalOrder())))
                    .toList();

            Map<Long, List<Mark>> byExam = new LinkedHashMap<>();
            Map<Long, String> examNameByExamId = new LinkedHashMap<>();
            for (Mark mark : yearMarks) {
                Long key = mark.getExamId();
                byExam.computeIfAbsent(key, k -> new ArrayList<>()).add(mark);
                examNameByExamId.putIfAbsent(key, mark.getExamNameSnapshot() != null ? mark.getExamNameSnapshot() : "-");
            }

            List<Map<String, Object>> exams = new ArrayList<>();
            for (Map.Entry<Long, List<Mark>> entry : byExam.entrySet()) {
                List<Map<String, Object>> rows = new ArrayList<>();
                double totalObtained = 0;
                double totalMax = 0;
                for (Mark mark : entry.getValue()) {
                    double obtained = mark.getMarksObtained() != null ? mark.getMarksObtained() : 0;
                    double maximum = mark.getMaxMarks() != null ? mark.getMaxMarks() : (mark.getTotalMarks() != null ? mark.getTotalMarks() : 0);
                    totalObtained += obtained;
                    totalMax += maximum;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("subject", mark.getSubjectName() != null ? mark.getSubjectName() : (mark.getSubject() != null ? mark.getSubject() : "-"));
                    row.put("obtained", obtained);
                    row.put("max", maximum);
                    row.put("grade", mark.getGrade() != null ? mark.getGrade() : "-");
                    rows.add(row);
                }
                double percentage = totalMax > 0 ? (totalObtained / totalMax * 100) : 0;
                String overallGrade = totalMax > 0 ? gradeService.calculateGrade(totalObtained, totalMax) : "-";

                Map<String, Object> exam = new LinkedHashMap<>();
                exam.put("exam_name", examNameByExamId.get(entry.getKey()));
                exam.put("rows", rows);
                exam.put("total_obtained", totalObtained);
                exam.put("total_max", totalMax);
                exam.put("percentage", percentage);
                exam.put("overall_grade", overallGrade);
                exams.add(exam);
            }

            Map<String, Object> yearBlock = new LinkedHashMap<>();
            yearBlock.put("academic_year", year);
            yearBlock.put("class_label", classLabelByYear.getOrDefault(year, classLabel(student)));
            yearBlock.put("exams", exams);
            yearsBlock.add(yearBlock);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("school_name", settings != null ? settings.getSchoolName() : "School");
        data.put("student_name", studentName(student));
        data.put("admission_no", student.getAdmissionNo());
        data.put("dob", student.getDob() != null ? student.getDob().toString() : null);
        data.put("years", yearsBlock);

        byte[] pdf = pdfService.transcriptPdf(data);
        return pdfResponse(pdf, "transcript_" + idOrAdmission(student) + ".pdf");
    }

    @GetMapping("/{studentId}/id-card")
    public ResponseEntity<byte[]> idCard(@PathVariable Long studentId) {
        permissionService.requireRoles(VIEWERS.toArray(new String[0]));
        Student student = requireStudent(studentId);
        SchoolSettings settings = schoolSettingsRepository.findAll().stream().findFirst().orElse(null);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("school_name", settings != null ? settings.getSchoolName() : "School");
        data.put("logo_url", settings != null ? settings.getLogoUrl() : null);
        data.put("photo_url", student.getPhotoUrl());
        data.put("student_name", studentName(student));
        data.put("admission_no", student.getAdmissionNo());
        data.put("class_label", classLabel(student));
        data.put("dob", student.getDob() != null ? student.getDob().toString() : null);
        data.put("blood_group", student.getBloodGroup());
        data.put("guardian_name", student.getGuardianName());
        data.put("guardian_phone", student.getGuardianPhone());

        byte[] pdf = pdfService.studentIdCardPdf(data);
        return pdfResponse(pdf, "id_card_" + idOrAdmission(student) + ".pdf");
    }

    // ===================== helpers =====================

    private Student requireStudent(Long id) {
        return studentRepository.findById(id).orElseThrow(() -> ApiException.notFound("Student not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        if (!name.isEmpty()) return name;
        return student.getAdmissionNo() != null ? student.getAdmissionNo() : "-";
    }

    private String classLabel(Student student) {
        String label = student.getClassName() != null ? student.getClassName() : "";
        if (student.getSection() != null && !student.getSection().isBlank()) {
            label = label.isEmpty() ? student.getSection() : label + " - " + student.getSection();
        }
        return label.isEmpty() ? "-" : label;
    }

    private String idOrAdmission(Student student) {
        return student.getAdmissionNo() != null ? student.getAdmissionNo() : String.valueOf(student.getId());
    }

    private ResponseEntity<byte[]> pdfResponse(byte[] pdf, String filename) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=" + filename)
                .body(pdf);
    }
}
