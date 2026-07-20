package com.schoolerp.controller;

import com.schoolerp.dto.masterdata.MasterDataCreate;
import com.schoolerp.entity.MasterData;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.MasterDataRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/master_data.py. */
@RestController
@RequestMapping("/master-data")
public class MasterDataController {

    private static final List<String> ALLOWED_CATEGORIES = List.of(
            "Class", "Exam", "Department", "Subject", "House", "Section", "FeeType",
            "AttendanceStatus", "ExamType", "EmploymentType", "Gender", "BloodGroup",
            "Nationality", "TransportRoute", "LibraryCategory", "InventoryCategory",
            "InventoryUnit", "SalaryGrade", "StudentStatus", "AcademicYear", "ResidentialType"
    );

    private final MasterDataRepository masterDataRepository;
    private final PermissionService permissionService;

    public MasterDataController(MasterDataRepository masterDataRepository, PermissionService permissionService) {
        this.masterDataRepository = masterDataRepository;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public MasterData createMasterData(@Valid @RequestBody MasterDataCreate payload) {
        permissionService.requireRoles("Admin");
        validateCategory(payload.getCategory());

        if (masterDataRepository.findByCategoryAndValue(payload.getCategory(), payload.getValue()).isPresent()) {
            throw ApiException.badRequest("This value already exists in this category");
        }

        MasterData item = new MasterData();
        item.setCategory(payload.getCategory());
        item.setValue(payload.getValue());
        item.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        item.setSortOrder(payload.getSortOrder() != null ? payload.getSortOrder() : 0);

        return masterDataRepository.save(item);
    }

    @GetMapping({"", "/"})
    public List<MasterData> getAllMasterData() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return masterDataRepository.findAll().stream()
                .sorted(Comparator.comparing(MasterData::getCategory, Comparator.nullsLast(String::compareTo))
                        .thenComparing(MasterData::getSortOrder, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(MasterData::getValue, Comparator.nullsLast(String::compareTo)))
                .toList();
    }

    @GetMapping("/categories")
    public Map<String, List<String>> getCategories() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return Map.of("categories", ALLOWED_CATEGORIES);
    }

    @GetMapping("/{category}")
    public Map<String, Object> getMasterDataByCategory(
            @PathVariable String category,
            @RequestParam(name = "active_only", required = false, defaultValue = "true") boolean activeOnly
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        validateCategory(category);

        List<Map<String, Object>> values = masterDataRepository.findAll().stream()
                .filter(m -> category.equals(m.getCategory()))
                .filter(m -> !activeOnly || m.isActive())
                .sorted(Comparator.comparing(MasterData::getSortOrder, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(MasterData::getValue, Comparator.nullsLast(String::compareTo)))
                .map(item -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", item.getId());
                    m.put("value", item.getValue());
                    m.put("is_active", item.isActive());
                    m.put("sort_order", item.getSortOrder());
                    return m;
                })
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("category", category);
        body.put("values", values);
        return body;
    }

    @PutMapping("/{itemId}")
    public MasterData updateMasterData(@PathVariable Long itemId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin");

        MasterData item = masterDataRepository.findById(itemId).orElseThrow(() -> ApiException.notFound("Master data item not found"));

        if (updateData.containsKey("category") && updateData.get("category") != null) {
            validateCategory(updateData.get("category").toString());
        }

        String newCategory = updateData.containsKey("category") && updateData.get("category") != null
                ? updateData.get("category").toString() : item.getCategory();
        String newValue = updateData.containsKey("value") && updateData.get("value") != null
                ? updateData.get("value").toString() : item.getValue();

        masterDataRepository.findByCategoryAndValue(newCategory, newValue).ifPresent(existing -> {
            if (!existing.getId().equals(itemId)) {
                throw ApiException.badRequest("Another value already exists in this category");
            }
        });

        if (updateData.containsKey("category") && updateData.get("category") != null) {
            item.setCategory(updateData.get("category").toString());
        }
        if (updateData.containsKey("value") && updateData.get("value") != null) {
            item.setValue(updateData.get("value").toString());
        }
        if (updateData.containsKey("is_active") && updateData.get("is_active") != null) {
            item.setActive(Boolean.parseBoolean(updateData.get("is_active").toString()));
        }
        if (updateData.containsKey("sort_order") && updateData.get("sort_order") != null) {
            item.setSortOrder(Integer.valueOf(updateData.get("sort_order").toString()));
        }

        return masterDataRepository.save(item);
    }

    @DeleteMapping("/{itemId}")
    public Map<String, String> deleteMasterData(@PathVariable Long itemId) {
        permissionService.requireRoles("Admin");
        MasterData item = masterDataRepository.findById(itemId).orElseThrow(() -> ApiException.notFound("Master data item not found"));
        masterDataRepository.delete(item);
        return Map.of("message", "Master data item deleted successfully");
    }

    private void validateCategory(String category) {
        if (!ALLOWED_CATEGORIES.contains(category)) {
            throw ApiException.badRequest("Invalid category. Allowed: " + String.join(", ", ALLOWED_CATEGORIES));
        }
    }
}
