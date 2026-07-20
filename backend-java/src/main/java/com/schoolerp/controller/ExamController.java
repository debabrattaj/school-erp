package com.schoolerp.controller;

import com.schoolerp.dto.exam.ExamCreate;
import com.schoolerp.entity.Exam;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.ExamRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/exams.py. */
@RestController
@RequestMapping("/exams")
public class ExamController {

    private static final List<String> VALID_EXAM_NAMES = List.of(
            "Unit Test", "Mid Term Exam", "Final Term Exam", "Assessment",
            "Practical Exam", "Internal Assessment", "Board Exam", "Other"
    );

    private final ExamRepository examRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final PermissionService permissionService;

    public ExamController(ExamRepository examRepository, SchoolSettingsRepository schoolSettingsRepository, PermissionService permissionService) {
        this.examRepository = examRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public Exam createExam(@Valid @RequestBody ExamCreate payload) {
        permissionService.requireRoles("Admin", "Principal");

        boolean duplicate = examRepository.findAll().stream()
                .anyMatch(e -> payload.getExamName().equals(e.getExamName()));
        if (duplicate) {
            throw ApiException.badRequest("Exam master already exists with this name");
        }

        Exam exam = new Exam();
        exam.setExamName(payload.getExamName());
        exam.setExamType(payload.getExamType());
        exam.setClassName(payload.getClassName() != null ? payload.getClassName() : "");
        exam.setSection(payload.getSection() != null ? payload.getSection() : "");
        exam.setExamDate(payload.getExamDate() != null ? payload.getExamDate() : LocalDate.now());
        exam.setAcademicYear(payload.getAcademicYear() != null ? payload.getAcademicYear() : defaultAcademicYear());
        exam.setRemarks(payload.getRemarks());

        return examRepository.save(exam);
    }

    @GetMapping({"", "/"})
    public List<Exam> getExams(@RequestParam(name = "academic_year", required = false) String academicYear) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return examRepository.findAll().stream()
                .filter(e -> academicYear == null || academicYear.equals(e.getAcademicYear()))
                .sorted(Comparator.comparing(Exam::getExamDate, Comparator.nullsLast(Comparator.naturalOrder()))
                        .reversed()
                        .thenComparing(Comparator.comparing(Exam::getId).reversed()))
                .toList();
    }

    @GetMapping("/metadata/exam-names")
    public Map<String, List<String>> getExamNames() {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return Map.of("exam_names", VALID_EXAM_NAMES);
    }

    @GetMapping("/{examId}")
    public Exam getExam(@PathVariable Long examId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return examRepository.findById(examId).orElseThrow(() -> ApiException.notFound("Exam not found"));
    }

    @PutMapping("/{examId}")
    public Exam updateExam(@PathVariable Long examId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Principal");

        Exam exam = examRepository.findById(examId).orElseThrow(() -> ApiException.notFound("Exam not found"));

        if (updateData.containsKey("exam_name") && updateData.get("exam_name") != null) {
            String newName = updateData.get("exam_name").toString();
            boolean duplicate = examRepository.findAll().stream()
                    .anyMatch(e -> newName.equals(e.getExamName()) && !e.getId().equals(examId));
            if (duplicate) {
                throw ApiException.badRequest("Another exam master already exists with this name");
            }
            exam.setExamName(newName);
        }
        if (updateData.containsKey("exam_type")) {
            exam.setExamType(stringOrNull(updateData.get("exam_type")));
        }
        if (updateData.containsKey("class_name")) {
            Object v = updateData.get("class_name");
            exam.setClassName(v == null ? "" : v.toString());
        }
        if (updateData.containsKey("section")) {
            Object v = updateData.get("section");
            exam.setSection(v == null ? "" : v.toString());
        }
        if (updateData.containsKey("exam_date")) {
            Object v = updateData.get("exam_date");
            exam.setExamDate(v == null ? (exam.getExamDate() != null ? exam.getExamDate() : LocalDate.now()) : LocalDate.parse(v.toString()));
        }
        if (updateData.containsKey("academic_year")) {
            exam.setAcademicYear(stringOrNull(updateData.get("academic_year")));
        }
        if (updateData.containsKey("remarks")) {
            exam.setRemarks(stringOrNull(updateData.get("remarks")));
        }

        return examRepository.save(exam);
    }

    @DeleteMapping("/{examId}")
    public Map<String, String> deleteExam(@PathVariable Long examId) {
        permissionService.requireRoles("Admin");
        Exam exam = examRepository.findById(examId).orElseThrow(() -> ApiException.notFound("Exam not found"));
        examRepository.delete(exam);
        return Map.of("message", "Exam deleted successfully");
    }

    private String stringOrNull(Object value) {
        return value == null ? null : value.toString();
    }

    private String defaultAcademicYear() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        return all.isEmpty() ? null : all.get(0).getAcademicYear();
    }
}
