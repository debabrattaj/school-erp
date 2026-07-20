package com.schoolerp.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.schoolerp.entity.*;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import com.schoolerp.security.PermissionService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Direct port of backend/app/routes/dashboard.py's /summary, /trends,
 * /report/catalog, /report, and /layout endpoints. The custom-report engine's
 * REPORTS catalog is ported only for the modules already available (students,
 * fees, attendance, marks, teachers) - hostel/transport/library sources are
 * omitted until those route modules are ported.
 */
@RestController
@RequestMapping("/dashboard")
public class DashboardController {

    private static final Set<String> CURRENCY_MEASURES = Set.of("total_amount", "paid_amount", "due_amount", "fine_amount");
    private static final String[] MONTH_LABELS = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

    private final StudentRepository studentRepository;
    private final TeacherRepository teacherRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final FeeRepository feeRepository;
    private final AttendanceRepository attendanceRepository;
    private final ExamRepository examRepository;
    private final MarkRepository markRepository;
    private final DashboardLayoutRepository dashboardLayoutRepository;
    private final PermissionService permissionService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, ReportSource> reportSources;

    public DashboardController(
            StudentRepository studentRepository,
            TeacherRepository teacherRepository,
            SchoolClassRepository schoolClassRepository,
            FeeRepository feeRepository,
            AttendanceRepository attendanceRepository,
            ExamRepository examRepository,
            MarkRepository markRepository,
            DashboardLayoutRepository dashboardLayoutRepository,
            PermissionService permissionService
    ) {
        this.studentRepository = studentRepository;
        this.teacherRepository = teacherRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.feeRepository = feeRepository;
        this.attendanceRepository = attendanceRepository;
        this.examRepository = examRepository;
        this.markRepository = markRepository;
        this.dashboardLayoutRepository = dashboardLayoutRepository;
        this.permissionService = permissionService;
        this.reportSources = buildReportSources();
    }

    @GetMapping("/summary")
    public Map<String, Object> dashboardSummary() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");

        LocalDate today = LocalDate.now();
        LocalDate next30Days = today.plusDays(30);

        List<Student> students = studentRepository.findAll();
        long totalStudents = students.size();
        long activeStudents = students.stream().filter(s -> "Active".equals(s.getStudentStatus())).count();
        long internationalStudents = students.stream()
                .filter(s -> s.getNationality() != null && !s.getNationality().isBlank())
                .filter(s -> !s.getNationality().equalsIgnoreCase("indian") && !s.getNationality().equalsIgnoreCase("india"))
                .count();
        long transportUsers = students.stream()
                .filter(s -> s.getTransportRoute() != null && !s.getTransportRoute().isBlank())
                .count();

        long totalTeachers = teacherRepository.count();
        long totalClasses = schoolClassRepository.count();

        List<Fee> fees = feeRepository.findAll();
        double totalCollection = fees.stream().mapToDouble(f -> f.getPaidAmount() != null ? f.getPaidAmount() : 0).sum();
        double totalDue = fees.stream().mapToDouble(f -> f.getDueAmount() != null ? f.getDueAmount() : 0).sum();
        double totalFeeAmount = fees.stream().mapToDouble(f -> f.getTotalAmount() != null ? f.getTotalAmount() : 0).sum();
        double collectionPercentage = totalFeeAmount != 0 ? round2(totalCollection / totalFeeAmount * 100) : 0;

        List<Attendance> todayAttendance = attendanceRepository.findByAttendanceDate(today);
        long todayAttendanceTotal = todayAttendance.size();
        long todayPresent = todayAttendance.stream().filter(a -> "Present".equals(a.getStatus())).count();
        long todayAbsent = todayAttendance.stream().filter(a -> "Absent".equals(a.getStatus())).count();
        long todayLate = todayAttendance.stream().filter(a -> "Late".equals(a.getStatus())).count();
        long todayExcused = todayAttendance.stream().filter(a -> "Excused".equals(a.getStatus())).count();
        double attendancePercentage = todayAttendanceTotal != 0 ? round2((double) todayPresent / todayAttendanceTotal * 100) : 0;

