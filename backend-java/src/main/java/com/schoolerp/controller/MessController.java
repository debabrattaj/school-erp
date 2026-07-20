package com.schoolerp.controller;

import com.schoolerp.dto.mess.MessAttendanceCreate;
import com.schoolerp.dto.mess.MessMenuCreate;
import com.schoolerp.entity.MessAttendance;
import com.schoolerp.entity.MessMenu;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.MessAttendanceRepository;
import com.schoolerp.repository.MessMenuRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/mess.py. */
@RestController
@RequestMapping("/mess")
public class MessController {

    private final MessMenuRepository menuRepository;
    private final MessAttendanceRepository attendanceRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public MessController(
            MessMenuRepository menuRepository,
            MessAttendanceRepository attendanceRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.menuRepository = menuRepository;
        this.attendanceRepository = attendanceRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    // ===================== menus =====================

    @GetMapping("/menus/")
    public List<MessMenu> getMenus(
            @RequestParam(name = "menu_date", required = false) LocalDate menuDate,
            @RequestParam(name = "meal_type", required = false) String mealType
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return menuRepository.findAll().stream()
                .filter(m -> menuDate == null || menuDate.equals(m.getMenuDate()))
                .filter(m -> mealType == null || mealType.equals(m.getMealType()))
                .sorted(Comparator.comparing(MessMenu::getMenuDate).reversed()
                        .thenComparing(MessMenu::getMealType))
                .toList();
    }

    @PostMapping("/menus/")
    public MessMenu createMenu(@Valid @RequestBody MessMenuCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        if (payload.getMenuItems() == null || payload.getMenuItems().trim().isEmpty()) {
            throw ApiException.badRequest("Menu items are required");
        }
        requireNoMenuClash(payload.getMenuDate(), payload.getMealType(), null);

        MessMenu menu = new MessMenu();
        applyMenuPayload(menu, payload);

        return menuRepository.save(menu);
    }

    @PutMapping("/menus/{menuId}")
    public MessMenu updateMenu(@PathVariable Long menuId, @Valid @RequestBody MessMenuCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        MessMenu menu = requireMenu(menuId);
        if (payload.getMenuItems() == null || payload.getMenuItems().trim().isEmpty()) {
            throw ApiException.badRequest("Menu items are required");
        }
        requireNoMenuClash(payload.getMenuDate(), payload.getMealType(), menuId);

        applyMenuPayload(menu, payload);

        return menuRepository.save(menu);
    }

    @DeleteMapping("/menus/{menuId}")
    public Map<String, String> deleteMenu(@PathVariable Long menuId) {
        permissionService.requireRoles("Admin");
        MessMenu menu = requireMenu(menuId);
        menuRepository.delete(menu);
        return Map.of("message", "Mess menu deleted successfully");
    }

    // ===================== attendance =====================

    @GetMapping("/attendance/")
    public List<Map<String, Object>> getAttendance(
            @RequestParam(name = "meal_date", required = false) LocalDate mealDate,
            @RequestParam(name = "meal_type", required = false) String mealType,
            @RequestParam(required = false) String status
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return attendanceRepository.findAll().stream()
                .filter(a -> mealDate == null || mealDate.equals(a.getMealDate()))
                .filter(a -> mealType == null || mealType.equals(a.getMealType()))
                .filter(a -> status == null || status.equals(a.getStatus()))
                .sorted(Comparator.comparing(MessAttendance::getMealDate).reversed()
                        .thenComparing(Comparator.comparing(MessAttendance::getId).reversed()))
                .map(this::serializeAttendance)
                .toList();
    }

    @PostMapping("/attendance/")
    public Map<String, Object> createAttendance(@Valid @RequestBody MessAttendanceCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        requireStudent(payload.getStudentId());
        requireNoAttendanceClash(payload.getStudentId(), payload.getMealDate(), payload.getMealType(), null);

        MessAttendance record = new MessAttendance();
        applyAttendancePayload(record, payload);

        return serializeAttendance(attendanceRepository.save(record));
    }

    @PutMapping("/attendance/{attendanceId}")
    public Map<String, Object> updateAttendance(@PathVariable Long attendanceId, @Valid @RequestBody MessAttendanceCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        MessAttendance record = requireAttendance(attendanceId);
        requireStudent(payload.getStudentId());
        requireNoAttendanceClash(payload.getStudentId(), payload.getMealDate(), payload.getMealType(), attendanceId);

        applyAttendancePayload(record, payload);

        return serializeAttendance(attendanceRepository.save(record));
    }

    @DeleteMapping("/attendance/{attendanceId}")
    public Map<String, String> deleteAttendance(@PathVariable Long attendanceId) {
        permissionService.requireRoles("Admin");
        MessAttendance record = requireAttendance(attendanceId);
        attendanceRepository.delete(record);
        return Map.of("message", "Mess attendance deleted successfully");
    }

    // ===================== helpers =====================

    private void applyMenuPayload(MessMenu menu, MessMenuCreate payload) {
        menu.setMenuDate(payload.getMenuDate());
        menu.setMealType(payload.getMealType());
        menu.setMenuItems(payload.getMenuItems());
        menu.setNutritionNotes(payload.getNutritionNotes());
        menu.setAllergenNotes(payload.getAllergenNotes());
        menu.setIsPublished(payload.getIsPublished());
        menu.setRemarks(payload.getRemarks());
    }

    private void applyAttendancePayload(MessAttendance record, MessAttendanceCreate payload) {
        record.setStudentId(payload.getStudentId());
        record.setMealDate(payload.getMealDate());
        record.setMealType(payload.getMealType());
        record.setStatus(payload.getStatus());
        record.setRemarks(payload.getRemarks());
    }

    private void requireNoMenuClash(LocalDate menuDate, String mealType, Long excludeId) {
        menuRepository.findByMenuDateAndMealType(menuDate, mealType).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Menu already exists for this date and meal");
            }
        });
    }

    private void requireNoAttendanceClash(Long studentId, LocalDate mealDate, String mealType, Long excludeId) {
        attendanceRepository.findByStudentIdAndMealDateAndMealType(studentId, mealDate, mealType).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Attendance already exists for this student and meal");
            }
        });
    }

    private void requireStudent(Long id) {
        if (id == null || !studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }

    private MessMenu requireMenu(Long id) {
        return menuRepository.findById(id).orElseThrow(() -> ApiException.notFound("Mess menu not found"));
    }

    private MessAttendance requireAttendance(Long id) {
        return attendanceRepository.findById(id).orElseThrow(() -> ApiException.notFound("Mess attendance not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serializeAttendance(MessAttendance record) {
        Student student = studentRepository.findById(record.getStudentId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", record.getId());
        body.put("student_id", record.getStudentId());
        body.put("meal_date", record.getMealDate());
        body.put("meal_type", record.getMealType());
        body.put("status", record.getStatus());
        body.put("remarks", record.getRemarks());
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_name", student != null ? student.getClassName() : null);
        body.put("section", student != null ? student.getSection() : null);
        return body;
    }
}
