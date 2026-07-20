package com.schoolerp.controller;

import com.schoolerp.dto.chatbot.ChatRequest;
import com.schoolerp.entity.*;
import com.schoolerp.repository.*;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.AnthropicChatService;
import com.schoolerp.service.NotificationService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.*;
import java.util.function.BiFunction;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Direct port of backend/app/routes/chatbot.py. */
@RestController
@RequestMapping("/chatbot")
public class ChatbotController {

    private static final List<String> ALL_ROLES = List.of("Admin", "Principal", "Accounts", "Teacher", "Parent", "Student");
    private static final Set<String> STAFF_ROLES = Set.of("Admin", "Principal", "Accounts", "Teacher");

    private record Intent(String name, Set<String> words, List<String> phrases) {
    }

    private static final List<Intent> INTENTS = List.of(
            new Intent("greeting", Set.of("hello", "hi", "hii", "hey", "namaste"),
                    List.of("good morning", "good afternoon", "good evening")),
            new Intent("help", Set.of("help", "options", "menu"), List.of("what can you")),
            new Intent("school", Set.of("phone", "address", "principal", "email", "website"),
                    List.of("school name", "school contact", "contact details", "contact number")),
            new Intent("year", Set.of("session"), List.of("academic year", "current year", "which year")),
            new Intent("timetable", Set.of("timetable", "periods", "schedule"), List.of("time table", "period today")),
            new Intent("exams_upcoming", Set.of("datesheet", "upcoming"),
                    List.of("next exam", "exam date", "exam schedule", "when is the exam", "date sheet")),
            new Intent("class_teacher", Set.of("teacher"), List.of("class teacher", "who teaches")),
            new Intent("transport", Set.of("bus", "transport", "route", "pickup"), List.of("bus route", "pickup point")),
            new Intent("library", Set.of("library", "book", "books", "borrowed"), List.of("books issued", "library books")),
            new Intent("attendance", Set.of("attendance", "present", "absent", "leave", "late"), List.of()),
            new Intent("fees", Set.of("fee", "fees", "due", "dues", "pending", "payment", "balance", "paid", "receipt"), List.of()),
            new Intent("marks", Set.of("mark", "marks", "result", "results", "grade", "exam", "score", "percentage"), List.of("report card")),
            new Intent("summary", Set.of("class", "section", "roll", "profile", "detail", "details"), List.of("which class")),
            new Intent("history", Set.of("history", "promotion", "promoted"), List.of("previous year", "previous years", "last year"))
    );

    private static final List<String> INTENT_LABELS = INTENTS.stream().map(Intent::name).toList();

    private static final List<String> ALL_KEYWORDS = INTENTS.stream()
            .flatMap(i -> i.words().stream())
            .distinct()
            .sorted()
            .toList();

    private static final String HELP_TEXT = """
            I can help you with:
            • Attendance — "What is the attendance?" (also "this month" / "this week")
            • Fees — "How much fee is pending?"
            • Marks — "Show exam results"
            • Upcoming exams — "When is the next exam?"
            • Timetable — "What is the timetable today?"
            • Class details — "Which class and section?"
            • Class teacher — "Who is the class teacher?"
            • Transport — "Which bus route?"
            • Library — "Which books are issued?"
            • Academic history — "Show previous years"
            • School info — "School contact details\"""";

    private static final List<String> QUICK_SUGGESTIONS = List.of("Attendance", "Fees pending", "Exam results", "Class details", "Help");
    private static final List<String> STUDENT_SUGGESTIONS = List.of("Attendance", "Fees pending", "Exam results", "Timetable", "Next exam");

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[a-z]+");
    private static final Pattern ADMISSION_PATTERN = Pattern.compile("[a-z]{2,4}\\d{4,}");

    private final StudentRepository studentRepository;
    private final AttendanceRepository attendanceRepository;
    private final FeeRepository feeRepository;
    private final MarkRepository markRepository;
    private final StudentEnrollmentRepository studentEnrollmentRepository;
    private final TimetableEntryRepository timetableEntryRepository;
    private final ExamRepository examRepository;
    private final LibraryIssueRepository libraryIssueRepository;
    private final LibraryBookRepository libraryBookRepository;
    private final AcademicYearRepository academicYearRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final ParentStudentLinkRepository linkRepository;
    private final NotificationService notificationService;
    private final AnthropicChatService anthropicChatService;
    private final PermissionService permissionService;