        List<Map<String, Object>> upcomingExams = examRepository.findAll().stream()
                .filter(e -> e.getExamDate() != null && !e.getExamDate().isBefore(today) && !e.getExamDate().isAfter(next30Days))
                .sorted(Comparator.comparing(Exam::getExamDate))
                .limit(10)
                .map(exam -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", exam.getId());
                    m.put("exam_name", exam.getExamName());
                    m.put("class_name", exam.getClassName());
                    m.put("section", exam.getSection());
                    m.put("exam_date", exam.getExamDate());
                    m.put("academic_year", exam.getAcademicYear());
                    return m;
                })
                .toList();

        List<Map<String, Object>> recentAdmissions = students.stream()
                .sorted(Comparator.comparing(Student::getId).reversed())
                .limit(10)
                .map(student -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", student.getId());
                    m.put("admission_no", student.getAdmissionNo());
                    String name = (nullToEmpty(student.getFirstName()) + " " + nullToEmpty(student.getLastName())).trim();
                    m.put("student_name", name);
                    m.put("class_name", student.getClassName());
                    m.put("section", student.getSection());
                    m.put("house", student.getHouse());
                    m.put("admission_date", student.getAdmissionDate());
                    return m;
                })
                .toList();

        List<Map<String, Object>> feeDefaulters = fees.stream()
                .filter(f -> f.getDueAmount() != null && f.getDueAmount() > 0)
                .sorted(Comparator.comparing(Fee::getDueAmount).reversed())
                .limit(10)
                .map(fee -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", fee.getId());
                    m.put("student_id", fee.getStudentId());
                    m.put("fee_type", fee.getFeeType());
                    m.put("due_amount", fee.getDueAmount());
                    m.put("payment_status", fee.getPaymentStatus());
                    return m;
                })
                .toList();

        List<Map<String, Object>> topPerformers = markRepository.findAll().stream()
                .sorted(Comparator.comparing(Mark::getMarksObtained, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(10)
                .map(mark -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", mark.getId());
                    m.put("student_id", mark.getStudentId());
                    m.put("exam_id", mark.getExamId());
                    m.put("subject", mark.getSubject());
                    m.put("marks_obtained", mark.getMarksObtained());
                    m.put("total_marks", mark.getTotalMarks());
                    m.put("grade", mark.getGrade());
                    return m;
                })
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("total_students", totalStudents);
        body.put("active_students", activeStudents);
        body.put("international_students", internationalStudents);
        body.put("transport_users", transportUsers);
        body.put("total_teachers", totalTeachers);
        body.put("total_classes", totalClasses);
        body.put("total_collection", totalCollection);
        body.put("total_due", totalDue);
        body.put("collection_percentage", collectionPercentage);
        body.put("attendance_percentage", attendancePercentage);
        body.put("today_present", todayPresent);
        body.put("today_absent", todayAbsent);
        body.put("today_late", todayLate);
        body.put("today_excused", todayExcused);
        body.put("upcoming_exams", upcomingExams);
        body.put("recent_admissions", recentAdmissions);
        body.put("fee_defaulters", feeDefaulters);
        body.put("top_performers", topPerformers);
        return body;
    }

    @GetMapping("/trends")
    public Map<String, Object> dashboardTrends(@RequestParam(required = false, defaultValue = "14") int days) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");

        int clampedDays = Math.max(7, Math.min(days, 60));
        LocalDate today = LocalDate.now();

        List<Attendance> allAttendance = attendanceRepository.findAll();
        LocalDate latest = allAttendance.stream()
                .map(Attendance::getAttendanceDate)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
        LocalDate anchor = (latest != null && latest.isBefore(today)) ? latest : today;
        LocalDate start = anchor.minusDays(clampedDays - 1L);

        Map<LocalDate, double[]> perDay = new HashMap<>(); // [present, total]
        for (Attendance a : allAttendance) {
            LocalDate d = a.getAttendanceDate();
            if (d == null || d.isBefore(start) || d.isAfter(anchor)) continue;
            double[] bucket = perDay.computeIfAbsent(d, k -> new double[2]);
            bucket[1] += 1;
            if ("Present".equals(a.getStatus()) || "Late".equals(a.getStatus())) {
                bucket[0] += 1;
            } else if ("Half Day".equals(a.getStatus())) {
                bucket[0] += 0.5;
            }
        }

        List<Map<String, Object>> attendanceTrend = new ArrayList<>();
        for (int i = 0; i < clampedDays; i++) {
            LocalDate day = start.plusDays(i);
            double[] bucket = perDay.get(day);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("date", day.toString());
            entry.put("percentage", (bucket != null && bucket[1] > 0) ? round1(bucket[0] / bucket[1] * 100) : null);
            entry.put("total", bucket != null ? (int) bucket[1] : 0);
            attendanceTrend.add(entry);
        }

        List<YearMonth> months = new ArrayList<>();
        YearMonth cursor = YearMonth.from(today);
        for (int i = 0; i < 6; i++) {
            months.add(cursor);
            cursor = cursor.minusMonths(1);
        }
        Collections.reverse(months);

        Map<String, Long> counts = studentRepository.findAll().stream()
                .map(Student::getAdmissionDate)
                .filter(Objects::nonNull)
                .filter(d -> !d.isBefore(months.get(0).atDay(1)))
                .collect(Collectors.groupingBy(d -> YearMonth.from(d).toString(), Collectors.counting()));

        List<Map<String, Object>> admissionsTrend = months.stream().map(m -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("month", MONTH_LABELS[m.getMonthValue() - 1]);
            entry.put("label", MONTH_LABELS[m.getMonthValue() - 1] + " " + m.getYear());
            entry.put("count", counts.getOrDefault(m.toString(), 0L));
            return entry;
        }).toList();

        return Map.of("attendance_trend", attendanceTrend, "admissions_trend", admissionsTrend);
    }

    @GetMapping("/report/catalog")
    public Map<String, Object> reportCatalog() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        Map<String, Object> catalog = new LinkedHashMap<>();
        for (ReportSource source : reportSources.values()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("label", source.label);
            entry.put("dimensions", source.dimensionLabels());
            entry.put("measures", source.measureLabels());
            entry.put("has_date", source.dateExtractor != null);
            catalog.put(source.key, entry);
        }
        return catalog;
    }

    @GetMapping("/report")
    public Map<String, Object> dashboardReport(
            @RequestParam String source,
            @RequestParam(name = "group_by") String groupBy,
            @RequestParam(required = false, defaultValue = "count") String measure,
            @RequestParam(name = "academic_year", required = false) String academicYear,
            @RequestParam(required = false) String status,
            @RequestParam(name = "date_from", required = false) String dateFrom,
            @RequestParam(name = "date_to", required = false) String dateTo,
            @RequestParam(required = false, defaultValue = "20") int limit
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");

        ReportSource cfg = reportSources.get(source);
        if (cfg == null) {
            throw ApiException.badRequest("Unknown report source");
        }
        Dimension dim = cfg.dimension(groupBy);
        if (dim == null) {
            throw ApiException.badRequest("Unknown dimension for this source");
        }
        Measure meas = cfg.measure(measure);
        if (meas == null) {
            throw ApiException.badRequest("Unknown measure for this source");
        }

        List<Object> records = cfg.loader.get();

        if (academicYear != null && cfg.academicYearExtractor != null) {
            records = records.stream().filter(r -> academicYear.equals(cfg.academicYearExtractor.apply(r))).toList();
        }
        if (status != null && cfg.statusExtractor != null) {
            records = records.stream().filter(r -> status.equals(cfg.statusExtractor.apply(r))).toList();
        }
        LocalDate from = dateFrom != null ? LocalDate.parse(dateFrom) : null;
        LocalDate to = dateTo != null ? LocalDate.parse(dateTo) : null;
        if (cfg.dateExtractor != null && (from != null || to != null)) {
            final LocalDate finalFrom = from;
            final LocalDate finalTo = to;
            records = records.stream().filter(r -> {
                LocalDate d = cfg.dateExtractor.apply(r);
                if (d == null) return false;
                if (finalFrom != null && d.isBefore(finalFrom)) return false;
                return finalTo == null || !d.isAfter(finalTo);
            }).toList();
        }

        Map<String, Double> grouped = new LinkedHashMap<>();
        for (Object record : records) {
            String label = dim.extractor.apply(record);
            String key = (label == null || label.isBlank()) ? "Unspecified" : label;
            double value = meas.isCount ? 1.0 : meas.valueExtractor.apply(record);
            grouped.merge(key, value, Double::sum);
        }

        List<Map.Entry<String, Double>> sorted = grouped.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
                .limit(Math.max(1, Math.min(limit, 50)))
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("labels", sorted.stream().map(Map.Entry::getKey).toList());
        body.put("values", sorted.stream().map(e -> round2(e.getValue())).toList());
        body.put("measure_label", meas.label);
        body.put("dimension_label", dim.label);
        body.put("source_label", cfg.label);
        body.put("is_currency", CURRENCY_MEASURES.contains(measure));
        return body;
    }

    @GetMapping("/layout")
    public Map<String, Object> getDashboardLayout() {
        User currentUser = permissionService.getCurrentUser();
        Optional<DashboardLayout> row = dashboardLayoutRepository.findByUserId(currentUser.getId());
        if (row.isEmpty() || row.get().getWidgets() == null) {
            return Collections.singletonMap("widgets", null);
        }
        try {
            Object widgets = objectMapper.readValue(row.get().getWidgets(), new TypeReference<Object>() {});
            return Collections.singletonMap("widgets", widgets);
        } catch (Exception e) {
            return Collections.singletonMap("widgets", null);
        }
    }

    @PutMapping("/layout")
    public Map<String, Boolean> saveDashboardLayout(@RequestBody Map<String, Object> payload) {
        User currentUser = permissionService.getCurrentUser();
        String json;
        try {
            json = objectMapper.writeValueAsString(payload.get("widgets"));
        } catch (Exception e) {
            throw ApiException.badRequest("Invalid widgets payload");
        }

        DashboardLayout row = dashboardLayoutRepository.findByUserId(currentUser.getId()).orElseGet(() -> {
            DashboardLayout created = new DashboardLayout();
            created.setUserId(currentUser.getId());
            return created;
        });
        row.setWidgets(json);
        dashboardLayoutRepository.save(row);
        return Map.of("ok", true);
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private Double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    // ===================== Report engine config =====================
    // Whitelisted aggregation sources for the custom dashboard widget builder,
    // direct port of dashboard.py's REPORTS dict. hostel/transport/library
    // sources are omitted until those route modules are ported.

    private record Dimension(String label, Function<Object, String> extractor) {}
    private record Measure(String label, boolean isCount, Function<Object, Double> valueExtractor) {}

    private static final class ReportSource {
        final String key;
        final String label;
        final java.util.function.Supplier<List<Object>> loader;
        final Function<Object, LocalDate> dateExtractor;
        final Map<String, Dimension> dimensions;
        final Map<String, Measure> measures;
        final Function<Object, String> academicYearExtractor;
        final Function<Object, String> statusExtractor;

        ReportSource(String key, String label, java.util.function.Supplier<List<Object>> loader,
                     Function<Object, LocalDate> dateExtractor, Map<String, Dimension> dimensions,
                     Map<String, Measure> measures, Function<Object, String> academicYearExtractor,
                     Function<Object, String> statusExtractor) {
            this.key = key;
            this.label = label;
            this.loader = loader;
            this.dateExtractor = dateExtractor;
            this.dimensions = dimensions;
            this.measures = measures;
            this.academicYearExtractor = academicYearExtractor;
            this.statusExtractor = statusExtractor;
        }

        Dimension dimension(String key) { return dimensions.get(key); }
        Measure measure(String key) { return measures.get(key); }
        Map<String, String> dimensionLabels() {
            Map<String, String> out = new LinkedHashMap<>();
            dimensions.forEach((k, v) -> out.put(k, v.label));
            return out;
        }
        Map<String, String> measureLabels() {
            Map<String, String> out = new LinkedHashMap<>();
            measures.forEach((k, v) -> out.put(k, v.label));
            return out;
        }
    }

    private Map<String, ReportSource> buildReportSources() {
        Map<String, ReportSource> sources = new LinkedHashMap<>();

        sources.put("students", new ReportSource("students", "Students",
                () -> new ArrayList<>(studentRepository.findAll()), null,
                Map.of(
                        "class_name", new Dimension("Class", r -> ((Student) r).getClassName()),
                        "section", new Dimension("Section", r -> ((Student) r).getSection()),
                        "gender", new Dimension("Gender", r -> ((Student) r).getGender()),
                        "house", new Dimension("House", r -> ((Student) r).getHouse()),
                        "nationality", new Dimension("Nationality", r -> ((Student) r).getNationality()),
                        "student_status", new Dimension("Status", r -> ((Student) r).getStudentStatus()),
                        "residential_type", new Dimension("Residential Type", r -> ((Student) r).getResidentialType()),
                        "blood_group", new Dimension("Blood Group", r -> ((Student) r).getBloodGroup())
                ),
                Map.of("count", new Measure("Students", true, null)),
                null, r -> ((Student) r).getStudentStatus()));

        sources.put("fees", new ReportSource("fees", "Fees",
                () -> new ArrayList<>(feeRepository.findAll()), r -> ((Fee) r).getPaymentDate(),
                Map.of(
                        "fee_type", new Dimension("Fee Type", r -> ((Fee) r).getFeeType()),
                        "payment_status", new Dimension("Payment Status", r -> ((Fee) r).getPaymentStatus()),
                        "academic_year", new Dimension("Academic Year", r -> ((Fee) r).getAcademicYear()),
                        "class_name_snapshot", new Dimension("Class", r -> ((Fee) r).getClassNameSnapshot())
                ),
                Map.of(
                        "count", new Measure("Fee Records", true, null),
                        "total_amount", new Measure("Billed", false, r -> ((Fee) r).getTotalAmount()),
                        "paid_amount", new Measure("Collected", false, r -> ((Fee) r).getPaidAmount()),
                        "due_amount", new Measure("Outstanding", false, r -> ((Fee) r).getDueAmount())
                ),
                r -> ((Fee) r).getAcademicYear(), r -> ((Fee) r).getPaymentStatus()));

        sources.put("attendance", new ReportSource("attendance", "Attendance",
                () -> new ArrayList<>(attendanceRepository.findAll()), r -> ((Attendance) r).getAttendanceDate(),
                Map.of(
                        "status", new Dimension("Status", r -> ((Attendance) r).getStatus()),
                        "class_name_snapshot", new Dimension("Class", r -> ((Attendance) r).getClassNameSnapshot()),
                        "academic_year", new Dimension("Academic Year", r -> ((Attendance) r).getAcademicYear())
                ),
                Map.of("count", new Measure("Records", true, null)),
                r -> ((Attendance) r).getAcademicYear(), r -> ((Attendance) r).getStatus()));

        sources.put("marks", new ReportSource("marks", "Marks",
                () -> new ArrayList<>(markRepository.findAll()), null,
                Map.of(
                        "grade", new Dimension("Grade", r -> ((Mark) r).getGrade()),
                        "subject", new Dimension("Subject", r -> ((Mark) r).getSubject()),
                        "academic_year", new Dimension("Academic Year", r -> ((Mark) r).getAcademicYear()),
                        "exam_name_snapshot", new Dimension("Exam", r -> ((Mark) r).getExamNameSnapshot())
                ),
                Map.of(
                        "count", new Measure("Mark Entries", true, null),
                        "marks_obtained", new Measure("Total Marks", false, r -> ((Mark) r).getMarksObtained())
                ),
                r -> ((Mark) r).getAcademicYear(), null));

        sources.put("teachers", new ReportSource("teachers", "Teachers",
                () -> new ArrayList<>(teacherRepository.findAll()), null,
                Map.of(
                        "department", new Dimension("Department", r -> ((Teacher) r).getDepartment()),
                        "subject", new Dimension("Subject", r -> ((Teacher) r).getSubject()),
                        "gender", new Dimension("Gender", r -> ((Teacher) r).getGender()),
                        "employment_type", new Dimension("Employment Type", r -> ((Teacher) r).getEmploymentType()),
                        "salary_grade", new Dimension("Salary Grade", r -> ((Teacher) r).getSalaryGrade()),
                        "assigned_class", new Dimension("Assigned Class", r -> ((Teacher) r).getAssignedClass())
                ),
                Map.of("count", new Measure("Teachers", true, null)),
                null, null));

        return sources;
    }
}
