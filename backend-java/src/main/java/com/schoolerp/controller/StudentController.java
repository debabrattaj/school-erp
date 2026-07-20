package com.schoolerp.controller;

import com.schoolerp.dto.student.StudentCreate;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.SchoolClassRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.PushbackReader;
import java.io.Reader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Direct port of backend/app/routes/students.py.
 */
@RestController
@RequestMapping("/students")
public class StudentController {

    private static final List<String> VALID_STATUSES = List.of("Active", "Graduated", "Transferred", "Suspended", "Alumni");
    private static final List<String> VALID_GENDERS = List.of("Male", "Female", "Other");

    private static final List<String> BULK_IMPORT_COLUMNS = List.of(
            "admission_no", "first_name", "last_name", "gender", "dob", "class_name", "section",
            "roll_no", "admission_date", "student_status", "father_name", "mother_name",
            "guardian_name", "guardian_phone", "guardian_email", "nationality", "blood_group"
    );

    private final StudentRepository studentRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final PermissionService permissionService;
    private final NotificationService notificationService;

    public StudentController(
            StudentRepository studentRepository,
            SchoolClassRepository schoolClassRepository,
            PermissionService permissionService,
            NotificationService notificationService
    ) {
        this.studentRepository = studentRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.permissionService = permissionService;
        this.notificationService = notificationService;
    }

    @PostMapping({"", "/"})
    public Student createStudent(@Valid @RequestBody StudentCreate payload) {
        permissionService.requireRoles("Admin", "Principal");

        if (studentRepository.findByAdmissionNo(payload.getAdmissionNo()).isPresent()) {
            throw ApiException.badRequest("Student with this admission number already exists");
        }
        if (payload.getStudentStatus() != null && !VALID_STATUSES.contains(payload.getStudentStatus())) {
            throw ApiException.badRequest("Invalid student status");
        }
        if (payload.getGender() != null && !VALID_GENDERS.contains(payload.getGender())) {
            throw ApiException.badRequest("Invalid gender");
        }

        Student student = new Student();
        payload.applyTo(student);

        if ("manual".equals(payload.getRollNoMode())) {
            String manualRoll = payload.getRollNo() == null ? "" : payload.getRollNo().trim();
            if (manualRoll.isEmpty()) {
                throw ApiException.badRequest("Roll No is required when entering it manually.");
            }
            if (rollNoTaken(payload.getClassId(), payload.getClassName(), payload.getSection(), manualRoll, null)) {
                throw ApiException.badRequest("Roll No " + manualRoll + " is already used in this section.");
            }
            student.setRollNo(manualRoll);
        } else {
            student.setRollNo(nextRollNo(payload.getClassId(), payload.getClassName(), payload.getSection()));
        }

        student = studentRepository.save(student);
        notificationService.notifyClassTeacherNewStudent(student);
        return student;
    }

    @GetMapping("/bulk-import-template")
    public ResponseEntity<byte[]> bulkImportTemplate() {
        permissionService.requireRoles("Admin", "Principal");

        Map<String, String> sample = new LinkedHashMap<>();
        sample.put("admission_no", "ADM2026101");
        sample.put("first_name", "Jane");
        sample.put("last_name", "Doe");
        sample.put("gender", "Female");
        sample.put("dob", "2012-05-14");
        sample.put("class_name", "8");
        sample.put("section", "A");
        sample.put("roll_no", "21");
        sample.put("admission_date", "2026-04-01");
        sample.put("student_status", "Active");
        sample.put("father_name", "John Doe");
        sample.put("mother_name", "Mary Doe");
        sample.put("guardian_name", "John Doe");
        sample.put("guardian_phone", "9876543210");
        sample.put("guardian_email", "john.doe@example.com");
        sample.put("nationality", "Indian");
        sample.put("blood_group", "O+");

        StringWriter buf = new StringWriter();
        buf.write(String.join(",", BULK_IMPORT_COLUMNS));
        buf.write("\r\n");
        buf.write(BULK_IMPORT_COLUMNS.stream().map(sample::get).map(this::csvField).reduce((a, b) -> a + "," + b).orElse(""));
        buf.write("\r\n");

        byte[] body = buf.toString().getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=students_import_template.csv")
                .body(body);
    }

