package com.schoolerp.controller;

import com.schoolerp.entity.Exam;
import com.schoolerp.entity.SchoolClass;
import com.schoolerp.entity.Student;
import com.schoolerp.entity.Teacher;
import com.schoolerp.repository.ExamRepository;
import com.schoolerp.repository.SchoolClassRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.repository.TeacherRepository;
import com.schoolerp.security.PermissionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Direct port of backend/app/routes/search.py. */
@RestController
@RequestMapping("/search")
public class SearchController {

    private static final int RESULTS_PER_MODULE = 6;

    private final StudentRepository studentRepository;
    private final TeacherRepository teacherRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final ExamRepository examRepository;
    private final PermissionService permissionService;

    public SearchController(
            StudentRepository studentRepository,
            TeacherRepository teacherRepository,
            SchoolClassRepository schoolClassRepository,
            ExamRepository examRepository,
            PermissionService permissionService
    ) {
        this.studentRepository = studentRepository;
        this.teacherRepository = teacherRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.examRepository = examRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public Map<String, Object> globalSearch(@RequestParam(defaultValue = "") String q) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");

        String query = q.strip();
        if (query.length() < 2) {
            return Map.of("results", List.of());
        }

        String needle = query.toLowerCase(Locale.ROOT);
        List<Map<String, Object>> results = new ArrayList<>();

        studentRepository.findAll().stream()
                .filter(s -> contains(s.getFirstName(), needle) || contains(s.getLastName(), needle) || contains(s.getAdmissionNo(), needle))
                .limit(RESULTS_PER_MODULE)
                .forEach(s -> {
                    String name = ((s.getFirstName() != null ? s.getFirstName() : "") + " " + (s.getLastName() != null ? s.getLastName() : "")).trim();
                    if (name.isEmpty()) {
                        name = "Unnamed Student";
                    }
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("group", "Students");
                    row.put("id", s.getId());
                    row.put("label", name);
                    row.put("subtitle", s.getAdmissionNo() != null ? s.getAdmissionNo() : "");
                    row.put("path", "/students/" + s.getId());
                    results.add(row);
                });

        teacherRepository.findAll().stream()
                .filter(t -> contains(t.getName(), needle) || contains(t.getEmployeeNo(), needle))
                .limit(RESULTS_PER_MODULE)
                .forEach(t -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("group", "Teachers");
                    row.put("id", t.getId());
                    row.put("label", t.getName() != null ? t.getName() : "Unnamed Teacher");
                    row.put("subtitle", t.getEmployeeNo() != null ? t.getEmployeeNo() : (t.getDepartment() != null ? t.getDepartment() : ""));
                    row.put("path", "/teachers");
                    results.add(row);
                });

        schoolClassRepository.findAll().stream()
                .filter(c -> contains(c.getClassName(), needle) || contains(c.getSection(), needle))
                .limit(RESULTS_PER_MODULE)
                .forEach(c -> {
                    String label = c.getSection() != null && !c.getSection().isBlank()
                            ? c.getClassName() + " - " + c.getSection()
                            : c.getClassName();
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("group", "Classes");
                    row.put("id", c.getId());
                    row.put("label", label);
                    row.put("subtitle", c.getClassTeacher() != null ? c.getClassTeacher() : "");
                    row.put("path", "/classes/" + c.getId());
                    results.add(row);
                });

        examRepository.findAll().stream()
                .filter(e -> contains(e.getExamName(), needle))
                .limit(RESULTS_PER_MODULE)
                .forEach(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("group", "Exams");
                    row.put("id", e.getId());
                    row.put("label", e.getExamName());
                    row.put("subtitle", e.getAcademicYear() != null ? e.getAcademicYear() : "");
                    row.put("path", "/exams");
                    results.add(row);
                });

        return Map.of("results", results);
    }

    private boolean contains(String value, String needle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(needle);
    }
}
