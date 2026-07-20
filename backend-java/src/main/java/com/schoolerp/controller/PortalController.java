package com.schoolerp.controller;

import com.schoolerp.dto.portal.PortalLinkCreate;
import com.schoolerp.dto.portal.PortalUpiConfirmRequest;
import com.schoolerp.entity.*;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.FeeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/** Direct port of backend/app/routes/portal.py. */
@RestController
@RequestMapping("/portal")
public class PortalController {

    private static final List<String> PORTAL_ROLES = List.of("Parent", "Student", "Admin", "Principal");
    private static final List<String> ADMIN_ROLES = List.of("Admin", "Principal");
    private static final Set<String> ADMIN_ROLE_SET = Set.of("Admin", "Principal");

    private final ParentStudentLinkRepository linkRepository;
    private final StudentRepository studentRepository;
    private final UserRepository userRepository;
    private final AcademicYearRepository academicYearRepository;
    private final StudentEnrollmentRepository studentEnrollmentRepository;
    private final AttendanceRepository attendanceRepository;
    private final MarkRepository markRepository;
    private final FeeRepository feeRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final PermissionService permissionService;
    private final FeeService feeService;

    public PortalController(
            ParentStudentLinkRepository linkRepository,
            StudentRepository studentRepository,
            UserRepository userRepository,
            AcademicYearRepository academicYearRepository,
            StudentEnrollmentRepository studentEnrollmentRepository,
            AttendanceRepository attendanceRepository,
            MarkRepository markRepository,
            FeeRepository feeRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            PermissionService permissionService,
            FeeService feeService
    ) {
        this.linkRepository = linkRepository;
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
        this.academicYearRepository = academicYearRepository;
        this.studentEnrollmentRepository = studentEnrollmentRepository;
        this.attendanceRepository = attendanceRepository;
        this.markRepository = markRepository;
        this.feeRepository = feeRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.permissionService = permissionService;
        this.feeService = feeService;
    }

    // ---------------- Portal data endpoints ----------------

    @GetMapping("/children")
    public List<Map<String, Object>> listMyChildren() {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        List<Long> studentIds = linkRepository.findByUserId(user.getId()).stream().map(ParentStudentLink::getStudentId).toList();
        if (studentIds.isEmpty()) {
            return List.of();
        }
        return studentRepository.findAllById(studentIds).stream().map(this::serializeStudentCard).toList();
    }

    @GetMapping("/students/{studentId}/summary")
    public Map<String, Object> portalStudentSummary(@PathVariable Long studentId) {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        Student student = ensureStudentAccess(user, studentId);

        AcademicYear currentYear = academicYearRepository.findFirstByIsCurrentTrue().orElse(null);

        StudentEnrollment enrollment = null;
        if (currentYear != null) {
            enrollment = studentEnrollmentRepository.findByStudentId(studentId).stream()
                    .filter(e -> "Active".equals(e.getEnrollmentStatus()) && currentYear.getName().equals(e.getAcademicYear()))
                    .findFirst().orElse(null);
        }
        if (enrollment == null) {
            enrollment = studentEnrollmentRepository.findByStudentId(studentId).stream()
                    .filter(e -> "Active".equals(e.getEnrollmentStatus()))
                    .max(Comparator.comparing(StudentEnrollment::getAcademicYear, Comparator.nullsLast(Comparator.naturalOrder())))
                    .orElse(null);
        }

        Map<String, Object> currentEnrollment = null;
        if (enrollment != null) {
            currentEnrollment = new LinkedHashMap<>();
            currentEnrollment.put("academic_year", enrollment.getAcademicYear());
            currentEnrollment.put("class_name", enrollment.getClassNameSnapshot());
            currentEnrollment.put("section", enrollment.getSectionSnapshot());
            currentEnrollment.put("roll_no", enrollment.getRollNo());
        } else if (student.getClassName() != null || student.getSection() != null || student.getRollNo() != null) {
            currentEnrollment = new LinkedHashMap<>();
            currentEnrollment.put("academic_year", currentYear != null ? currentYear.getName() : null);
            currentEnrollment.put("class_name", student.getClassName());
            currentEnrollment.put("section", student.getSection());
            currentEnrollment.put("roll_no", student.getRollNo());
        }

        Map<String, Object> guardian = new LinkedHashMap<>();
        guardian.put("father_name", student.getFatherName());
        guardian.put("mother_name", student.getMotherName());
        guardian.put("guardian_name", student.getGuardianName());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("student", serializeStudentCard(student));
        body.put("guardian", guardian);
        body.put("current_academic_year", currentYear != null ? currentYear.getName() : null);
        body.put("current_enrollment", currentEnrollment);
        return body;
    }