    public ChatbotController(
            StudentRepository studentRepository,
            AttendanceRepository attendanceRepository,
            FeeRepository feeRepository,
            MarkRepository markRepository,
            StudentEnrollmentRepository studentEnrollmentRepository,
            TimetableEntryRepository timetableEntryRepository,
            ExamRepository examRepository,
            LibraryIssueRepository libraryIssueRepository,
            LibraryBookRepository libraryBookRepository,
            AcademicYearRepository academicYearRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            ParentStudentLinkRepository linkRepository,
            NotificationService notificationService,
            AnthropicChatService anthropicChatService,
            PermissionService permissionService
    ) {
        this.studentRepository = studentRepository;
        this.attendanceRepository = attendanceRepository;
        this.feeRepository = feeRepository;
        this.markRepository = markRepository;
        this.studentEnrollmentRepository = studentEnrollmentRepository;
        this.timetableEntryRepository = timetableEntryRepository;
        this.examRepository = examRepository;
        this.libraryIssueRepository = libraryIssueRepository;
        this.libraryBookRepository = libraryBookRepository;
        this.academicYearRepository = academicYearRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.linkRepository = linkRepository;
        this.notificationService = notificationService;
        this.anthropicChatService = anthropicChatService;
        this.permissionService = permissionService;
    }

    @PostMapping("/ask")
    public Map<String, Object> ask(@RequestBody ChatRequest payload) {
        User currentUser = permissionService.requireRoles(ALL_ROLES.toArray(new String[0]));

        String message = payload.getMessage() != null ? payload.getMessage().strip() : "";
        if (message.isEmpty()) {
            return reply(HELP_TEXT, QUICK_SUGGESTIONS);
        }

        String intent = detectIntent(message);

        String llmReply = null;
        if (intent == null) {
            AnthropicChatService.ClassificationResult result = anthropicChatService.classifyOrReply(message, INTENT_LABELS);
            intent = result.intent();
            llmReply = result.reply();
        }

        if ("greeting".equals(intent)) {
            String firstName = currentUser.getName() != null ? currentUser.getName().split("\\s+")[0] : "";
            return reply("Hello " + firstName + "! How can I help you today?", QUICK_SUGGESTIONS);
        }

        if ("help".equals(intent) || intent == null) {
            return reply(llmReply != null ? llmReply : HELP_TEXT, QUICK_SUGGESTIONS);
        }

        if ("year".equals(intent)) {
            return reply(answerYear(), QUICK_SUGGESTIONS);
        }

        if ("school".equals(intent)) {
            return reply(answerSchool(), QUICK_SUGGESTIONS);
        }

        Object[] resolved = resolveStudent(currentUser, payload);
        Student student = (Student) resolved[0];
        @SuppressWarnings("unchecked")
        Map<String, Object> clarification = (Map<String, Object>) resolved[1];
        if (clarification != null) {
            return clarification;
        }

        String answer = STUDENT_HANDLERS.get(intent).apply(this, new Object[]{student, message}) instanceof String s ? s : "";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reply", answer);
        body.put("student_id", student.getId());
        body.put("student_name", studentLabel(student));
        body.put("suggestions", STUDENT_SUGGESTIONS);
        return body;
    }

    // ===================== intent matching =====================

    private List<String> tokenize(String message) {
        Matcher m = TOKEN_PATTERN.matcher(message.toLowerCase());
        List<String> tokens = new ArrayList<>();
        while (m.find()) {
            tokens.add(m.group());
        }
        return tokens;
    }

