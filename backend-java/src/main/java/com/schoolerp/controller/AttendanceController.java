package com.schoolerp.controller;

import com.schoolerp.dto.attendance.AttendanceCreate;
import com.schoolerp.entity.Attendance;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.AttendanceRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/attendance.py. */
@RestController
@RequestMapping("/attendance")
public class AttendanceController {

    private static final List<String> VALID_STATUSES = List.of("Present", "Absent", "Late", "Half Day", "Excused");

    private final AttendanceRepository attendanceRepository;
    private final StudentRepository studentRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final PermissionService permissionService;

    public AttendanceController(
            AttendanceRepository attendanceRepository,
            StudentRepository studentRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            PermissionService permissionService
    ) {
        this.attendanceRepository = attendanceRepository;
        this.studentRepository = studentRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public Attendance markAttendance(@Valid @RequestBody AttendanceCreate payload) {
        permissionService.requireRoles("Admin", "Teacher");

        Student student = studentRepository.findById(payload.getStudentId())
                .orElseThrow(() -> ApiException.notFound("Student not found"));

        if (!VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid status. Allowed: " + String.join(", ", VALID_STATUSES));
        }

        attendanceRepository.findByStudentIdAndAttendanceDate(payload.getStudentId(), payload.getAttendanceDate())
                .ifPresent(existing -> { throw ApiException.badRequest("Attendance already marked for this student on this date"); });

        Attendance attendance = new Attendance();
        attendance.setStudentId(payload.getStudentId());
        attendance.setAttendanceDate(payload.getAttendanceDate());
        attendance.setAcademicYear(payload.getAcademicYear() != null ? payload.getAcademicYear() : defaultAcademicYear());
        attendance.setClassId(payload.getClassId() != null ? payload.getClassId() : student.getClassId());
        attendance.setClassNameSnapshot(payload.getClassNameSnapshot() != null ? payload.getClassNameSnapshot() : student.getClassName());
        attendance.setSectionSnapshot(payload.getSectionSnapshot() != null ? payload.getSectionSnapshot() : student.getSection());
        attendance.setStatus(payload.getStatus());
        attendance.setRemarks(payload.getRemarks());

        return attendanceRepository.save(attendance);
    }

    @GetMapping({"", "/"})
    public List<Attendance> getAttendance(@RequestParam(name = "academic_year", required = false) String academicYear) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return attendanceRepository.findAll().stream()
                .filter(a -> academicYear == null || academicYear.equals(a.getAcademicYear()))
                .sorted(Comparator.comparing(Attendance::getAttendanceDate, Comparator.nullsLast(Comparator.naturalOrder()))
                        .reversed()
                        .thenComparing(Comparator.comparing(Attendance::getId).reversed()))
                .toList();
    }

    @GetMapping("/student/{studentId}")
    public List<Attendance> getStudentAttendance(@PathVariable Long studentId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        if (!studentRepository.existsById(studentId)) {
            throw ApiException.notFound("Student not found");
        }
        return attendanceRepository.findByStudentId(studentId).stream()
                .sorted(Comparator.comparing(Attendance::getAttendanceDate, Comparator.nullsLast(Comparator.naturalOrder()))
                        .reversed()
                        .thenComparing(Comparator.comparing(Attendance::getId).reversed()))
                .toList();
    }

    @GetMapping("/metadata/statuses")
    public Map<String, List<String>> getAttendanceStatuses() {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return Map.of("statuses", VALID_STATUSES);
    }

    @GetMapping("/{attendanceId}")
    public Attendance getAttendanceById(@PathVariable Long attendanceId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return attendanceRepository.findById(attendanceId).orElseThrow(() -> ApiException.notFound("Attendance record not found"));
    }

    @PutMapping("/{attendanceId}")
    public Attendance updateAttendance(@PathVariable Long attendanceId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Teacher");

        Attendance record = attendanceRepository.findById(attendanceId)
                .orElseThrow(() -> ApiException.notFound("Attendance record not found"));

        if (updateData.containsKey("status") && updateData.get("status") != null) {
            String status = updateData.get("status").toString();
            if (!VALID_STATUSES.contains(status)) {
                throw ApiException.badRequest("Invalid status. Allowed: " + String.join(", ", VALID_STATUSES));
            }
        }
        if (updateData.containsKey("student_id")) {
            throw ApiException.badRequest("Student cannot be changed for an existing attendance record");
        }

        Student student = studentRepository.findById(record.getStudentId())
                .orElseThrow(() -> ApiException.notFound("Student not found"));

        if (updateData.containsKey("attendance_date") && updateData.get("attendance_date") != null) {
            record.setAttendanceDate(LocalDate.parse(updateData.get("attendance_date").toString()));
        }
        if (updateData.containsKey("status") && updateData.get("status") != null) {
            record.setStatus(updateData.get("status").toString());
        }
        if (updateData.containsKey("remarks")) {
            record.setRemarks(updateData.get("remarks") == null ? null : updateData.get("remarks").toString());
        }

        String newAcademicYear = stringOrNull(updateData.get("academic_year"));
        record.setAcademicYear(newAcademicYear != null ? newAcademicYear
                : (record.getAcademicYear() != null ? record.getAcademicYear() : defaultAcademicYear()));

        Object newClassId = updateData.get("class_id");
        record.setClassId(newClassId != null ? Long.valueOf(newClassId.toString())
                : (record.getClassId() != null ? record.getClassId() : student.getClassId()));

        String newClassName = stringOrNull(updateData.get("class_name_snapshot"));
        record.setClassNameSnapshot(newClassName != null ? newClassName
                : (record.getClassNameSnapshot() != null ? record.getClassNameSnapshot() : student.getClassName()));

        String newSection = stringOrNull(updateData.get("section_snapshot"));
        record.setSectionSnapshot(newSection != null ? newSection
                : (record.getSectionSnapshot() != null ? record.getSectionSnapshot() : student.getSection()));

        return attendanceRepository.save(record);
    }

    @DeleteMapping("/{attendanceId}")
    public Map<String, String> deleteAttendance(@PathVariable Long attendanceId) {
        permissionService.requireRoles("Admin");
        Attendance record = attendanceRepository.findById(attendanceId)
                .orElseThrow(() -> ApiException.notFound("Attendance record not found"));
        attendanceRepository.delete(record);
        return Map.of("message", "Attendance record deleted successfully");
    }

    private String stringOrNull(Object value) {
        return value == null ? null : value.toString();
    }

    private String defaultAcademicYear() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        return all.isEmpty() ? null : all.get(0).getAcademicYear();
    }
}
