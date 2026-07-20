package com.schoolerp.controller;

import com.schoolerp.dto.academicyear.AcademicYearCreate;
import com.schoolerp.entity.AcademicYear;
import com.schoolerp.entity.MasterData;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.AcademicYearRepository;
import com.schoolerp.repository.MasterDataRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.repository.StudentEnrollmentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/academic_years.py. */
@RestController
@RequestMapping("/academic-years")
public class AcademicYearController {

    private final AcademicYearRepository academicYearRepository;
    private final MasterDataRepository masterDataRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final StudentEnrollmentRepository studentEnrollmentRepository;
    private final PermissionService permissionService;

    public AcademicYearController(
            AcademicYearRepository academicYearRepository,
            MasterDataRepository masterDataRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            StudentEnrollmentRepository studentEnrollmentRepository,
            PermissionService permissionService
    ) {
        this.academicYearRepository = academicYearRepository;
        this.masterDataRepository = masterDataRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.studentEnrollmentRepository = studentEnrollmentRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<AcademicYear> listAcademicYears() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return academicYearRepository.findAllByOrderByNameDesc();
    }

    @GetMapping("/current")
    public AcademicYear getCurrentAcademicYear() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return academicYearRepository.findAll().stream()
                .filter(AcademicYear::isCurrent)
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("No current academic year is set"));
    }

    @PostMapping({"", "/"})
    public AcademicYear createAcademicYear(@Valid @RequestBody AcademicYearCreate payload) {
        permissionService.requireRoles("Admin", "Principal");

        String name = payload.getName().trim();
        if (name.isEmpty()) {
            throw ApiException.badRequest("Name is required");
        }
        if (academicYearRepository.findByName(name).isPresent()) {
            throw ApiException.badRequest("Academic year with this name already exists");
        }
        if (payload.getStartDate() != null && payload.getEndDate() != null && !payload.getEndDate().isAfter(payload.getStartDate())) {
            throw ApiException.badRequest("End date must be after start date");
        }

        AcademicYear year = new AcademicYear();
        year.setName(name);
        year.setStartDate(payload.getStartDate());
        year.setEndDate(payload.getEndDate());
        year.setRemarks(payload.getRemarks());
        year.setStatus("Upcoming");
        year.setCurrent(false);

        year = academicYearRepository.save(year);
        syncMasterData(name);
        return year;
    }

    @PutMapping("/{yearId}")
    public AcademicYear updateAcademicYear(@PathVariable Long yearId, @RequestBody Map<String, Object> payload) {
        permissionService.requireRoles("Admin", "Principal");

        AcademicYear year = getYearOr404(yearId);
        if ("Closed".equals(year.getStatus())) {
            throw ApiException.badRequest("Closed academic years cannot be edited");
        }

        if (payload.containsKey("name") && payload.get("name") != null) {
            String name = payload.get("name").toString().trim();
            if (name.isEmpty()) {
                throw ApiException.badRequest("Name cannot be empty");
            }
            academicYearRepository.findByName(name).ifPresent(dup -> {
                if (!dup.getId().equals(yearId)) {
                    throw ApiException.badRequest("Academic year with this name already exists");
                }
            });
            year.setName(name);
            syncMasterData(name);
        }
        if (payload.containsKey("start_date") && payload.get("start_date") != null) {
            year.setStartDate(java.time.LocalDate.parse(payload.get("start_date").toString()));
        }
        if (payload.containsKey("end_date") && payload.get("end_date") != null) {
            year.setEndDate(java.time.LocalDate.parse(payload.get("end_date").toString()));
        }
        if (payload.containsKey("remarks") && payload.get("remarks") != null) {
            year.setRemarks(payload.get("remarks").toString());
        }

        if (year.getStartDate() != null && year.getEndDate() != null && !year.getEndDate().isAfter(year.getStartDate())) {
            throw ApiException.badRequest("End date must be after start date");
        }

        year.setUpdatedAt(LocalDateTime.now());
        return academicYearRepository.save(year);
    }

    @PostMapping("/{yearId}/set-current")
    public AcademicYear setCurrentAcademicYear(@PathVariable Long yearId) {
        permissionService.requireRoles("Admin", "Principal");

        AcademicYear year = getYearOr404(yearId);
        if ("Closed".equals(year.getStatus())) {
            throw ApiException.badRequest("A closed academic year cannot be set as current");
        }

        for (AcademicYear other : academicYearRepository.findAll()) {
            if (!other.getId().equals(yearId)) {
                boolean changed = false;
                if (other.isCurrent()) {
                    other.setCurrent(false);
                    changed = true;
                }
                if ("Active".equals(other.getStatus())) {
                    other.setStatus("Upcoming");
                    changed = true;
                }
                if (changed) {
                    academicYearRepository.save(other);
                }
            }
        }

        year.setCurrent(true);
        year.setStatus("Active");
        year.setUpdatedAt(LocalDateTime.now());
        year = academicYearRepository.save(year);

        List<SchoolSettings> settingsList = schoolSettingsRepository.findAll();
        if (!settingsList.isEmpty()) {
            SchoolSettings settings = settingsList.get(0);
            settings.setAcademicYear(year.getName());
            schoolSettingsRepository.save(settings);
        }

        return year;
    }

    @PostMapping("/{yearId}/close")
    public AcademicYear closeAcademicYear(
            @PathVariable Long yearId,
            @RequestParam(required = false, defaultValue = "false") boolean force
    ) {
        permissionService.requireRoles("Admin", "Principal");

        AcademicYear year = getYearOr404(yearId);
        if ("Closed".equals(year.getStatus())) {
            throw ApiException.badRequest("Academic year is already closed");
        }

        long pending = studentEnrollmentRepository.findByAcademicYearAndEnrollmentStatus(year.getName(), "Active").size();
        if (pending > 0 && !force) {
            throw ApiException.badRequest(pending + " active enrollment(s) still exist for " + year.getName()
                    + ". Run Year-End Processing first, or pass force=true to close anyway.");
        }

        year.setStatus("Closed");
        year.setCurrent(false);
        year.setUpdatedAt(LocalDateTime.now());
        return academicYearRepository.save(year);
    }

    @DeleteMapping("/{yearId}")
    public Map<String, String> deleteAcademicYear(@PathVariable Long yearId) {
        permissionService.requireRoles("Admin");

        AcademicYear year = getYearOr404(yearId);
        long inUse = studentEnrollmentRepository.findByAcademicYear(year.getName()).size();
        if (inUse > 0) {
            throw ApiException.badRequest("Cannot delete: enrollments exist for this academic year");
        }

        academicYearRepository.delete(year);
        return Map.of("message", "Academic year deleted");
    }

    private AcademicYear getYearOr404(Long yearId) {
        return academicYearRepository.findById(yearId).orElseThrow(() -> ApiException.notFound("Academic year not found"));
    }

    /** Keep MasterData AcademicYear entries in sync so existing validate_academic_year checks keep working. */
    private void syncMasterData(String name) {
        MasterData existing = masterDataRepository.findByCategoryAndValue("AcademicYear", name).orElse(null);
        if (existing != null) {
            if (!existing.isActive()) {
                existing.setActive(true);
                masterDataRepository.save(existing);
            }
            return;
        }
        MasterData item = new MasterData();
        item.setCategory("AcademicYear");
        item.setValue(name);
        item.setActive(true);
        masterDataRepository.save(item);
    }
}
