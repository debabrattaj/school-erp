package com.schoolerp.controller;

import com.schoolerp.dto.inventory.InventoryBulkIssueRequest;
import com.schoolerp.dto.inventory.InventoryItemCreate;
import com.schoolerp.dto.inventory.InventoryTransactionCreate;
import com.schoolerp.entity.InventoryItem;
import com.schoolerp.entity.InventoryTransaction;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.InventoryItemRepository;
import com.schoolerp.repository.InventoryTransactionRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/** Direct port of backend/app/routes/inventory.py. */
@RestController
@RequestMapping("/inventory")
public class InventoryController {

    private static final Set<String> OUT_TYPES = Set.of("Stock Out", "Issue", "Purchase");
    private static final Set<String> IN_TYPES = Set.of("Stock In", "Return");

    private final InventoryItemRepository itemRepository;
    private final InventoryTransactionRepository transactionRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public InventoryController(
            InventoryItemRepository itemRepository,
            InventoryTransactionRepository transactionRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.itemRepository = itemRepository;
        this.transactionRepository = transactionRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    // ===================== items =====================

    @GetMapping("/items/")
    public List<InventoryItem> getItems() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return itemRepository.findAll().stream()
                .sorted(Comparator.comparing(InventoryItem::getItemName))
                .toList();
    }

    @PostMapping("/items/")
    public InventoryItem createItem(@Valid @RequestBody InventoryItemCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        if (payload.getItemCode() != null && !payload.getItemCode().isBlank()) {
            requireNoItemCodeClash(payload.getItemCode(), null);
        }

        InventoryItem item = new InventoryItem();
        applyItemPayload(item, payload);

        return itemRepository.save(item);
    }

    @PutMapping("/items/{itemId}")
    public InventoryItem updateItem(@PathVariable Long itemId, @Valid @RequestBody InventoryItemCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        InventoryItem item = requireItem(itemId);
        if (payload.getItemCode() != null && !payload.getItemCode().isBlank()) {
            requireNoItemCodeClash(payload.getItemCode(), itemId);
        }

        applyItemPayload(item, payload);

        return itemRepository.save(item);
    }

    @DeleteMapping("/items/{itemId}")
    public Map<String, String> deleteItem(@PathVariable Long itemId) {
        permissionService.requireRoles("Admin");
        InventoryItem item = requireItem(itemId);
        itemRepository.delete(item);
        return Map.of("message", "Inventory item deleted successfully");
    }

    // ===================== transactions =====================

