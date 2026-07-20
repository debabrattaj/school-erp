package com.schoolerp.controller;

import com.schoolerp.dto.fee.FeeStructureCreate;
import com.schoolerp.entity.FeeStructure;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.FeeStructureRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Direct port of backend/app/routes/fee_structures.py. */
@RestController
@RequestMapping("/fee-structures")
public class FeeStructureController {

    private final FeeStructureRepository feeStructureRepository;
    private final PermissionService permissionService;

    public FeeStructureController(FeeStructureRepository feeStructureRepository, PermissionService permissionService) {
        this.feeStructureRepository = feeStructureRepository;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public FeeStructure createFeeStructure(@Valid @RequestBody FeeStructureCreate payload) {
        permissionService.requireRoles("Admin", "Accounts");

        if (findExisting(payload.getAcademicYear(), payload.getClassName(), payload.getResidentialType(), payload.getFeeType()) != null) {
            throw ApiException.badRequest("A fee structure already exists for this academic year, class, residential type, and fee type.");
        }
        if (payload.getAmount() < 0) {
            throw ApiException.badRequest("Amount cannot be negative");
        }

        FeeStructure structure = new FeeStructure();
        structure.setAcademicYear(payload.getAcademicYear());
        structure.setClassName(payload.getClassName());
        structure.setResidentialType(payload.getResidentialType());
        structure.setFeeType(payload.getFeeType());
        structure.setAmount(payload.getAmount());
        structure.setDueDate(payload.getDueDate());
        structure.setRemarks(payload.getRemarks());

        return feeStructureRepository.save(structure);
    }

    @GetMapping({"", "/"})
    public List<FeeStructure> listFeeStructures(
            @RequestParam(name = "academic_year", required = false) String academicYear,
            @RequestParam(name = "class_name", required = false) String className,
            @RequestParam(name = "residential_type", required = false) String residentialType,
            @RequestParam(name = "fee_type", required = false) String feeType
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return feeStructureRepository.findAll().stream()
                .filter(s -> academicYear == null || academicYear.equals(s.getAcademicYear()))
                .filter(s -> className == null || className.equals(s.getClassName()))
                .filter(s -> residentialType == null || residentialType.equals(s.getResidentialType()))
                .filter(s -> feeType == null || feeType.equals(s.getFeeType()))
                .sorted(Comparator.comparing(FeeStructure::getAcademicYear, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(FeeStructure::getFeeType, Comparator.nullsLast(String::compareTo)))
                .toList();
    }

    @GetMapping("/lookup")
    public FeeStructure lookupFeeStructure(
            @RequestParam(name = "academic_year") String academicYear,
            @RequestParam(name = "fee_type") String feeType,
            @RequestParam(name = "class_name", required = false) String className,
            @RequestParam(name = "residential_type", required = false) String residentialType
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        FeeStructure structure = resolveStructure(academicYear, className, residentialType, feeType);
        if (structure == null) {
            throw ApiException.notFound("No fee structure configured for this selection");
        }
        return structure;
    }

    @GetMapping("/lookup-class")
    public Map<String, Object> lookupClassFeeStructure(
            @RequestParam(name = "academic_year") String academicYear,
            @RequestParam(name = "fee_type") String feeType,
            @RequestParam(name = "class_name") String className
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");

        Map<String, FeeStructure> structures = resolveClassStructures(academicYear, className, feeType);
        if (structures.isEmpty()) {
            throw ApiException.notFound("No fee structure configured for this selection");
        }

        Map<String, Object> body = new java.util.LinkedHashMap<>();
        if (structures.size() == 1 && structures.containsKey("")) {
            FeeStructure structure = structures.get("");
            body.put("mode", "single");
            body.put("amount", structure.getAmount());
            body.put("due_date", structure.getDueDate());
            return body;
        }

        FeeStructure both = structures.get("");
        FeeStructure hosteller = structures.getOrDefault("Hosteller", both);
        FeeStructure dayScholar = structures.getOrDefault("Day Scholar", both);

        body.put("mode", "split");
        body.put("hosteller_amount", hosteller != null ? hosteller.getAmount() : null);
        body.put("hosteller_due_date", hosteller != null ? hosteller.getDueDate() : null);
        body.put("day_scholar_amount", dayScholar != null ? dayScholar.getAmount() : null);
        body.put("day_scholar_due_date", dayScholar != null ? dayScholar.getDueDate() : null);
        return body;
    }

    @PutMapping("/{structureId}")
    public FeeStructure updateFeeStructure(@PathVariable Long structureId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Accounts");

        FeeStructure structure = feeStructureRepository.findById(structureId)
                .orElseThrow(() -> ApiException.notFound("Fee structure not found"));

        String nextYear = updateData.containsKey("academic_year") ? str(updateData.get("academic_year")) : structure.getAcademicYear();
        String nextClass = updateData.containsKey("class_name") ? str(updateData.get("class_name")) : structure.getClassName();
        String nextResidential = updateData.containsKey("residential_type") ? str(updateData.get("residential_type")) : structure.getResidentialType();
        String nextType = updateData.containsKey("fee_type") ? str(updateData.get("fee_type")) : structure.getFeeType();

        FeeStructure conflict = findExisting(nextYear, nextClass, nextResidential, nextType);
        if (conflict != null && !conflict.getId().equals(structureId)) {
            throw ApiException.badRequest("A fee structure already exists for this academic year, class, residential type, and fee type.");
        }

        if (updateData.containsKey("amount") && updateData.get("amount") != null) {
            double amount = Double.parseDouble(updateData.get("amount").toString());
            if (amount < 0) {
                throw ApiException.badRequest("Amount cannot be negative");
            }
            structure.setAmount(amount);
        }
        if (updateData.containsKey("academic_year")) structure.setAcademicYear(str(updateData.get("academic_year")));
        if (updateData.containsKey("class_name")) structure.setClassName(str(updateData.get("class_name")));
        if (updateData.containsKey("residential_type")) structure.setResidentialType(str(updateData.get("residential_type")));
        if (updateData.containsKey("fee_type")) structure.setFeeType(str(updateData.get("fee_type")));
        if (updateData.containsKey("due_date")) {
            Object v = updateData.get("due_date");
            structure.setDueDate(v == null ? null : java.time.LocalDate.parse(v.toString()));
        }
        if (updateData.containsKey("remarks")) structure.setRemarks(str(updateData.get("remarks")));

        return feeStructureRepository.save(structure);
    }

    @DeleteMapping("/{structureId}")
    public Map<String, String> deleteFeeStructure(@PathVariable Long structureId) {
        permissionService.requireRoles("Admin");
        FeeStructure structure = feeStructureRepository.findById(structureId)
                .orElseThrow(() -> ApiException.notFound("Fee structure not found"));
        feeStructureRepository.delete(structure);
        return Map.of("message", "Fee structure deleted successfully");
    }

    private FeeStructure findExisting(String academicYear, String className, String residentialType, String feeType) {
        return feeStructureRepository.findAll().stream()
                .filter(s -> Objects.equals(s.getAcademicYear(), academicYear))
                .filter(s -> Objects.equals(s.getFeeType(), feeType))
                .filter(s -> Objects.equals(s.getClassName(), className))
                .filter(s -> Objects.equals(s.getResidentialType(), residentialType))
                .findFirst()
                .orElse(null);
    }

    /** Most specific match first, falling back to wildcards on class and/or residential type. */
    private FeeStructure resolveStructure(String academicYear, String className, String residentialType, String feeType) {
        List<String> classes = className != null ? java.util.Arrays.asList(className, null) : java.util.Collections.singletonList(null);
        List<String> residentials = residentialType != null ? java.util.Arrays.asList(residentialType, null) : java.util.Collections.singletonList(null);

        for (String cls : classes) {
            for (String res : residentials) {
                FeeStructure structure = findExisting(academicYear, cls, res, feeType);
                if (structure != null) {
                    return structure;
                }
            }
        }
        return null;
    }

    /** Every fee structure row applicable to a whole class, keyed by residential type ("" = Both). */
    private Map<String, FeeStructure> resolveClassStructures(String academicYear, String className, String feeType) {
        List<String> classes = className != null ? java.util.Arrays.asList(className, null) : java.util.Collections.singletonList(null);
        for (String cls : classes) {
            List<FeeStructure> rows = feeStructureRepository.findAll().stream()
                    .filter(s -> Objects.equals(s.getAcademicYear(), academicYear))
                    .filter(s -> Objects.equals(s.getFeeType(), feeType))
                    .filter(s -> Objects.equals(s.getClassName(), cls))
                    .toList();
            if (!rows.isEmpty()) {
                Map<String, FeeStructure> result = new java.util.LinkedHashMap<>();
                for (FeeStructure row : rows) {
                    result.put(row.getResidentialType() == null ? "" : row.getResidentialType(), row);
                }
                return result;
            }
        }
        return Map.of();
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
    }
}