    @GetMapping("/students/{studentId}/attendance")
    public Map<String, Object> portalStudentAttendance(
            @PathVariable Long studentId,
            @RequestParam(name = "academic_year", required = false) String academicYear
    ) {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        ensureStudentAccess(user, studentId);

        List<Attendance> records = attendanceRepository.findByStudentId(studentId).stream()
                .filter(a -> academicYear == null || academicYear.equals(a.getAcademicYear()))
                .sorted(Comparator.comparing(Attendance::getAttendanceDate, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();

        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("Present", 0);
        counts.put("Absent", 0);
        counts.put("Late", 0);
        counts.put("Half Day", 0);
        for (Attendance record : records) {
            if (counts.containsKey(record.getStatus())) {
                counts.put(record.getStatus(), counts.get(record.getStatus()) + 1);
            }
        }

        int total = records.size();
        double attended = counts.get("Present") + counts.get("Late") + counts.get("Half Day") * 0.5;
        Double percentage = total > 0 ? Math.round((attended / total) * 1000.0) / 10.0 : null;

        List<Map<String, Object>> recordRows = new ArrayList<>();
        for (Attendance record : records) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", record.getAttendanceDate());
            row.put("status", record.getStatus());
            row.put("academic_year", record.getAcademicYear());
            row.put("remarks", record.getRemarks());
            recordRows.add(row);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("total_days", total);
        body.put("counts", counts);
        body.put("attendance_percentage", percentage);
        body.put("records", recordRows);
        return body;
    }

    @GetMapping("/students/{studentId}/marks")
    public Map<String, Object> portalStudentMarks(
            @PathVariable Long studentId,
            @RequestParam(name = "academic_year", required = false) String academicYear
    ) {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        ensureStudentAccess(user, studentId);

        List<Mark> marks = markRepository.findByStudentId(studentId).stream()
                .filter(m -> academicYear == null || academicYear.equals(m.getAcademicYear()))
                .toList();

        Map<String, Map<String, Object>> exams = new LinkedHashMap<>();
        for (Mark mark : marks) {
            String examKey = mark.getExamNameSnapshot() != null ? mark.getExamNameSnapshot() : ("Exam #" + mark.getExamId());
            Map<String, Object> group = exams.computeIfAbsent(examKey, k -> {
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("exam_name", examKey);
                g.put("academic_year", mark.getAcademicYear());
                g.put("subjects", new ArrayList<Map<String, Object>>());
                g.put("total_obtained", 0.0);
                g.put("total_max", 0.0);
                return g;
            });

            double maxMarks = mark.getMaxMarks() != null ? mark.getMaxMarks() : (mark.getTotalMarks() != null ? mark.getTotalMarks() : 100);
            Map<String, Object> subject = new LinkedHashMap<>();
            subject.put("subject", mark.getSubjectName() != null ? mark.getSubjectName() : (mark.getSubject() != null ? mark.getSubject() : "-"));
            subject.put("marks_obtained", mark.getMarksObtained());
            subject.put("max_marks", maxMarks);
            subject.put("grade", mark.getGrade());

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> subjects = (List<Map<String, Object>>) group.get("subjects");
            subjects.add(subject);
            group.put("total_obtained", (double) group.get("total_obtained") + (mark.getMarksObtained() != null ? mark.getMarksObtained() : 0));
            group.put("total_max", (double) group.get("total_max") + maxMarks);
        }

        for (Map<String, Object> group : exams.values()) {
            double totalObtained = (double) group.get("total_obtained");
            double totalMax = (double) group.get("total_max");
            group.put("percentage", totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000.0) / 10.0 : null);
        }

        return Map.of("exams", new ArrayList<>(exams.values()));
    }

    @GetMapping("/students/{studentId}/fees")
    public Map<String, Object> portalStudentFees(
            @PathVariable Long studentId,
            @RequestParam(name = "academic_year", required = false) String academicYear
    ) {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        ensureStudentAccess(user, studentId);

        List<Fee> fees = feeRepository.findByStudentId(studentId).stream()
                .filter(f -> academicYear == null || academicYear.equals(f.getAcademicYear()))
                .toList();

        double totalAmount = fees.stream().mapToDouble(f -> f.getTotalAmount() != null ? f.getTotalAmount() : 0).sum();
        double totalPaid = fees.stream().mapToDouble(f -> f.getPaidAmount() != null ? f.getPaidAmount() : 0).sum();
        double totalDue = fees.stream().mapToDouble(f -> f.getDueAmount() != null ? f.getDueAmount() : 0).sum();

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("total_amount", totalAmount);
        totals.put("total_paid", totalPaid);
        totals.put("total_due", totalDue);

        List<Map<String, Object>> feeRows = new ArrayList<>();
        for (Fee fee : fees) {
            feeRows.add(feeSummary(fee));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("totals", totals);
        body.put("fees", feeRows);
        return body;
    }

    @GetMapping("/payment/config")
    public Map<String, Object> portalPaymentConfig() {
        permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        SchoolSettings settings = feeService.getOrCreateSettings();
        String upiId = settings.getUpiId() != null ? settings.getUpiId().strip() : "";

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", !upiId.isEmpty());
        body.put("upi_id", upiId);
        body.put("payee_name", settings.getSchoolName() != null ? settings.getSchoolName() : "School");
        body.put("currency", (settings.getCurrency() != null ? settings.getCurrency() : "INR").toUpperCase());
        return body;
    }

    @GetMapping("/students/{studentId}/fees/{feeId}/payment/upi")
    public Map<String, Object> portalUpiPaymentDetails(@PathVariable Long studentId, @PathVariable Long feeId) {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        ensureStudentAccess(user, studentId);

        SchoolSettings settings = feeService.getOrCreateSettings();
        String upiId = settings.getUpiId() != null ? settings.getUpiId().strip() : "";
        if (upiId.isEmpty()) {
            throw ApiException.badRequest("UPI payment is not configured. Please contact the school office.");
        }

        Fee fee = feeRepository.findById(feeId)
                .filter(f -> studentId.equals(f.getStudentId()))
                .orElseThrow(() -> ApiException.notFound("Fee record not found"));

        double balance = Math.max((fee.getTotalAmount() != null ? fee.getTotalAmount() : 0) - (fee.getPaidAmount() != null ? fee.getPaidAmount() : 0), 0);
        if (balance <= 0) {
            throw ApiException.badRequest("This fee has no outstanding balance.");
        }

        String payeeName = settings.getSchoolName() != null ? settings.getSchoolName() : "School";
        String note = ("Fee #" + fee.getId() + " " + (fee.getFeeType() != null ? fee.getFeeType() : "")).strip();
        String noteTrimmed = note.length() > 80 ? note.substring(0, 80) : note;

        String params = "pa=" + urlEncode(upiId)
                + "&pn=" + urlEncode(payeeName)
                + "&am=" + urlEncode(String.format("%.2f", balance))
                + "&cu=" + urlEncode("INR")
                + "&tn=" + urlEncode(noteTrimmed);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("upi_id", upiId);
        body.put("payee_name", payeeName);
        body.put("amount", Math.round(balance * 100.0) / 100.0);
        body.put("currency", "INR");
        body.put("note", noteTrimmed);
        body.put("uri", "upi://pay?" + params);
        return body;
    }

    @PostMapping("/students/{studentId}/fees/{feeId}/payment/upi/confirm")
    public Map<String, Object> portalConfirmUpiPayment(
            @PathVariable Long studentId, @PathVariable Long feeId, @RequestBody PortalUpiConfirmRequest payload
    ) {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        ensureStudentAccess(user, studentId);

        String reference = payload.getReference() != null ? payload.getReference().strip() : "";
        if (reference.isEmpty()) {
            throw ApiException.badRequest("Enter the UPI transaction reference (UTR) to confirm the payment.");
        }

        Fee fee = feeRepository.findById(feeId)
                .filter(f -> studentId.equals(f.getStudentId()))
                .orElseThrow(() -> ApiException.notFound("Fee record not found"));

        double balance = Math.max((fee.getTotalAmount() != null ? fee.getTotalAmount() : 0) - (fee.getPaidAmount() != null ? fee.getPaidAmount() : 0), 0);
        if (balance <= 0) {
            throw ApiException.badRequest("This fee has no outstanding balance.");
        }

        fee.setPaidAmount(fee.getTotalAmount());
        fee.setPaymentDate(LocalDate.now());
        double[] status = feeService.calculateFeeStatus(fee.getTotalAmount(), fee.getPaidAmount());
        fee.setDueAmount(status[0]);
        fee.setPaymentStatus(feeService.statusLabel(status[1]));
        if (fee.getReceiptNo() == null) {
            fee.setReceiptNo(feeService.generateReceiptNo());
        }

        String upiNote = "UPI Ref: " + reference;
        fee.setRemarks(fee.getRemarks() != null ? fee.getRemarks() + " | " + upiNote : upiNote);

        fee = feeRepository.save(fee);
        return feeSummary(fee);
    }

    @GetMapping("/students/{studentId}/enrollments")
    public List<Map<String, Object>> portalStudentEnrollments(@PathVariable Long studentId) {
        User user = permissionService.requireRoles(PORTAL_ROLES.toArray(new String[0]));
        ensureStudentAccess(user, studentId);

        return studentEnrollmentRepository.findByStudentId(studentId).stream()
                .sorted(Comparator.comparing(StudentEnrollment::getAcademicYear, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("academic_year", e.getAcademicYear());
                    row.put("class_name", e.getClassNameSnapshot());
                    row.put("section", e.getSectionSnapshot());
                    row.put("roll_no", e.getRollNo());
                    row.put("enrollment_status", e.getEnrollmentStatus());
                    row.put("promotion_status", e.getPromotionStatus());
                    row.put("start_date", e.getStartDate());
                    row.put("end_date", e.getEndDate());
                    return row;
                })
                .toList();
    }

    // ---------------- Admin: manage portal links ----------------

    @GetMapping("/links")
    public List<Map<String, Object>> listPortalLinks(
            @RequestParam(name = "user_id", required = false) Long userId,
            @RequestParam(name = "student_id", required = false) Long studentId
    ) {
        permissionService.requireRoles(ADMIN_ROLES.toArray(new String[0]));

        return linkRepository.findAll().stream()
                .filter(l -> userId == null || userId.equals(l.getUserId()))
                .filter(l -> studentId == null || studentId.equals(l.getStudentId()))
                .map(this::serializeLink)
                .toList();
    }

    @PostMapping("/links")
    public Map<String, Object> createPortalLink(@Valid @RequestBody PortalLinkCreate payload) {
        permissionService.requireRoles(ADMIN_ROLES.toArray(new String[0]));

        User user = userRepository.findById(payload.getUserId()).orElseThrow(() -> ApiException.notFound("User not found"));
        if (!"Parent".equals(user.getRole()) && !"Student".equals(user.getRole())) {
            throw ApiException.badRequest("Links can only be created for users with the Parent or Student role");
        }

        Student student = studentRepository.findById(payload.getStudentId()).orElseThrow(() -> ApiException.notFound("Student not found"));

        if (linkRepository.findByUserIdAndStudentId(payload.getUserId(), payload.getStudentId()).isPresent()) {
            throw ApiException.badRequest("This link already exists");
        }

        if ("Student".equals(user.getRole()) && linkRepository.countByUserId(payload.getUserId()) > 0) {
            throw ApiException.badRequest("A Student account can only be linked to one student record");
        }

        ParentStudentLink link = new ParentStudentLink();
        link.setUserId(payload.getUserId());
        link.setStudentId(payload.getStudentId());
        String relationship = payload.getRelationship();
        if (relationship == null || relationship.isBlank()) {
            relationship = "Student".equals(user.getRole()) ? "Self" : null;
        }
        link.setRelationship(relationship);
        link = linkRepository.save(link);

        return serializeLink(link);
    }

    @DeleteMapping("/links/{linkId}")
    public Map<String, String> deletePortalLink(@PathVariable Long linkId) {
        permissionService.requireRoles(ADMIN_ROLES.toArray(new String[0]));
        ParentStudentLink link = linkRepository.findById(linkId).orElseThrow(() -> ApiException.notFound("Link not found"));
        linkRepository.delete(link);
        return Map.of("message", "Portal link removed");
    }

    // ===================== helpers =====================

    private Student ensureStudentAccess(User user, Long studentId) {
        Student student = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found"));
        if (ADMIN_ROLE_SET.contains(user.getRole())) {
            return student;
        }
        linkRepository.findByUserIdAndStudentId(user.getId(), studentId)
                .orElseThrow(() -> ApiException.forbidden("You do not have access to this student"));
        return student;
    }

    /** Matches Python's urllib.parse.quote (RFC 3986, %20 for spaces) rather than
     * URLEncoder's application/x-www-form-urlencoded style (+ for spaces). */
    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private Map<String, Object> serializeStudentCard(Student student) {
        String fullName = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).strip();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", student.getId());
        body.put("admission_no", student.getAdmissionNo());
        body.put("first_name", student.getFirstName());
        body.put("last_name", student.getLastName());
        body.put("full_name", fullName);
        body.put("class_name", student.getClassName());
        body.put("section", student.getSection());
        body.put("roll_no", student.getRollNo());
        body.put("photo_url", student.getPhotoUrl());
        body.put("student_status", student.getStudentStatus());
        body.put("house", student.getHouse());
        return body;
    }

    private Map<String, Object> serializeLink(ParentStudentLink link) {
        User user = userRepository.findById(link.getUserId()).orElse(null);
        Student student = studentRepository.findById(link.getStudentId()).orElse(null);
        String studentName = student != null
                ? ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                    + (student.getLastName() != null ? student.getLastName() : "")).strip()
                : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", link.getId());
        body.put("user_id", link.getUserId());
        body.put("student_id", link.getStudentId());
        body.put("relationship", link.getRelationship());
        body.put("user_name", user != null ? user.getName() : null);
        body.put("user_email", user != null ? user.getEmail() : null);
        body.put("user_role", user != null ? user.getRole() : null);
        body.put("student_name", studentName);
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        return body;
    }

    private Map<String, Object> feeSummary(Fee fee) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", fee.getId());
        body.put("fee_type", fee.getFeeType());
        body.put("academic_year", fee.getAcademicYear());
        body.put("total_amount", fee.getTotalAmount());
        body.put("paid_amount", fee.getPaidAmount());
        body.put("due_amount", fee.getDueAmount());
        body.put("payment_status", fee.getPaymentStatus());
        body.put("payment_date", fee.getPaymentDate());
        body.put("receipt_no", fee.getReceiptNo());
        body.put("remarks", fee.getRemarks());
        return body;
    }
}