    @GetMapping("/transactions/")
    public List<Map<String, Object>> getTransactions(
            @RequestParam(name = "item_id", required = false) Long itemId,
            @RequestParam(name = "transaction_type", required = false) String transactionType
    ) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return transactionRepository.findAll().stream()
                .filter(t -> itemId == null || itemId.equals(t.getItemId()))
                .filter(t -> transactionType == null || transactionType.equals(t.getTransactionType()))
                .sorted(Comparator.comparing(InventoryTransaction::getId).reversed())
                .map(this::serializeTransaction)
                .toList();
    }

    @PostMapping("/transactions/")
    public Map<String, Object> createTransaction(@Valid @RequestBody InventoryTransactionCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        InventoryItem item = requireItem(payload.getItemId());
        if (payload.getIssuedToStudentId() != null) {
            requireStudent(payload.getIssuedToStudentId());
        }

        applyStock(item, payload.getTransactionType(), payload.getQuantity(), 1);

        Double unitCost = payload.getUnitCost();
        if (unitCost == null && IN_TYPES.contains(payload.getTransactionType())) {
            unitCost = item.getUnitPrice() != null ? item.getUnitPrice() : 0.0;
        }
        Double totalCost = (unitCost != null && unitCost != 0) ? unitCost * payload.getQuantity() : null;

        InventoryTransaction record = new InventoryTransaction();
        applyTransactionPayload(record, payload);
        record.setUnitCost(unitCost);
        record.setTotalCost(totalCost);

        if ("Purchase".equals(payload.getTransactionType()) && payload.getUnitPrice() != null) {
            record.setAmount(payload.getUnitPrice() * payload.getQuantity());
        }

        itemRepository.save(item);
        return serializeTransaction(transactionRepository.save(record));
    }

    @PostMapping("/bulk-issue")
    public Map<String, Object> bulkIssue(@Valid @RequestBody InventoryBulkIssueRequest payload) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        if (payload.getStudentIds() == null || payload.getStudentIds().isEmpty()) {
            throw ApiException.badRequest("Select at least one student");
        }
        if (payload.getItems() == null || payload.getItems().isEmpty()) {
            throw ApiException.badRequest("Select at least one item to issue");
        }

        List<Long> studentIds = new ArrayList<>(new LinkedHashSet<>(payload.getStudentIds()));
        List<Student> students = studentRepository.findAllById(studentIds);
        Set<Long> foundIds = students.stream().map(Student::getId).collect(Collectors.toSet());
        List<Long> missing = studentIds.stream().filter(id -> !foundIds.contains(id)).toList();
        if (!missing.isEmpty()) {
            throw ApiException.notFound("Student(s) not found: " + missing);
        }

        List<Map<String, Object>> results = new ArrayList<>();
        int totalIssued = 0;

        for (InventoryBulkIssueRequest.Item entry : payload.getItems()) {
            InventoryItem item = requireItem(entry.getItemId());

            Set<Long> alreadyIssuedIds = transactionRepository
                    .findByItemIdAndTransactionTypeAndCycleAndAcademicYearAndIssuedToStudentIdIn(
                            entry.getItemId(), "Issue", payload.getCycle(), payload.getAcademicYear(), studentIds)
                    .stream()
                    .map(InventoryTransaction::getIssuedToStudentId)
                    .collect(Collectors.toSet());

            List<Long> pendingIds = studentIds.stream().filter(id -> !alreadyIssuedIds.contains(id)).toList();
            int skippedDuplicateCount = studentIds.size() - pendingIds.size();

            double requiredQuantity = entry.getQuantityPerStudent() * pendingIds.size();
            if (!pendingIds.isEmpty() && item.getQuantityAvailable() < requiredQuantity) {
                results.add(bulkResult(item.getId(), item.getItemName(), 0, skippedDuplicateCount, true));
                continue;
            }

            for (Long studentId : pendingIds) {
                applyStock(item, "Issue", entry.getQuantityPerStudent(), 1);
                InventoryTransaction record = new InventoryTransaction();
                record.setItemId(entry.getItemId());
                record.setTransactionDate(payload.getTransactionDate());
                record.setTransactionType("Issue");
                record.setQuantity(entry.getQuantityPerStudent());
                record.setIssuedToStudentId(studentId);
                record.setReferenceNo(payload.getReferenceNo());
                record.setRemarks(payload.getRemarks());
                record.setCycle(payload.getCycle());
                record.setAcademicYear(payload.getAcademicYear());
                transactionRepository.save(record);
            }

            totalIssued += pendingIds.size();
            results.add(bulkResult(item.getId(), item.getItemName(), pendingIds.size(), skippedDuplicateCount, false));
            itemRepository.save(item);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("results", results);
        body.put("total_issued", totalIssued);
        return body;
    }

    @DeleteMapping("/transactions/{transactionId}")
    public Map<String, String> deleteTransaction(@PathVariable Long transactionId) {
        permissionService.requireRoles("Admin");
        InventoryTransaction record = requireTransaction(transactionId);
        InventoryItem item = itemRepository.findById(record.getItemId()).orElse(null);
        if (item != null) {
            applyStock(item, record.getTransactionType(), record.getQuantity(), -1);
            itemRepository.save(item);
        }
        transactionRepository.delete(record);
        return Map.of("message", "Inventory transaction deleted successfully");
    }

    // ===================== helpers =====================

    private void applyStock(InventoryItem item, String transactionType, double quantity, int direction) {
        if (quantity <= 0) {
            throw ApiException.badRequest("Quantity must be greater than zero");
        }
        if (IN_TYPES.contains(transactionType)) {
            item.setQuantityAvailable(item.getQuantityAvailable() + quantity * direction);
        } else if (OUT_TYPES.contains(transactionType)) {
            double nextQuantity = item.getQuantityAvailable() - (quantity * direction);
            if (nextQuantity < 0) {
                throw ApiException.badRequest("Not enough stock available");
            }
            item.setQuantityAvailable(nextQuantity);
        } else if ("Adjustment".equals(transactionType)) {
            item.setQuantityAvailable(item.getQuantityAvailable() + quantity * direction);
        }
    }

    private Map<String, Object> bulkResult(Long itemId, String itemName, int issuedCount, int skippedDuplicateCount, boolean skippedInsufficientStock) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("item_id", itemId);
        result.put("item_name", itemName);
        result.put("issued_count", issuedCount);
        result.put("skipped_duplicate_count", skippedDuplicateCount);
        result.put("skipped_insufficient_stock", skippedInsufficientStock);
        return result;
    }

    private void applyItemPayload(InventoryItem item, InventoryItemCreate payload) {
        item.setItemName(payload.getItemName());
        item.setItemCode(payload.getItemCode());
        item.setCategory(payload.getCategory());
        item.setUnit(payload.getUnit());
        item.setQuantityAvailable(payload.getQuantityAvailable());
        item.setReorderLevel(payload.getReorderLevel());
        item.setUnitPrice(payload.getUnitPrice());
        item.setLocation(payload.getLocation());
        item.setStatus(payload.getStatus());
        item.setRemarks(payload.getRemarks());
    }

    private void applyTransactionPayload(InventoryTransaction record, InventoryTransactionCreate payload) {
        record.setItemId(payload.getItemId());
        record.setTransactionDate(payload.getTransactionDate());
        record.setTransactionType(payload.getTransactionType());
        record.setQuantity(payload.getQuantity());
        record.setIssuedToStudentId(payload.getIssuedToStudentId());
        record.setIssuedToStaff(payload.getIssuedToStaff());
        record.setReferenceNo(payload.getReferenceNo());
        record.setRemarks(payload.getRemarks());
        record.setCycle(payload.getCycle());
        record.setAcademicYear(payload.getAcademicYear());
        record.setUnitPrice(payload.getUnitPrice());
        record.setPaymentStatus(payload.getPaymentStatus());
    }

    private void requireNoItemCodeClash(String itemCode, Long excludeId) {
        itemRepository.findByItemCode(itemCode).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Item code already exists");
            }
        });
    }

    private void requireStudent(Long id) {
        if (id == null || !studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }

    private InventoryItem requireItem(Long id) {
        return itemRepository.findById(id).orElseThrow(() -> ApiException.notFound("Inventory item not found"));
    }

    private InventoryTransaction requireTransaction(Long id) {
        return transactionRepository.findById(id).orElseThrow(() -> ApiException.notFound("Inventory transaction not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serializeTransaction(InventoryTransaction record) {
        InventoryItem item = itemRepository.findById(record.getItemId()).orElse(null);
        Student student = record.getIssuedToStudentId() != null
                ? studentRepository.findById(record.getIssuedToStudentId()).orElse(null)
                : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", record.getId());
        body.put("item_id", record.getItemId());
        body.put("transaction_date", record.getTransactionDate());
        body.put("transaction_type", record.getTransactionType());
        body.put("quantity", record.getQuantity());
        body.put("issued_to_student_id", record.getIssuedToStudentId());
        body.put("issued_to_staff", record.getIssuedToStaff());
        body.put("reference_no", record.getReferenceNo());
        body.put("unit_cost", record.getUnitCost());
        body.put("total_cost", record.getTotalCost());
        body.put("remarks", record.getRemarks());
        body.put("cycle", record.getCycle());
        body.put("academic_year", record.getAcademicYear());
        body.put("unit_price", record.getUnitPrice());
        body.put("amount", record.getAmount());
        body.put("payment_status", record.getPaymentStatus());
        body.put("item_name", item != null ? item.getItemName() : "-");
        body.put("item_code", item != null ? item.getItemCode() : null);
        body.put("student_name", student != null ? studentName(student) : null);
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_name", student != null ? student.getClassName() : null);
        body.put("section", student != null ? student.getSection() : null);
        return body;
    }
}