    private String detectIntent(String message) {
        String text = message.toLowerCase();
        List<String> tokens = tokenize(message);

        Set<String> corrected = new HashSet<>(tokens);
        for (String token : tokens) {
            if (token.length() >= 4 && !ALL_KEYWORDS.contains(token)) {
                String close = closestMatch(token, ALL_KEYWORDS, 0.8);
                if (close != null) {
                    corrected.add(close);
                }
            }
        }

        String bestIntent = null;
        int bestScore = 0;
        for (Intent intent : INTENTS) {
            int score = 0;
            for (String phrase : intent.phrases()) {
                if (text.contains(phrase)) score += 2;
            }
            for (String word : intent.words()) {
                if (corrected.contains(word)) score += 1;
            }
            if (score > bestScore) {
                bestIntent = intent.name();
                bestScore = score;
            }
        }
        return bestIntent;
    }

    /** Approximates Python's difflib.get_close_matches (ratio-based similarity). */
    private String closestMatch(String token, List<String> candidates, double cutoff) {
        String best = null;
        double bestRatio = 0;
        for (String candidate : candidates) {
            double ratio = similarityRatio(token, candidate);
            if (ratio >= cutoff && ratio > bestRatio) {
                best = candidate;
                bestRatio = ratio;
            }
        }
        return best;
    }

    private double similarityRatio(String a, String b) {
        int[][] dp = new int[a.length() + 1][b.length() + 1];
        for (int i = 1; i <= a.length(); i++) {
            for (int j = 1; j <= b.length(); j++) {
                dp[i][j] = a.charAt(i - 1) == b.charAt(j - 1) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
        int lcs = dp[a.length()][b.length()];
        int total = a.length() + b.length();
        return total == 0 ? 1.0 : (2.0 * lcs) / total;
    }

    // ===================== student resolution =====================

    private List<Long> getLinkedStudentIds(Long userId) {
        return linkRepository.findByUserId(userId).stream().map(ParentStudentLink::getStudentId).toList();
    }

    private Student findStudentByText(String message, List<Long> allowedIds) {
        String text = message.toLowerCase();
        Set<String> tokens = new HashSet<>(tokenize(message));

        List<Student> pool;
        if (allowedIds != null) {
            if (allowedIds.isEmpty()) {
                return null;
            }
            pool = studentRepository.findAllById(allowedIds);
        } else {
            pool = studentRepository.findAll();
        }

        Matcher admMatcher = ADMISSION_PATTERN.matcher(text);
        if (admMatcher.find()) {
            String adm = admMatcher.group();
            Optional<Student> match = pool.stream()
                    .filter(s -> s.getAdmissionNo() != null && s.getAdmissionNo().toLowerCase().contains(adm))
                    .findFirst();
            if (match.isPresent()) {
                return match.get();
            }
        }

        List<Student> candidates = pool.stream().limit(500).toList();
        for (Student student : candidates) {
            String first = student.getFirstName() != null ? student.getFirstName().toLowerCase() : "";
            String last = student.getLastName() != null ? student.getLastName().toLowerCase() : "";
            if (!first.isEmpty() && !last.isEmpty() && text.contains(first + " " + last)) {
                return student;
            }
        }
        for (Student student : candidates) {
            String first = student.getFirstName() != null ? student.getFirstName().toLowerCase() : "";
            if (!first.isEmpty() && tokens.contains(first)) {
                return student;
            }
        }
        return null;
    }

    /** Returns {Student student, Map<String,Object> clarification} - exactly one is non-null. */
    private Object[] resolveStudent(User user, ChatRequest payload) {
        boolean isStaff = STAFF_ROLES.contains(user.getRole());
        List<Long> allowedIds = isStaff ? null : getLinkedStudentIds(user.getId());

        if (payload.getStudentId() != null) {
            if (isStaff || (allowedIds != null && allowedIds.contains(payload.getStudentId()))) {
                Student student = studentRepository.findById(payload.getStudentId()).orElse(null);
                if (student != null) {
                    return new Object[]{student, null};
                }
            }
        }

        Student student = findStudentByText(payload.getMessage() != null ? payload.getMessage() : "", allowedIds);
        if (student != null) {
            return new Object[]{student, null};
        }

        if (isStaff) {
            return new Object[]{null, reply(
                    "Which student? Mention a name or admission number, e.g. \"attendance of Anaya\" or \"fees for ADM2026010\".",
                    QUICK_SUGGESTIONS)};
        }

        if (allowedIds == null || allowedIds.isEmpty()) {
            return new Object[]{null, reply(
                    "No student is linked to your account yet. Please contact the school office to set up portal access.",
                    List.of("Help"))};
        }

        if (allowedIds.size() == 1) {
            Student only = studentRepository.findById(allowedIds.get(0)).orElse(null);
            return new Object[]{only, null};
        }

        List<Student> children = studentRepository.findAllById(allowedIds);
        List<Map<String, Object>> childList = children.stream().map(c -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", c.getId());
            row.put("name", studentLabel(c));
            return row;
        }).toList();

        Map<String, Object> clarification = new LinkedHashMap<>();
        clarification.put("reply", "Which child would you like to ask about?");
        clarification.put("children", childList);
        clarification.put("suggestions", List.of());
        return new Object[]{null, clarification};
    }

    // ===================== intent handlers =====================

    private String studentLabel(Student student) {
        return ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).strip();
    }

