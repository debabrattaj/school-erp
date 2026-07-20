package com.schoolerp.controller;

import com.schoolerp.dto.teacher.TeacherCreate;
import com.schoolerp.entity.SchoolClass;
import com.schoolerp.entity.Teacher;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.SchoolClassRepository;
import com.schoolerp.repository.TeacherRepository;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Direct port of backend/app/routes/teachers.py. Deliberately has no auth
 * checks on any endpoint, matching the Python source exactly (it never calls
 * Depends(get_current_user) or require_roles anywhere).
 */
@RestController
@RequestMapping("/teachers")
public class TeacherController {

    private final TeacherRepository teacherRepository;
    private final SchoolClassRepository schoolClassRepository;

    public TeacherController(TeacherRepository teacherRepository, SchoolClassRepository schoolClassRepository) {
        this.teacherRepository = teacherRepository;
        this.schoolClassRepository = schoolClassRepository;
    }

    @GetMapping({"", "/"})
    public List<Teacher> getTeachers() {
        return teacherRepository.findAllByOrderByIdDesc();
    }

    @GetMapping("/{teacherId}")
    public Teacher getTeacher(@PathVariable Long teacherId) {
        return teacherRepository.findById(teacherId).orElseThrow(() -> ApiException.notFound("Teacher not found"));
    }

    @PostMapping({"", "/"})
    public Teacher createTeacher(@Valid @RequestBody TeacherCreate payload) {
        if (teacherRepository.findByEmployeeNo(payload.getEmployeeNo()).isPresent()) {
            throw ApiException.badRequest("Teacher with this Employee No already exists");
        }
        if (payload.getEmail() != null && teacherRepository.findByEmail(payload.getEmail()).isPresent()) {
            throw ApiException.badRequest("Duplicate or invalid teacher data");
        }

        boolean isClassTeacher = Boolean.TRUE.equals(payload.getIsClassTeacher());
        Teacher teacher = new Teacher();
        applyPayload(teacher, payload, isClassTeacher);

        if (isClassTeacher && teacher.getClassId() != null) {
            validateClassExists(teacher.getClassId());
        }

        try {
            teacher = teacherRepository.save(teacher);
            syncClassTeacherFromTeacher(teacher);
            teacher = teacherRepository.save(teacher);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("Duplicate or invalid teacher data");
        }

        return teacher;
    }

    @PutMapping("/{teacherId}")
    public Teacher updateTeacher(@PathVariable Long teacherId, @Valid @RequestBody TeacherCreate payload) {
        Teacher teacher = teacherRepository.findById(teacherId).orElseThrow(() -> ApiException.notFound("Teacher not found"));

        teacherRepository.findByEmployeeNo(payload.getEmployeeNo()).ifPresent(existing -> {
            if (!existing.getId().equals(teacherId)) {
                throw ApiException.badRequest("Teacher with this Employee No already exists");
            }
        });
        if (payload.getEmail() != null) {
            teacherRepository.findByEmail(payload.getEmail()).ifPresent(existing -> {
                if (!existing.getId().equals(teacherId)) {
                    throw ApiException.badRequest("Duplicate or invalid teacher data");
                }
            });
        }

        boolean isClassTeacher = Boolean.TRUE.equals(payload.getIsClassTeacher());
        applyPayload(teacher, payload, isClassTeacher);

        if (isClassTeacher && teacher.getClassId() != null) {
            validateClassExists(teacher.getClassId());
        }

        try {
            syncClassTeacherFromTeacher(teacher);
            teacher = teacherRepository.save(teacher);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("Duplicate or invalid teacher data");
        }

        return teacher;
    }

    @DeleteMapping("/{teacherId}")
    public Map<String, String> deleteTeacher(@PathVariable Long teacherId) {
        Teacher teacher = teacherRepository.findById(teacherId).orElseThrow(() -> ApiException.notFound("Teacher not found"));

        for (SchoolClass schoolClass : schoolClassRepository.findByClassTeacherId(teacherId)) {
            schoolClass.setClassTeacherId(null);
            schoolClass.setClassTeacher(null);
            schoolClassRepository.save(schoolClass);
        }

        teacherRepository.delete(teacher);
        return Map.of("message", "Teacher deleted successfully");
    }

    private void applyPayload(Teacher teacher, TeacherCreate payload, boolean isClassTeacher) {
        teacher.setEmployeeNo(payload.getEmployeeNo());
        teacher.setName(payload.getName());
        teacher.setEmail(payload.getEmail());
        teacher.setPhone(payload.getPhone());
        teacher.setGender(payload.getGender());
        teacher.setDepartment(payload.getDepartment());
        teacher.setSubject(payload.getSubject());
        teacher.setAssignedClass(payload.getAssignedClass());
        teacher.setQualification(payload.getQualification());
        teacher.setJoiningDate(payload.getJoiningDate());
        teacher.setEmploymentType(payload.getEmploymentType());
        teacher.setSalaryGrade(payload.getSalaryGrade());
        teacher.setPhotoUrl(payload.getPhotoUrl());
        teacher.setAddress(payload.getAddress());
        teacher.setClassTeacher(isClassTeacher);
        teacher.setClassId(isClassTeacher ? payload.getClassId() : null);
    }

    private String teacherDisplayName(Teacher teacher) {
        String name = teacher.getName() == null ? "" : teacher.getName();
        if (teacher.getEmployeeNo() != null && !teacher.getEmployeeNo().isBlank()) {
            return teacher.getEmployeeNo() + " - " + name;
        }
        return !name.isBlank() ? name : ("Teacher ID: " + teacher.getId());
    }

    private SchoolClass validateClassExists(Long classId) {
        return schoolClassRepository.findById(classId).orElseThrow(() -> ApiException.notFound("Selected class not found"));
    }

    /**
     * Sync rule: if this teacher is marked as class teacher with a class
     * selected, assign them to that class (bumping any previous class
     * teacher). If unchecked, remove any class assignment.
     */
    private void syncClassTeacherFromTeacher(Teacher teacher) {
        for (SchoolClass oldClass : schoolClassRepository.findByClassTeacherId(teacher.getId())) {
            if (!oldClass.getId().equals(teacher.getClassId())) {
                oldClass.setClassTeacherId(null);
                oldClass.setClassTeacher(null);
                schoolClassRepository.save(oldClass);
            }
        }

        if (teacher.isClassTeacher() && teacher.getClassId() != null) {
            SchoolClass schoolClass = validateClassExists(teacher.getClassId());

            if (schoolClass.getClassTeacherId() != null && !schoolClass.getClassTeacherId().equals(teacher.getId())) {
                teacherRepository.findById(schoolClass.getClassTeacherId()).ifPresent(oldTeacher -> {
                    oldTeacher.setClassTeacher(false);
                    oldTeacher.setClassId(null);
                    teacherRepository.save(oldTeacher);
                });
            }

            schoolClass.setClassTeacherId(teacher.getId());
            schoolClass.setClassTeacher(teacherDisplayName(teacher));
            schoolClassRepository.save(schoolClass);
        } else {
            teacher.setClassTeacher(false);
            teacher.setClassId(null);
        }
    }
}
