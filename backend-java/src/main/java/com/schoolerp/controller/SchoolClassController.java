package com.schoolerp.controller;

import com.schoolerp.dto.schoolclass.SchoolClassCreate;
import com.schoolerp.entity.SchoolClass;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.entity.Teacher;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.SchoolClassRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.repository.TeacherRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/classes.py. */
@RestController
@RequestMapping("/classes")
public class SchoolClassController {

    private final SchoolClassRepository schoolClassRepository;
    private final TeacherRepository teacherRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final PermissionService permissionService;

    public SchoolClassController(
            SchoolClassRepository schoolClassRepository,
            TeacherRepository teacherRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            PermissionService permissionService
    ) {
        this.schoolClassRepository = schoolClassRepository;
        this.teacherRepository = teacherRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public SchoolClass createClass(@Valid @RequestBody SchoolClassCreate payload) {
        schoolClassRepository.findByClassNameAndSection(payload.getClassName(), payload.getSection())
                .ifPresent(existing -> { throw ApiException.badRequest("Class with this section already exists"); });

        SchoolClass schoolClass = new SchoolClass();
        schoolClass.setClassName(payload.getClassName());
        schoolClass.setSection(payload.getSection());
        schoolClass.setRoomNumber(payload.getRoomNo());
        schoolClass = schoolClassRepository.save(schoolClass);

        if (payload.getClassTeacherId() != null) {
            assignClassTeacher(schoolClass, payload.getClassTeacherId());
            schoolClass = schoolClassRepository.save(schoolClass);
        }

        return schoolClass;
    }

    @GetMapping({"", "/"})
    public List<SchoolClass> getClasses() {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return schoolClassRepository.findAllByOrderByClassNameAscSectionAsc();
    }

    @GetMapping("/{classId}")
    public SchoolClass getClass(@PathVariable Long classId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return schoolClassRepository.findById(classId).orElseThrow(() -> ApiException.notFound("Class not found"));
    }

    @PutMapping("/{classId}")
    public SchoolClass updateClass(@PathVariable Long classId, @Valid @RequestBody SchoolClassCreate payload) {
        SchoolClass schoolClass = schoolClassRepository.findById(classId).orElseThrow(() -> ApiException.notFound("Class not found"));

        schoolClassRepository.findByClassNameAndSection(payload.getClassName(), payload.getSection()).ifPresent(dup -> {
            if (!dup.getId().equals(classId)) {
                throw ApiException.badRequest("Class with this section already exists");
            }
        });

        Long oldTeacherId = schoolClass.getClassTeacherId();

        schoolClass.setClassName(payload.getClassName());
        schoolClass.setSection(payload.getSection());
        schoolClass.setRoomNumber(payload.getRoomNo());

        if (oldTeacherId != null && !oldTeacherId.equals(payload.getClassTeacherId())) {
            teacherRepository.findById(oldTeacherId).ifPresent(oldTeacher -> {
                oldTeacher.setClassId(null);
                teacherRepository.save(oldTeacher);
            });
        }

        if (payload.getClassTeacherId() != null) {
            assignClassTeacher(schoolClass, payload.getClassTeacherId());
        } else {
            schoolClass.setClassTeacherId(null);
            schoolClass.setClassTeacher(null);
        }

        return schoolClassRepository.save(schoolClass);
    }

    @DeleteMapping("/{classId}")
    public Map<String, String> deleteClass(@PathVariable Long classId) {
        permissionService.requireRoles("Admin");
        SchoolClass schoolClass = schoolClassRepository.findById(classId).orElseThrow(() -> ApiException.notFound("Class not found"));
        schoolClassRepository.delete(schoolClass);
        return Map.of("message", "Class deleted successfully");
    }

    @GetMapping("/metadata/sections")
    public Map<String, List<String>> getSections() {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return Map.of("sections", getAllowedSections());
    }

    private void assignClassTeacher(SchoolClass schoolClass, Long classTeacherId) {
        Teacher teacher = teacherRepository.findById(classTeacherId)
                .filter(Teacher::isClassTeacher)
                .orElseThrow(() -> ApiException.badRequest("Selected teacher is not marked as Class Teacher"));

        for (SchoolClass oldClass : schoolClassRepository.findByClassTeacherId(teacher.getId())) {
            if (!oldClass.getId().equals(schoolClass.getId())) {
                oldClass.setClassTeacherId(null);
                oldClass.setClassTeacher(null);
                schoolClassRepository.save(oldClass);
            }
        }

        schoolClass.setClassTeacherId(teacher.getId());
        schoolClass.setClassTeacher(classTeacherLabel(teacher));

        teacher.setClassTeacher(true);
        teacher.setClassId(schoolClass.getId());
        teacherRepository.save(teacher);
    }

    private String classTeacherLabel(Teacher teacher) {
        String name = teacher.getName() != null ? teacher.getName() : "Unknown Teacher";
        String department = teacher.getDepartment() != null ? teacher.getDepartment() : "No Department";
        return name + " : " + department;
    }

    private List<String> getAllowedSections() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (all.isEmpty() || all.get(0).getDefaultSections() == null) {
            return List.of("A", "B", "C");
        }
        return Arrays.stream(all.get(0).getDefaultSections().split(","))
                .map(String::trim)
                .toList();
    }
}