    @PostMapping("/bulk-import")
    public Map<String, Object> bulkImportStudents(
            @RequestParam("file") MultipartFile file,
            @RequestParam(name = "dry_run", defaultValue = "false") boolean dryRun
    ) {
        permissionService.requireRoles("Admin", "Principal");

        String filename = file.getOriginalFilename();
        if (filename == null || !filename.toLowerCase().endsWith(".csv")) {
            throw ApiException.badRequest("Please upload a .csv file");
        }

        String text;
        try {
            byte[] raw = file.getBytes();
            text = new String(raw, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw ApiException.badRequest("File must be UTF-8 encoded");
        }
        if (!text.isEmpty() && text.charAt(0) == '﻿') {
            text = text.substring(1);
        }

        List<Map<String, String>> rows;
        List<String> header;
        try (Reader reader = new java.io.StringReader(text)) {
            List<List<String>> raw = parseCsv(reader);
            if (raw.isEmpty()) {
                throw ApiException.badRequest("CSV file is empty or missing a header row");
            }
            header = raw.get(0);
            rows = new ArrayList<>();
            for (int i = 1; i < raw.size(); i++) {
                List<String> line = raw.get(i);
                Map<String, String> row = new LinkedHashMap<>();
                for (int c = 0; c < header.size(); c++) {
                    row.put(header.get(c), c < line.size() ? line.get(c) : null);
                }
                rows.add(row);
            }
        } catch (IOException e) {
            throw ApiException.badRequest("CSV file is empty or missing a header row");
        }

        List<String> unknownColumns = header.stream().filter(c -> !BULK_IMPORT_COLUMNS.contains(c)).toList();

        Map<String, Long> classLookup = new LinkedHashMap<>();
        for (var schoolClass : schoolClassRepository.findAll()) {
            classLookup.put(
                    schoolClass.getClassName().strip().toLowerCase() + " " + schoolClass.getSection().strip().toLowerCase(),
                    schoolClass.getId()
            );
        }

        Set<String> seenAdmissionNos = new java.util.HashSet<>();
        List<Map<String, Object>> errors = new ArrayList<>();
        List<StudentCreate> toCreate = new ArrayList<>();
        int rowIndex = 1;

        for (Map<String, String> rawRow : rows) {
            rowIndex++;

            Map<String, String> cleaned = new LinkedHashMap<>();
            for (String col : BULK_IMPORT_COLUMNS) {
                String v = rawRow.get(col);
                if (v != null) v = v.strip();
                cleaned.put(col, (v == null || v.isEmpty()) ? null : v);
            }

            String admissionNo = cleaned.get("admission_no");
            if (admissionNo == null) {
                errors.add(rowError(rowIndex, "admission_no is required"));
                continue;
            }
            if (cleaned.get("first_name") == null) {
                errors.add(rowError(rowIndex, "first_name is required"));
                continue;
            }
            if (seenAdmissionNos.contains(admissionNo)) {
                errors.add(rowError(rowIndex, "Duplicate admission_no in file: " + admissionNo));
                continue;
            }
            if (studentRepository.findByAdmissionNo(admissionNo).isPresent()) {
                errors.add(rowError(rowIndex, "admission_no already exists: " + admissionNo));
                continue;
            }
            if (cleaned.get("student_status") != null && !VALID_STATUSES.contains(cleaned.get("student_status"))) {
                errors.add(rowError(rowIndex, "Invalid student_status: " + cleaned.get("student_status")));
                continue;
            }
            if (cleaned.get("gender") != null && !VALID_GENDERS.contains(cleaned.get("gender"))) {
                errors.add(rowError(rowIndex, "Invalid gender: " + cleaned.get("gender")));
                continue;
            }

            String className = cleaned.get("class_name");
            String section = cleaned.get("section");
            Long classId = null;
            if (className != null) {
                if (section == null) {
                    errors.add(rowError(rowIndex, "section is required when class_name is provided"));
                    continue;
                }
                classId = classLookup.get(className.strip().toLowerCase() + " " + section.strip().toLowerCase());
                if (classId == null) {
                    errors.add(rowError(rowIndex, "No matching class found for class_name='" + className + "', section='" + section + "'"));
                    continue;
                }
            }

            StudentCreate validated = new StudentCreate();
            validated.setAdmissionNo(admissionNo);
            validated.setFirstName(cleaned.get("first_name"));
            validated.setLastName(cleaned.get("last_name"));
            validated.setGender(cleaned.get("gender"));
            validated.setClassName(className);
            validated.setSection(section);
            validated.setClassId(classId);
            validated.setRollNo(cleaned.get("roll_no"));
            validated.setStudentStatus(cleaned.get("student_status") != null ? cleaned.get("student_status") : "Active");
            validated.setFatherName(cleaned.get("father_name"));
            validated.setMotherName(cleaned.get("mother_name"));
            validated.setGuardianName(cleaned.get("guardian_name"));
            validated.setGuardianPhone(cleaned.get("guardian_phone"));
            validated.setGuardianEmail(cleaned.get("guardian_email"));
            validated.setNationality(cleaned.get("nationality"));
            validated.setBloodGroup(cleaned.get("blood_group"));

            try {
                if (cleaned.get("dob") != null) validated.setDob(LocalDate.parse(cleaned.get("dob")));
                if (cleaned.get("admission_date") != null) validated.setAdmissionDate(LocalDate.parse(cleaned.get("admission_date")));
            } catch (DateTimeParseException e) {
                errors.add(rowError(rowIndex, "Invalid date format (use YYYY-MM-DD)"));
                continue;
            }

            seenAdmissionNos.add(admissionNo);
            toCreate.add(validated);
        }

        int createdCount = 0;
        if (!dryRun) {
            for (StudentCreate validated : toCreate) {
                Student student = new Student();
                validated.applyTo(student);
                // Matches Python: bulk-import stores roll_no exactly as given in the
                // CSV (including null/blank) - no next_roll_no auto-assignment, unlike
                // the single-row POST /students endpoint.
                student.setRollNo(validated.getRollNo());
                studentRepository.save(student);
            }
            createdCount = toCreate.size();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_rows", rowIndex - 1);
        result.put("created", dryRun ? 0 : createdCount);
        result.put("valid_rows", toCreate.size());
        result.put("errors", errors);
        result.put("dry_run", dryRun);
        result.put("unknown_columns", unknownColumns);
        return result;
    }

    private Map<String, Object> rowError(int row, String error) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("row", row);
        m.put("error", error);
        return m;
    }

    private String csvField(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    /**
     * Minimal RFC 4180 CSV parser: handles quoted fields (including embedded
     * commas/newlines and "" escaped quotes) and CRLF/LF line endings.
     */
    private List<List<String>> parseCsv(Reader input) throws IOException {
        PushbackReader reader = new PushbackReader(input, 1);
        List<List<String>> rows = new ArrayList<>();
        List<String> currentRow = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        boolean sawAnyChar = false;
        int ch;
        while ((ch = reader.read()) != -1) {
            sawAnyChar = true;
            if (inQuotes) {
                if (ch == '"') {
                    int next = reader.read();
                    if (next == '"') {
                        field.append('"');
                    } else {
                        inQuotes = false;
                        if (next != -1) reader.unread(next);
                    }
                } else {
                    field.append((char) ch);
                }
                continue;
            }
            switch (ch) {
                case '"' -> inQuotes = true;
                case ',' -> {
                    currentRow.add(field.toString());
                    field.setLength(0);
                }
                case '\r' -> { /* ignore; \n (if present) ends the row */ }
                case '\n' -> {
                    currentRow.add(field.toString());
                    field.setLength(0);
                    rows.add(currentRow);
                    currentRow = new ArrayList<>();
                }
                default -> field.append((char) ch);
            }
        }
        if (sawAnyChar && (field.length() > 0 || !currentRow.isEmpty())) {
            currentRow.add(field.toString());
            rows.add(currentRow);
        }
        return rows;
    }

    @GetMapping({"", "/"})
    public List<Student> getStudents() {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return studentRepository.findAllByOrderByIdDesc();
    }

    @GetMapping("/next-roll-no")
    public Map<String, String> getNextRollNo(
            @RequestParam(name = "class_id", required = false) Long classId,
            @RequestParam(name = "class_name", required = false) String className,
            @RequestParam(required = false) String section
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return Map.of("roll_no", nextRollNo(classId, className, section));
    }

    @GetMapping("/{studentId}")
    public Student getStudent(@PathVariable Long studentId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found"));
    }

    @PutMapping("/{studentId}")
    public Student updateStudent(@PathVariable Long studentId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Principal");

        Student student = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found"));

        if (updateData.containsKey("admission_no") && updateData.get("admission_no") != null) {
            String newAdmissionNo = updateData.get("admission_no").toString();
            studentRepository.findByAdmissionNo(newAdmissionNo).ifPresent(existing -> {
                if (!existing.getId().equals(studentId)) {
                    throw ApiException.badRequest("Another student with this admission number already exists");
                }
            });
        }
        if (updateData.containsKey("student_status") && updateData.get("student_status") != null) {
            if (!VALID_STATUSES.contains(updateData.get("student_status").toString())) {
                throw ApiException.badRequest("Invalid student status");
            }
        }
        if (updateData.containsKey("gender") && updateData.get("gender") != null) {
            if (!VALID_GENDERS.contains(updateData.get("gender").toString())) {
                throw ApiException.badRequest("Invalid gender");
            }
        }

        String rollNoMode = (String) updateData.remove("roll_no_mode");
        Object submittedRollNo = updateData.remove("roll_no");

        applyFieldUpdates(student, updateData);

        if (rollNoMode != null) {
            Long resolvedClassId = student.getClassId();
            String resolvedClassName = student.getClassName();
            String resolvedSection = student.getSection();

            if ("manual".equals(rollNoMode)) {
                String manualRoll = submittedRollNo != null ? submittedRollNo.toString().trim()
                        : (student.getRollNo() == null ? "" : student.getRollNo().trim());
                if (manualRoll.isEmpty()) {
                    throw ApiException.badRequest("Roll No is required when entering it manually.");
                }
                if (rollNoTaken(resolvedClassId, resolvedClassName, resolvedSection, manualRoll, studentId)) {
                    throw ApiException.badRequest("Roll No " + manualRoll + " is already used in this section.");
                }
                student.setRollNo(manualRoll);
            } else {
                student.setRollNo(nextRollNo(resolvedClassId, resolvedClassName, resolvedSection));
            }
        }

        return studentRepository.save(student);
    }

    @DeleteMapping("/{studentId}")
    public Map<String, String> deleteStudent(@PathVariable Long studentId) {
        permissionService.requireRoles("Admin");
        Student student = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found"));
        studentRepository.delete(student);
        return Map.of("message", "Student deleted successfully");
    }

    /** Applies raw JSON update fields (snake_case keys) onto the entity, converting types as needed. */
    private void applyFieldUpdates(Student student, Map<String, Object> updateData) {
        for (Map.Entry<String, Object> entry : updateData.entrySet()) {
            Object value = entry.getValue();
            String strValue = value == null ? null : value.toString();
            switch (entry.getKey()) {
                case "admission_no" -> student.setAdmissionNo(strValue);
                case "class_name" -> student.setClassName(strValue);
                case "section" -> student.setSection(strValue);
                case "house" -> student.setHouse(strValue);
                case "admission_date" -> student.setAdmissionDate(value == null ? null : java.time.LocalDate.parse(strValue));
                case "student_status" -> student.setStudentStatus(strValue);
                case "residential_type" -> student.setResidentialType(strValue);
                case "class_id" -> student.setClassId(value == null ? null : Long.valueOf(strValue));
                case "first_name" -> student.setFirstName(strValue);
                case "last_name" -> student.setLastName(strValue);
                case "gender" -> student.setGender(strValue);
                case "dob" -> student.setDob(value == null ? null : java.time.LocalDate.parse(strValue));
                case "nationality" -> student.setNationality(strValue);
                case "blood_group" -> student.setBloodGroup(strValue);
                case "photo_url" -> student.setPhotoUrl(strValue);
                case "father_name" -> student.setFatherName(strValue);
                case "mother_name" -> student.setMotherName(strValue);
                case "guardian_name" -> student.setGuardianName(strValue);
                case "guardian_phone" -> student.setGuardianPhone(strValue);
                case "guardian_email" -> student.setGuardianEmail(strValue);
                case "medical_notes" -> student.setMedicalNotes(strValue);
                case "allergies" -> student.setAllergies(strValue);
                case "transport_route" -> student.setTransportRoute(strValue);
                case "pickup_point" -> student.setPickupPoint(strValue);
                case "birth_certificate" -> student.setBirthCertificate(strValue);
                case "transfer_certificate" -> student.setTransferCertificate(strValue);
                case "passport_no" -> student.setPassportNo(strValue);
                default -> { /* ignore unknown fields */ }
            }
        }
    }

    /** 1 + the highest existing numeric roll_no among students in the same class/section, or "1". */
    private String nextRollNo(Long classId, String className, String section) {
        List<Student> candidates;
        if (classId != null) {
            candidates = studentRepository.findByClassId(classId);
        } else if (className != null && section != null) {
            candidates = studentRepository.findByClassNameAndSection(className, section);
        } else {
            return "1";
        }

        int highest = 0;
        for (Student s : candidates) {
            String roll = s.getRollNo();
            if (roll != null && !roll.isBlank() && roll.trim().chars().allMatch(Character::isDigit)) {
                highest = Math.max(highest, Integer.parseInt(roll.trim()));
            }
        }
        return String.valueOf(highest + 1);
    }

    private boolean rollNoTaken(Long classId, String className, String section, String rollNo, Long excludeStudentId) {
        List<Student> candidates;
        if (classId != null) {
            candidates = studentRepository.findByClassId(classId);
        } else if (className != null && section != null) {
            candidates = studentRepository.findByClassNameAndSection(className, section);
        } else {
            return false;
        }
        return candidates.stream()
                .filter(s -> rollNo.equals(s.getRollNo()))
                .anyMatch(s -> excludeStudentId == null || !s.getId().equals(excludeStudentId));
    }
}