    private static final Map<String, BiFunction<ChatbotController, Object[], Object>> STUDENT_HANDLERS = new LinkedHashMap<>();
    static {
        STUDENT_HANDLERS.put("attendance", (c, args) -> c.answerAttendance((Student) args[0], (String) args[1]));
        STUDENT_HANDLERS.put("fees", (c, args) -> c.answerFees((Student) args[0]));
        STUDENT_HANDLERS.put("marks", (c, args) -> c.answerMarks((Student) args[0]));
        STUDENT_HANDLERS.put("summary", (c, args) -> c.answerSummary((Student) args[0]));
        STUDENT_HANDLERS.put("history", (c, args) -> c.answerHistory((Student) args[0]));
        STUDENT_HANDLERS.put("timetable", (c, args) -> c.answerTimetable((Student) args[0], (String) args[1]));
        STUDENT_HANDLERS.put("exams_upcoming", (c, args) -> c.answerExamsUpcoming((Student) args[0]));
        STUDENT_HANDLERS.put("class_teacher", (c, args) -> c.answerClassTeacher((Student) args[0]));
        STUDENT_HANDLERS.put("transport", (c, args) -> c.answerTransport((Student) args[0]));
        STUDENT_HANDLERS.put("library", (c, args) -> c.answerLibrary((Student) args[0]));
    }

    private String answerAttendance(Student student, String message) {
        String text = message.toLowerCase();
        LocalDate today = LocalDate.now();
        LocalDate start = null;
        LocalDate end = null;
        String label = "";
        if (text.contains("today")) {
            start = today; end = today; label = "today";
        } else if (text.contains("this week")) {
            start = today.minusDays(today.getDayOfWeek().getValue() - 1); end = today; label = "this week";
        } else if (text.contains("this month")) {
            start = today.withDayOfMonth(1); end = today; label = "this month";
        } else if (text.contains("last month")) {
            LocalDate firstThis = today.withDayOfMonth(1);
            LocalDate lastPrev = firstThis.minusDays(1);
            start = lastPrev.withDayOfMonth(1); end = lastPrev; label = "last month";
        }

        LocalDate finalStart = start;
        LocalDate finalEnd = end;
        List<Attendance> records = attendanceRepository.findByStudentId(student.getId()).stream()
                .filter(a -> finalStart == null || (!a.getAttendanceDate().isBefore(finalStart) && !a.getAttendanceDate().isAfter(finalEnd)))
                .toList();

        String scope = label.isEmpty() ? "" : " " + label;
        if (records.isEmpty()) {
            return "No attendance has been recorded for " + studentLabel(student) + scope + ".";
        }

        Map<String, Integer> counts = new LinkedHashMap<>(Map.of("Present", 0, "Absent", 0, "Late", 0, "Half Day", 0));
        for (Attendance record : records) {
            if (counts.containsKey(record.getStatus())) {
                counts.put(record.getStatus(), counts.get(record.getStatus()) + 1);
            }
        }
        int total = records.size();
        double attended = counts.get("Present") + counts.get("Late") + counts.get("Half Day") * 0.5;
        double percentage = Math.round((attended / total) * 1000.0) / 10.0;

        return studentLabel(student) + "'s attendance" + scope + ": " + percentage + "% ("
                + counts.get("Present") + " present, " + counts.get("Absent") + " absent, "
                + counts.get("Late") + " late, " + counts.get("Half Day") + " half-day, out of " + total + " days).";
    }

