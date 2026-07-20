package com.schoolerp.controller;

import com.schoolerp.dto.student.StudentCreate;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Direct port of backend/app/routes/students.py.
 *
 * Not yet ported: bulk-import / bulk-import-template (CSV import).
 */
@RestController
@RequestMapping("/students")
public class StudentController {

    private static final List<String> VALID_STATUSES = List.of("Active", "Graduated", "Transferred", "Suspended", "Alumni");
    private static final List<String> VALID_GENDERS = List.of("Male", "Female", "Other");

    private final StudentRepository studentRepository;
    private final PermissionService permissionService;
    private final NotificationService notificationService;

    public StudentController(StudentRepository studentRepository, PermissionService permissionService, NotificationService notificationService) {
        this.studentRepository = studentRepository;
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
