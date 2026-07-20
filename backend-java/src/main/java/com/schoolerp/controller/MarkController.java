package com.schoolerp.controller;

import com.schoolerp.entity.*;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import com.schoolerp.security.PermissionService;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Direct port of backend/app/routes/marks.py's CRUD endpoints. The PDF
 * report-card endpoint (GET /marks/report-card, depends on the not-yet-ported
 * app/pdf.py) is not included yet.
 */
@RestController
@RequestMapping("/marks")
public class MarkController {

    private static final List<String> VALID_SUBJECTS = List.of(
            "English", "Mathematics", "Science", "Social Science", "Hindi", "Computer Science",
            "Physics", "Chemistry", "Biology", "Accountancy", "Economics", "Business Studies",
            "Physical Education", "Art", "Music", "Other"
    );

    private final MarkRepository markRepository;
    private final MarkComponentScoreRepository markComponentScoreRepository;
    private final StudentRepository studentRepository;
    private final ExamRepository examRepository;
    private final ExamComponentRepository examComponentRepository;
    private final ClassSubjectRepository classSubjectRepository;
    private final ClassExamMappingRepository classExamMappingRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final PermissionService permissionService;

    public MarkController(
            MarkRepository markRepository,
            MarkComponentScoreRepository markComponentScoreRepository,
            StudentRepository studentRepository,
            ExamRepository examRepository,
            ExamComponentRepository examComponentRepository,
            ClassSubjectRepository classSubjectRepository,
            ClassExamMappingRepository classExamMappingRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            PermissionService permissionService
    ) {
        this.markRepository = markRepository;
        this.markComponentScoreRepository = markComponentScoreRepository;
        this.studentRepository = studentRepository;
        this.examRepository = examRepository;
        this.examComponentRepository = examComponentRepository;
        this.classSubjectRepository = classSubjectRepository;
        this.classExamMappingRepository = classExamMappingRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createMark(@RequestBody Map<String, Object> payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");

        Long studentId = asLong(payload.get("student_id"));
        Long examId = asLong(payload.get("exam_id"));
        Student student = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found"));
        Exam exam = examRepository.findById(examId).orElseThrow(() -> ApiException.notFound("Exam not found"));

        Map<String, Object> data = normalizeMarkPayload(payload);
        if (data.get("class_id") == null) data.put("class_id", student.getClassId());
        if (data.get("class_name_snapshot") == null) data.put("class_name_snapshot", student.getClassName());
        if (data.get("section_snapshot") == null) data.put("section_snapshot", student.getSection());
        if (data.get("exam_name_snapshot") == null) data.put("exam_name_snapshot", exam.getExamName());

        if (data.get("subject_name") == null || data.get("subject_name").toString().isBlank()) {
            throw ApiException.badRequest("Subject is required");
        }

        double totalMarks = asDouble(data.get("total_marks"));
        double marksObtained = asDouble(data.get("marks_obtained"));
        if (totalMarks <= 0) throw ApiException.badRequest("Total marks must be greater than 0");
        if (marksObtained < 0) throw ApiException.badRequest("Marks obtained cannot be negative");
        if (marksObtained > totalMarks) throw ApiException.badRequest("Marks obtained cannot be greater than total marks");

        validateExamMapping(student, data);
        validateSubjectMapping(student, data);

        String subjectName = data.get("subject_name").toString();
        String academicYear = (String) data.get("academic_year");
        boolean duplicate = markRepository.findAll().stream().anyMatch(m ->
                m.getStudentId().equals(studentId) && m.getExamId().equals(examId)
                        && subjectName.equals(m.getSubjectName()) && Objects.equals(academicYear, m.getAcademicYear()));
        if (duplicate) {
            throw ApiException.badRequest("Marks already added for this student, exam and subject");
        }

        Mark mark = new Mark();
        mark.setStudentId(studentId);
        mark.setExamId(examId);
        mark.setClassSubjectId(asLong(data.get("class_subject_id")));
        mark.setSubjectName(subjectName);
        mark.setAcademicYear(academicYear);
        mark.setClassId(asLong(data.get("class_id")));
        mark.setClassNameSnapshot((String) data.get("class_name_snapshot"));
        mark.setSectionSnapshot((String) data.get("section_snapshot"));
        mark.setExamNameSnapshot((String) data.get("exam_name_snapshot"));
        mark.setSubject(subjectName);
        mark.setMarksObtained(marksObtained);
        mark.setMaxMarks(asDouble(data.get("max_marks")));
        mark.setTotalMarks(totalMarks);
        mark.setGrade(calculateGrade(marksObtained, totalMarks));
        mark.setRemarks((String) data.get("remarks"));

        mark = markRepository.save(mark);
        saveComponentScores(mark, castComponentScores(data.get("component_scores")));

        return markResponse(mark);
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> getMarks(
            @RequestParam(name = "student_id", required = false) Long studentId,
            @RequestParam(name = "exam_id", required = false) Long examId,
            @RequestParam(name = "academic_year", required = false) String academicYear
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return markRepository.findAll().stream()
                .filter(m -> studentId == null || studentId.equals(m.getStudentId()))
                .filter(m -> examId == null || examId.equals(m.getExamId()))
                .filter(m -> academicYear == null || academicYear.equals(m.getAcademicYear()))
                .sorted(Comparator.comparing(Mark::getId).reversed())
                .map(this::markResponse)
                .toList();
    }

    @GetMapping("/student/{studentId}")
    public List<Map<String, Object>> getStudentMarks(@PathVariable Long studentId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        if (!studentRepository.existsById(studentId)) {
            throw ApiException.notFound("Student not found");
        }
        return markRepository.findByStudentId(studentId).stream()
                .sorted(Comparator.comparing(Mark::getId).reversed())
                .map(this::markResponse)
                .toList();
    }

    @GetMapping("/exam/{examId}")
    public List<Map<String, Object>> getExamMarks(@PathVariable Long examId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        if (!examRepository.existsById(examId)) {
            throw ApiException.notFound("Exam not found");
        }
        return markRepository.findByExamId(examId).stream()
                .sorted(Comparator.comparing(Mark::getId).reversed())
                .map(this::markResponse)
                .toList();
    }

    @GetMapping("/metadata/subjects")
    public Map<String, List<String>> getSubjects() {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return Map.of("subjects", VALID_SUBJECTS);
    }

    @GetMapping("/{markId}")
    public Map<String, Object> getMark(@PathVariable Long markId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        Mark mark = markRepository.findById(markId).orElseThrow(() -> ApiException.notFound("Mark record not found"));
        return markResponse(mark);
    }

    @PutMapping("/{markId}")
    public Map<String, Object> updateMark(@PathVariable Long markId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");

        Mark mark = markRepository.findById(markId).orElseThrow(() -> ApiException.notFound("Mark record not found"));

        Map<String, Object> merged = new LinkedHashMap<>();
        merged.put("student_id", mark.getStudentId());
        merged.put("exam_id", mark.getExamId());
        merged.put("class_subject_id", mark.getClassSubjectId());
        merged.put("subject_name", mark.getSubjectName());
        merged.put("academic_year", mark.getAcademicYear());
        merged.put("class_id", mark.getClassId());
        merged.put("class_name_snapshot", mark.getClassNameSnapshot());
        merged.put("section_snapshot", mark.getSectionSnapshot());
        merged.put("exam_name_snapshot", mark.getExamNameSnapshot());
        merged.put("subject", mark.getSubject());
        merged.put("marks_obtained", mark.getMarksObtained());
        merged.put("max_marks", mark.getMaxMarks());
        merged.put("total_marks", mark.getTotalMarks());
        merged.put("grade", mark.getGrade());
        merged.put("remarks", mark.getRemarks());
        merged.putAll(updateData);

        Map<String, Object> data = normalizeMarkPayload(merged);

        Long studentId = asLong(data.get("student_id"));
        Long examId = asLong(data.get("exam_id"));
        Student student = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found"));
        Exam exam = examRepository.findById(examId).orElseThrow(() -> ApiException.notFound("Exam not found"));

        if (data.get("class_id") == null) data.put("class_id", student.getClassId());
        if (data.get("class_name_snapshot") == null) data.put("class_name_snapshot", student.getClassName());
        if (data.get("section_snapshot") == null) data.put("section_snapshot", student.getSection());
        if (data.get("exam_name_snapshot") == null) data.put("exam_name_snapshot", exam.getExamName());

        validateExamMapping(student, data);
        validateSubjectMapping(student, data);

        String subjectName = (String) data.get("subject_name");
        String academicYear = (String) data.get("academic_year");
        boolean duplicate = markRepository.findAll().stream().anyMatch(m ->
                !m.getId().equals(markId) && m.getStudentId().equals(studentId) && m.getExamId().equals(examId)
                        && Objects.equals(subjectName, m.getSubjectName()) && Objects.equals(academicYear, m.getAcademicYear()));
        if (duplicate) {
            throw ApiException.badRequest("Marks already added for this student, exam and subject");
        }

        mark.setStudentId(studentId);
        mark.setExamId(examId);
        mark.setClassSubjectId(asLong(data.get("class_subject_id")));
        mark.setSubjectName(subjectName);
        mark.setAcademicYear(academicYear);
        mark.setClassId(asLong(data.get("class_id")));
        mark.setClassNameSnapshot((String) data.get("class_name_snapshot"));
        mark.setSectionSnapshot((String) data.get("section_snapshot"));
        mark.setExamNameSnapshot((String) data.get("exam_name_snapshot"));
        mark.setSubject((String) data.get("subject"));
        mark.setMarksObtained(asDouble(data.get("marks_obtained")));
        mark.setMaxMarks(asDouble(data.get("max_marks")));
        mark.setTotalMarks(asDouble(data.get("total_marks")));
        mark.setRemarks((String) data.get("remarks"));

        if (mark.getTotalMarks() <= 0) throw ApiException.badRequest("Total marks must be greater than 0");
        if (mark.getMarksObtained() < 0) throw ApiException.badRequest("Marks obtained cannot be negative");
        if (mark.getMarksObtained() > mark.getTotalMarks()) throw ApiException.badRequest("Marks obtained cannot be greater than total marks");

        mark.setGrade(calculateGrade(mark.getMarksObtained(), mark.getTotalMarks()));
        mark = markRepository.save(mark);

        if (data.containsKey("component_scores")) {
            saveComponentScores(mark, castComponentScores(data.get("component_scores")));
        }

        return markResponse(mark);
    }

    @DeleteMapping("/{markId}")
    public Map<String, String> deleteMark(@PathVariable Long markId) {
        permissionService.requireRoles("Admin");
        Mark mark = markRepository.findById(markId).orElseThrow(() -> ApiException.notFound("Mark record not found"));
        for (MarkComponentScore score : markComponentScoreRepository.findByMarkId(mark.getId())) {
            markComponentScoreRepository.delete(score);
        }
        markRepository.delete(mark);
        return Map.of("message", "Mark record deleted successfully");
    }

    // ===================== helpers =====================

    @SuppressWarnings("unchecked")
    private Map<String, Object> normalizeMarkPayload(Map<String, Object> raw) {
        Map<String, Object> data = new LinkedHashMap<>(raw);
        Object componentScoresRaw = data.remove("component_scores");

        Long classSubjectId = asLong(data.get("class_subject_id"));
        if (classSubjectId != null) {
            ClassSubject classSubject = classSubjectRepository.findById(classSubjectId)
                    .orElseThrow(() -> ApiException.notFound("Class subject mapping not found"));
            if (isBlank(data.get("subject_name"))) data.put("subject_name", classSubject.getSubjectName());
            if (isBlank(data.get("subject"))) data.put("subject", classSubject.getSubjectName());
            if (isBlank(data.get("academic_year"))) data.put("academic_year", classSubject.getAcademicYear());
        }

        Object subjectNameOrSubject = !isBlank(data.get("subject_name")) ? data.get("subject_name") : data.get("subject");
        if (!isBlank(subjectNameOrSubject)) {
            String trimmed = subjectNameOrSubject.toString().trim();
            data.put("subject_name", trimmed);
            data.put("subject", trimmed);
        }

        double maxMarks = data.get("max_marks") != null ? asDouble(data.get("max_marks"))
                : (data.get("total_marks") != null ? asDouble(data.get("total_marks")) : 100);
        data.put("max_marks", maxMarks);
        data.put("total_marks", data.get("total_marks") != null ? asDouble(data.get("total_marks")) : maxMarks);

        if (componentScoresRaw instanceof List<?> rawList && !rawList.isEmpty()) {
            List<Map<String, Object>> normalizedScores = new ArrayList<>();
            int index = 1;
            for (Object item : rawList) {
                Map<String, Object> score = (Map<String, Object>) item;
                String componentName = score.get("component_name") == null ? "" : score.get("component_name").toString().trim();
                if (componentName.isEmpty()) {
                    index++;
                    continue;
                }
                Map<String, Object> normalized = new LinkedHashMap<>();
                normalized.put("exam_component_id", asLong(score.get("exam_component_id")));
                normalized.put("component_name", componentName);
                normalized.put("marks_obtained", asDouble(score.getOrDefault("marks_obtained", 0)));
                normalized.put("max_marks", asDouble(score.getOrDefault("max_marks", 0)));
                normalized.put("sort_order", score.get("sort_order") != null ? asLong(score.get("sort_order")).intValue() : index);
                normalized.put("remarks", score.get("remarks"));
                normalizedScores.add(normalized);
                index++;
            }

            for (Map<String, Object> score : normalizedScores) {
                double scoreMax = (double) score.get("max_marks");
                double scoreObtained = (double) score.get("marks_obtained");
                String name = (String) score.get("component_name");
                if (scoreMax <= 0) throw ApiException.badRequest(name + " maximum marks must be greater than 0");
                if (scoreObtained < 0) throw ApiException.badRequest(name + " marks cannot be negative");
                if (scoreObtained > scoreMax) throw ApiException.badRequest(name + " marks cannot be greater than its maximum marks");
            }

            if (!normalizedScores.isEmpty()) {
                data.put("component_scores", normalizedScores);
                double sumObtained = normalizedScores.stream().mapToDouble(s -> (double) s.get("marks_obtained")).sum();
                double sumMax = normalizedScores.stream().mapToDouble(s -> (double) s.get("max_marks")).sum();
                data.put("marks_obtained", sumObtained);
                data.put("max_marks", sumMax);
                data.put("total_marks", sumMax);
            }
        } else if (componentScoresRaw != null) {
            data.put("component_scores", componentScoresRaw);
        }

        return data;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castComponentScores(Object value) {
        if (value == null) return null;
        return (List<Map<String, Object>>) value;
    }

    private void saveComponentScores(Mark mark, List<Map<String, Object>> componentScores) {
        if (componentScores == null) {
            return;
        }
        for (MarkComponentScore existing : markComponentScoreRepository.findByMarkId(mark.getId())) {
            markComponentScoreRepository.delete(existing);
        }

        int index = 1;
        for (Map<String, Object> score : componentScores) {
            Long examComponentId = asLong(score.get("exam_component_id"));
            if (examComponentId != null) {
                ExamComponent component = examComponentRepository.findById(examComponentId).orElse(null);
                if (component == null || !component.getExamId().equals(mark.getExamId())) {
                    throw ApiException.badRequest("Exam component does not belong to selected exam");
                }
            }

            MarkComponentScore entity = new MarkComponentScore();
            entity.setMarkId(mark.getId());
            entity.setExamComponentId(examComponentId);
            entity.setComponentName((String) score.get("component_name"));
            entity.setMarksObtained(asDouble(score.get("marks_obtained")));
            entity.setMaxMarks(asDouble(score.get("max_marks")));
            Object sortOrder = score.get("sort_order");
            entity.setSortOrder(sortOrder != null ? asLong(sortOrder).intValue() : index);
            entity.setRemarks((String) score.get("remarks"));
            markComponentScoreRepository.save(entity);
            index++;
        }
    }

    private void validateSubjectMapping(Student student, Map<String, Object> data) {
        Long classSubjectId = asLong(data.get("class_subject_id"));
        if (classSubjectId == null) return;

        ClassSubject classSubject = classSubjectRepository.findById(classSubjectId)
                .orElseThrow(() -> ApiException.notFound("Class subject mapping not found"));

        Long studentClassId = student.getClassId();
        if (studentClassId != null && !studentClassId.equals(classSubject.getClassId())) {
            throw ApiException.badRequest("Subject is not mapped to this student's class");
        }
        Object academicYear = data.get("academic_year");
        if (academicYear != null && !academicYear.toString().equals(classSubject.getAcademicYear())) {
            throw ApiException.badRequest("Subject is not mapped for the selected academic year");
        }
    }

    private void validateExamMapping(Student student, Map<String, Object> data) {
        Long classId = student.getClassId();
        Object academicYear = data.get("academic_year");
        if (classId == null || academicYear == null) return;

        Long examId = asLong(data.get("exam_id"));
        boolean mapped = classExamMappingRepository.findAll().stream().anyMatch(m ->
                classId.equals(m.getClassId()) && examId.equals(m.getExamId())
                        && academicYear.toString().equals(m.getAcademicYear()) && m.isActive());
        if (!mapped) {
            throw ApiException.badRequest("Exam is not mapped to this student's class for the academic year");
        }
    }

    private String calculateGrade(double marksObtained, double totalMarks) {
        double percentage = (marksObtained / totalMarks) * 100;
        SchoolSettings settings = getOrCreateSchoolSettings();
        String gradeRules = settings.getGradeRules() != null ? settings.getGradeRules()
                : "A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39";

        for (String rule : gradeRules.split(",")) {
            String[] parts = rule.split(":");
            if (parts.length != 2) continue;
            String[] range = parts[1].split("-");
            if (range.length != 2) continue;
            try {
                double min = Double.parseDouble(range[0]);
                double max = Double.parseDouble(range[1]);
                if (percentage >= min && percentage <= max) {
                    return parts[0].trim();
                }
            } catch (NumberFormatException ignored) {
                // matches Python's except ValueError: continue
            }
        }

        double passPercentage = settings.getPassPercentage() != null ? settings.getPassPercentage() : 40;
        return percentage < passPercentage ? "F" : "Pass";
    }

    private SchoolSettings getOrCreateSchoolSettings() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (!all.isEmpty()) {
            return all.get(0);
        }
        SchoolSettings settings = new SchoolSettings();
        settings.setSchoolName("International School");
        settings.setPassPercentage(40.0);
        settings.setGradeRules("A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39");
        return schoolSettingsRepository.save(settings);
    }

    private Map<String, Object> markResponse(Mark mark) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", mark.getId());
        body.put("student_id", mark.getStudentId());
        body.put("exam_id", mark.getExamId());
        body.put("class_subject_id", mark.getClassSubjectId());
        body.put("subject_name", mark.getSubjectName());
        body.put("academic_year", mark.getAcademicYear());
        body.put("class_id", mark.getClassId());
        body.put("class_name_snapshot", mark.getClassNameSnapshot());
        body.put("section_snapshot", mark.getSectionSnapshot());
        body.put("exam_name_snapshot", mark.getExamNameSnapshot());
        body.put("subject", mark.getSubject());
        body.put("marks_obtained", mark.getMarksObtained());
        body.put("max_marks", mark.getMaxMarks());
        body.put("total_marks", mark.getTotalMarks());
        body.put("grade", mark.getGrade());
        body.put("remarks", mark.getRemarks());

        List<Map<String, Object>> scores = markComponentScoreRepository.findByMarkId(mark.getId()).stream()
                .sorted(Comparator.comparing(MarkComponentScore::getSortOrder, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(MarkComponentScore::getId))
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", s.getId());
                    m.put("mark_id", s.getMarkId());
                    m.put("exam_component_id", s.getExamComponentId());
                    m.put("component_name", s.getComponentName());
                    m.put("marks_obtained", s.getMarksObtained());
                    m.put("max_marks", s.getMaxMarks());
                    m.put("sort_order", s.getSortOrder());
                    m.put("remarks", s.getRemarks());
                    return m;
                })
                .toList();
        body.put("component_scores", scores);
        return body;
    }

    private static boolean isBlank(Object value) {
        return value == null || value.toString().isBlank();
    }

    private static Long asLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.longValue();
        String s = value.toString();
        return s.isBlank() ? null : Long.valueOf(Double.valueOf(s).longValue());
    }

    private static double asDouble(Object value) {
        if (value == null) return 0;
        if (value instanceof Number n) return n.doubleValue();
        String s = value.toString();
        return s.isBlank() ? 0 : Double.parseDouble(s);
    }
}