    private String answerFees(Student student) {
        List<Fee> fees = feeRepository.findByStudentId(student.getId());
        if (fees.isEmpty()) {
            return "No fee records found for " + studentLabel(student) + ".";
        }

        double total = fees.stream().mapToDouble(f -> f.getTotalAmount() != null ? f.getTotalAmount() : 0).sum();
        double paid = fees.stream().mapToDouble(f -> f.getPaidAmount() != null ? f.getPaidAmount() : 0).sum();
        double due = fees.stream().mapToDouble(f -> f.getDueAmount() != null ? f.getDueAmount() : 0).sum();

        List<SchoolSettings> allSettings = schoolSettingsRepository.findAll();
        String currency = !allSettings.isEmpty() && allSettings.get(0).getCurrency() != null ? allSettings.get(0).getCurrency() : "";

        if (due <= 0) {
            return "All fees are fully paid for " + studentLabel(student) + " (total " + currency + " " + trimNum(total) + ").";
        }

        List<String> pendingTypes = fees.stream()
                .filter(f -> f.getDueAmount() != null && f.getDueAmount() > 0)
                .map(f -> f.getFeeType() + " (" + (f.getAcademicYear() != null ? f.getAcademicYear() : "-") + "): " + currency + " " + trimNum(f.getDueAmount()))
                .limit(6)
                .toList();
        String lines = String.join("\n• ", pendingTypes);
        return "Pending fees for " + studentLabel(student) + ": " + currency + " " + trimNum(due)
                + " (paid " + currency + " " + trimNum(paid) + " of " + currency + " " + trimNum(total) + ").\n• " + lines;
    }

    private String answerMarks(Student student) {
        List<Mark> marks = markRepository.findByStudentId(student.getId());
        if (marks.isEmpty()) {
            return "No exam results recorded for " + studentLabel(student) + " yet.";
        }

        Map<String, double[]> exams = new LinkedHashMap<>();
        for (Mark mark : marks) {
            String key = mark.getExamNameSnapshot() != null ? mark.getExamNameSnapshot() : ("Exam #" + mark.getExamId());
            double[] totals = exams.computeIfAbsent(key, k -> new double[2]);
            totals[0] += mark.getMarksObtained() != null ? mark.getMarksObtained() : 0;
            totals[1] += mark.getMaxMarks() != null ? mark.getMaxMarks() : (mark.getTotalMarks() != null ? mark.getTotalMarks() : 100);
        }

        List<String> lines = new ArrayList<>();
        int count = 0;
        for (Map.Entry<String, double[]> entry : exams.entrySet()) {
            if (count++ >= 5) break;
            double obtained = entry.getValue()[0];
            double max = entry.getValue()[1];
            double pct = max > 0 ? Math.round((obtained / max) * 1000.0) / 10.0 : 0;
            lines.add(entry.getKey() + ": " + trimNum(obtained) + "/" + trimNum(max) + " (" + pct + "%)");
        }
        return "Exam results for " + studentLabel(student) + ":\n• " + String.join("\n• ", lines);
    }

    private String answerSummary(Student student) {
        List<String> parts = new ArrayList<>();
        parts.add(studentLabel(student) + " (Admission No " + student.getAdmissionNo() + ")");
        String classDisplay = joinNonBlank(" - ", student.getClassName(), student.getSection());
        if (!classDisplay.isEmpty()) parts.add("Class " + classDisplay);
        if (student.getRollNo() != null && !student.getRollNo().isBlank()) parts.add("Roll No " + student.getRollNo());
        if (student.getHouse() != null && !student.getHouse().isBlank()) parts.add(student.getHouse() + " House");
        parts.add("Status: " + (student.getStudentStatus() != null ? student.getStudentStatus() : "Active"));
        return String.join(", ", parts) + ".";
    }

    private String answerHistory(Student student) {
        List<StudentEnrollment> enrollments = studentEnrollmentRepository.findByStudentId(student.getId()).stream()
                .sorted(Comparator.comparing(StudentEnrollment::getAcademicYear, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        if (enrollments.isEmpty()) {
            return "No academic history recorded for " + studentLabel(student) + " yet.";
        }
        List<String> lines = enrollments.stream().limit(6).map(e -> {
            String classLabel = joinNonBlank(" - ", e.getClassNameSnapshot(), e.getSectionSnapshot());
            return e.getAcademicYear() + ": Class " + (classLabel.isEmpty() ? "-" : classLabel) + " (" + e.getPromotionStatus() + ")";
        }).toList();
        return "Academic history for " + studentLabel(student) + ":\n• " + String.join("\n• ", lines);
    }

    private String answerTimetable(Student student, String message) {
        LocalDate target = LocalDate.now();
        String label = "today";
        if (message.toLowerCase().contains("tomorrow")) {
            target = target.plusDays(1);
            label = "tomorrow";
        }
        String dayName = target.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH);

        List<TimetableEntry> entries;
        if (student.getClassId() != null) {
            Long classId = student.getClassId();
            entries = timetableEntryRepository.findAll().stream().filter(e -> classId.equals(e.getClassId())).toList();
        } else if (student.getClassName() != null) {
            String section = student.getSection() != null ? student.getSection() : "";
            entries = timetableEntryRepository.findAll().stream()
                    .filter(e -> student.getClassName().equals(e.getClassNameSnapshot()) && section.equals(e.getSectionSnapshot() != null ? e.getSectionSnapshot() : ""))
                    .toList();
        } else {
            return "No class is set for " + studentLabel(student) + ", so I can't look up a timetable.";
        }

        String finalDayName = dayName;
        List<TimetableEntry> matching = entries.stream()
                .filter(e -> finalDayName.equals(e.getDayOfWeek()) || "*".equals(e.getDayOfWeek()))
                .sorted(Comparator.comparing(TimetableEntry::getPeriodNo))
                .toList();

        if (matching.isEmpty()) {
            return "No timetable is set for " + studentLabel(student) + "'s class for " + label + " (" + dayName + ").";
        }

        List<String> lines = new ArrayList<>();
        for (TimetableEntry entry : matching) {
            String timePart = "";
            if (entry.getStartTime() != null && entry.getEndTime() != null) {
                timePart = " (" + entry.getStartTime() + "–" + entry.getEndTime() + ")";
            }
            if (!"period".equals(entry.getEntryType())) {
                String entryType = entry.getEntryType();
                String titleCased = entryType == null ? "" : entryType.substring(0, 1).toUpperCase() + entryType.substring(1);
                lines.add((entry.getLabel() != null ? entry.getLabel() : titleCased) + timePart);
                continue;
            }
            String teacherPart = entry.getTeacherNameSnapshot() != null ? ", " + entry.getTeacherNameSnapshot() : "";
            lines.add((entry.getSubject() != null ? entry.getSubject() : "-") + timePart + teacherPart);
        }
        return "Timetable for " + studentLabel(student) + " " + label + " (" + dayName + "):\n• " + String.join("\n• ", lines);
    }

    private String answerExamsUpcoming(Student student) {
        LocalDate today = LocalDate.now();
        List<Exam> exams = examRepository.findAll().stream()
                .filter(e -> e.getExamDate() != null && !e.getExamDate().isBefore(today))
                .filter(e -> student.getClassName() == null || student.getClassName().equals(e.getClassName()))
                .filter(e -> student.getClassName() == null || student.getSection() == null || student.getSection().equals(e.getSection()))
                .sorted(Comparator.comparing(Exam::getExamDate))
                .limit(5)
                .toList();
        if (exams.isEmpty()) {
            return "No upcoming exams are scheduled for " + studentLabel(student) + "'s class.";
        }
        List<String> lines = exams.stream()
                .map(e -> e.getExamName() + " — " + formatDate(e.getExamDate()))
                .toList();
        return "Upcoming exams for " + studentLabel(student) + ":\n• " + String.join("\n• ", lines);
    }

    private String answerClassTeacher(Student student) {
        Teacher teacher = notificationService.findClassTeacher(student);
        if (teacher == null) {
            return "No class teacher is assigned for " + studentLabel(student) + "'s class yet. Please contact the school office.";
        }
        return "The class teacher for " + studentLabel(student) + "'s class is " + teacher.getName() + ".";
    }

    private String answerTransport(Student student) {
        if ((student.getTransportRoute() == null || student.getTransportRoute().isBlank())
                && (student.getPickupPoint() == null || student.getPickupPoint().isBlank())) {
            return "No transport route is set for " + studentLabel(student) + ".";
        }
        List<String> parts = new ArrayList<>();
        if (student.getTransportRoute() != null && !student.getTransportRoute().isBlank()) parts.add("Route: " + student.getTransportRoute());
        if (student.getPickupPoint() != null && !student.getPickupPoint().isBlank()) parts.add("Pickup point: " + student.getPickupPoint());
        return "Transport for " + studentLabel(student) + " — " + String.join(", ", parts) + ".";
    }

    private String answerLibrary(Student student) {
        List<LibraryIssue> issues = libraryIssueRepository.findAll().stream()
                .filter(i -> student.getId().equals(i.getStudentId()) && i.getReturnDate() == null)
                .sorted(Comparator.comparing(LibraryIssue::getIssueDate, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(6)
                .toList();
        if (issues.isEmpty()) {
            return studentLabel(student) + " has no library books issued at the moment.";
        }
        List<String> lines = new ArrayList<>();
        for (LibraryIssue issue : issues) {
            LibraryBook book = libraryBookRepository.findById(issue.getBookId()).orElse(null);
            String duePart = issue.getDueDate() != null ? ", due " + formatDate(issue.getDueDate()) : "";
            String finePart = issue.getFineAmount() != null && issue.getFineAmount() > 0 ? ", fine " + trimNum(issue.getFineAmount()) : "";
            lines.add((book != null ? book.getTitle() : "-") + duePart + finePart);
        }
        return "Library books issued to " + studentLabel(student) + ":\n• " + String.join("\n• ", lines);
    }

    private String answerYear() {
        AcademicYear year = academicYearRepository.findFirstByIsCurrentTrue().orElse(null);
        if (year != null) {
            String extra = "";
            if (year.getStartDate() != null && year.getEndDate() != null) {
                extra = " (" + year.getStartDate() + " to " + year.getEndDate() + ")";
            }
            return "The current academic year is " + year.getName() + extra + ".";
        }
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (!all.isEmpty() && all.get(0).getAcademicYear() != null) {
            return "The current academic year is " + all.get(0).getAcademicYear() + ".";
        }
        return "No current academic year has been set yet.";
    }

    private String answerSchool() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (all.isEmpty()) {
            return "School information has not been configured yet.";
        }
        SchoolSettings settings = all.get(0);
        List<String> parts = new ArrayList<>();
        parts.add(settings.getSchoolName());
        if (settings.getPrincipalName() != null && !settings.getPrincipalName().isBlank()) parts.add("Principal: " + settings.getPrincipalName());
        if (settings.getPhone() != null && !settings.getPhone().isBlank()) parts.add("Phone: " + settings.getPhone());
        if (settings.getEmail() != null && !settings.getEmail().isBlank()) parts.add("Email: " + settings.getEmail());
        if (settings.getAddress() != null && !settings.getAddress().isBlank()) parts.add("Address: " + settings.getAddress());
        return String.join(" | ", parts);
    }

    // ===================== small helpers =====================

    private String joinNonBlank(String separator, String... parts) {
        List<String> present = new ArrayList<>();
        for (String part : parts) {
            if (part != null && !part.isBlank()) present.add(part);
        }
        return String.join(separator, present);
    }

    private String trimNum(double value) {
        return value == Math.floor(value) ? String.valueOf((long) value) : String.valueOf(value);
    }

    private String formatDate(LocalDate date) {
        return date.getDayOfMonth() + " " + date.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + date.getYear();
    }

    private Map<String, Object> reply(String text, List<String> suggestions) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reply", text);
        body.put("suggestions", suggestions);
        return body;
    }
}
