package com.schoolerp.controller;

import com.schoolerp.dto.fee.FeeBulkClassCreate;
import com.schoolerp.dto.fee.FeeCreate;
import com.schoolerp.entity.Fee;
import com.schoolerp.entity.FeeStructure;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.FeeRepository;
import com.schoolerp.repository.FeeStructureRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.Year;
import java.util.*;

/**
 * Direct port of backend/app/routes/fees.py's core CRUD and UPI payment
 * endpoints. Not yet ported: GET /fees/{id}/receipt (PDF, depends on
 * app/pdf.py) and GET /fees/{id}/pay (public guardian payment page with a
 * QR code, depends on the not-yet-ported app/payment_links.py signed-token
 * scheme) - both peripheral to the core billing flow. The new-fee guardian
 * notification side effect (app/notifications.py) is also not yet ported.
 */
@RestController
@RequestMapping("/fees")
public class FeeController {

    private static final List<String> VALID_FEE_TYPES = List.of(
            "Admission Fee", "Tuition Fee", "Transport Fee", "Exam Fee", "Library Fee",
            "Hostel Fee", "Annual Fee", "Activity Fee", "Technology Fee", "Other"
    );

    private final FeeRepository feeRepository;
    private final StudentRepository studentRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final FeeStructureRepository feeStructureRepository;
    private final PermissionService permissionService;

    public FeeController(
            FeeRepository feeRepository,
            StudentRepository studentRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            FeeStructureRepository feeStructureRepository,
            PermissionService permissionService
    ) {
        this.feeRepository = feeRepository;
        this.studentRepository = studentRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.feeStructureRepository = feeStructureRepository;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public Fee createFee(@Valid @RequestBody FeeCreate payload) {
        permissionService.requireRoles("Admin", "Accounts");

        Student student = studentRepository.findById(payload.getStudentId())
                .orElseThrow(() -> ApiException.notFound("Student not found"));

        validateFeeAmounts(payload.getFeeType(), payload.getTotalAmount(), payload.getPaidAmount());
        double[] status = calculateFeeStatus(payload.getTotalAmount(), payload.getPaidAmount());

        String receiptNo = payload.getReceiptNo();
        if ((receiptNo == null || receiptNo.isBlank()) && payload.getPaidAmount() > 0) {
            receiptNo = generateReceiptNo();
        }

        Fee fee = new Fee();
        fee.setStudentId(payload.getStudentId());
        fee.setFeeType(payload.getFeeType());
        fee.setAcademicYear(payload.getAcademicYear() != null ? payload.getAcademicYear() : getOrCreateSettings().getAcademicYear());
        fee.setClassId(payload.getClassId() != null ? payload.getClassId() : student.getClassId());
        fee.setClassNameSnapshot(payload.getClassNameSnapshot() != null ? payload.getClassNameSnapshot() : student.getClassName());
        fee.setSectionSnapshot(payload.getSectionSnapshot() != null ? payload.getSectionSnapshot() : student.getSection());
        fee.setTotalAmount(payload.getTotalAmount());
        fee.setPaidAmount(payload.getPaidAmount());
        fee.setDueAmount(status[0]);
        fee.setPaymentStatus(statusLabel(status[1]));
        fee.setPaymentDate(payload.getPaymentDate());
        fee.setDueDate(payload.getDueDate());
        fee.setReceiptNo(receiptNo);
        fee.setRemarks(payload.getRemarks());

        return feeRepository.save(fee);
    }

    @PostMapping("/bulk-class")
    public Map<String, Object> createFeeForClass(@Valid @RequestBody FeeBulkClassCreate payload) {
        permissionService.requireRoles("Admin", "Accounts");

        List<Student> students = studentRepository.findAll().stream()
                .filter(s -> payload.getClassName().equals(s.getClassName()))
                .filter(s -> payload.getSection() == null || payload.getSection().equals(s.getSection()))
                .toList();
        if (students.isEmpty()) {
            throw ApiException.notFound("No students found for the selected class");
        }
        if (!VALID_FEE_TYPES.contains(payload.getFeeType())) {
            throw ApiException.badRequest("Invalid fee type. Allowed: " + String.join(", ", VALID_FEE_TYPES));
        }

        String academicYear = payload.getAcademicYear() != null ? payload.getAcademicYear() : getOrCreateSettings().getAcademicYear();

        Map<String, FeeStructure> structures = resolveClassStructures(academicYear, payload.getClassName(), payload.getFeeType());

        record Batch(String residentialType, double amount, LocalDate dueDate) {}
        List<Batch> batches = new ArrayList<>();

        if (structures.isEmpty()) {
            if (payload.getTotalAmount() == null || payload.getTotalAmount() <= 0) {
                throw ApiException.badRequest("Total Amount must be greater than 0, or configure a Fee Structure for this class and fee type.");
            }
            batches.add(new Batch(null, payload.getTotalAmount(), payload.getDueDate()));
        } else if (structures.size() == 1 && structures.containsKey("")) {
            FeeStructure structure = structures.get("");
            batches.add(new Batch(null, structure.getAmount(), structure.getDueDate() != null ? structure.getDueDate() : payload.getDueDate()));
        } else {
            FeeStructure both = structures.get("");
            for (String residentialType : List.of("Hosteller", "Day Scholar")) {
                FeeStructure structure = structures.getOrDefault(residentialType, both);
                if (structure != null) {
                    batches.add(new Batch(residentialType, structure.getAmount(),
                            structure.getDueDate() != null ? structure.getDueDate() : payload.getDueDate()));
                }
            }
        }

        for (Batch batch : batches) {
            validateFeeAmounts(payload.getFeeType(), batch.amount(), payload.getPaidAmount());
        }

        List<Map<String, Object>> groups = new ArrayList<>();
        int createdCount = 0;

        for (Batch batch : batches) {
            List<Student> batchStudents = students.stream()
                    .filter(s -> batch.residentialType() == null || batch.residentialType().equals(s.getResidentialType()))
                    .toList();
            if (batchStudents.isEmpty()) continue;

            double[] status = calculateFeeStatus(batch.amount(), payload.getPaidAmount());

            for (Student student : batchStudents) {
                String receiptNo = payload.getPaidAmount() > 0 ? generateReceiptNo() : null;

                Fee fee = new Fee();
                fee.setStudentId(student.getId());
                fee.setFeeType(payload.getFeeType());
                fee.setAcademicYear(academicYear);
                fee.setClassId(student.getClassId());
                fee.setClassNameSnapshot(student.getClassName());
                fee.setSectionSnapshot(student.getSection());
                fee.setTotalAmount(batch.amount());
                fee.setPaidAmount(payload.getPaidAmount());
                fee.setDueAmount(status[0]);
                fee.setPaymentStatus(statusLabel(status[1]));
                fee.setPaymentDate(payload.getPaymentDate());
                fee.setDueDate(batch.dueDate());
                fee.setReceiptNo(receiptNo);
                fee.setRemarks(payload.getRemarks());
                feeRepository.save(fee);
                createdCount++;
            }

            Map<String, Object> group = new LinkedHashMap<>();
            group.put("residential_type", batch.residentialType());
            group.put("student_count", batchStudents.size());
            group.put("amount", batch.amount());
            groups.add(group);
        }

        if (createdCount == 0) {
            throw ApiException.notFound("No students in this class/section matched the resolved fee structure");
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("created_count", createdCount);
        body.put("class_name", payload.getClassName());
        body.put("section", payload.getSection());
        body.put("groups", groups);
        return body;
    }

    @GetMapping({"", "/"})
    public List<Fee> getFees(@RequestParam(name = "academic_year", required = false) String academicYear) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return feeRepository.findAll().stream()
                .filter(f -> academicYear == null || academicYear.equals(f.getAcademicYear()))
                .sorted(Comparator.comparing(Fee::getId).reversed())
                .toList();
    }

    @GetMapping("/student/{studentId}")
    public List<Fee> getStudentFees(@PathVariable Long studentId) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        if (!studentRepository.existsById(studentId)) {
            throw ApiException.notFound("Student not found");
        }
        return feeRepository.findByStudentId(studentId).stream()
                .sorted(Comparator.comparing(Fee::getId).reversed())
                .toList();
    }

    @GetMapping("/{feeId}")
    public Fee getFee(@PathVariable Long feeId) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return feeRepository.findById(feeId).orElseThrow(() -> ApiException.notFound("Fee record not found"));
    }

    @PutMapping("/{feeId}")
    public Fee updateFee(@PathVariable Long feeId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin", "Accounts");

        Fee fee = feeRepository.findById(feeId).orElseThrow(() -> ApiException.notFound("Fee record not found"));

        double[] originalStatus = calculateFeeStatus(fee.getTotalAmount(), fee.getPaidAmount());
        if (statusLabel(originalStatus[1]).equals("Paid")) {
            throw ApiException.badRequest("Fully paid fees cannot be edited");
        }

        List<String> lockedFields = List.of("fee_type", "academic_year", "total_amount", "due_date", "receipt_no", "remarks");
        for (String field : lockedFields) {
            if (!updateData.containsKey(field)) continue;
            boolean changed = "total_amount".equals(field)
                    ? !numericEquals(updateData.get(field), fee.getTotalAmount())
                    : !Objects.equals(normalizedCurrentValue(fee, field), normalizedIncomingValue(updateData.get(field), field));
            if (changed) {
                throw ApiException.badRequest("Only Payment Amount can be updated once a fee record has been created");
            }
        }

        fee.setPaymentDate(LocalDate.now());

        if (updateData.containsKey("fee_type") && updateData.get("fee_type") != null) {
            if (!VALID_FEE_TYPES.contains(updateData.get("fee_type").toString())) {
                throw ApiException.badRequest("Invalid fee type. Allowed: " + String.join(", ", VALID_FEE_TYPES));
            }
        }

        Student student = studentRepository.findById(fee.getStudentId())
                .orElseThrow(() -> ApiException.notFound("Student not found"));

        String newAcademicYear = str(updateData.get("academic_year"));
        fee.setAcademicYear(newAcademicYear != null ? newAcademicYear
                : (fee.getAcademicYear() != null ? fee.getAcademicYear() : getOrCreateSettings().getAcademicYear()));

        Object newClassId = updateData.get("class_id");
        fee.setClassId(newClassId != null ? Long.valueOf(newClassId.toString())
                : (fee.getClassId() != null ? fee.getClassId() : student.getClassId()));

        String newClassName = str(updateData.get("class_name_snapshot"));
        fee.setClassNameSnapshot(newClassName != null ? newClassName
                : (fee.getClassNameSnapshot() != null ? fee.getClassNameSnapshot() : student.getClassName()));

        String newSection = str(updateData.get("section_snapshot"));
        fee.setSectionSnapshot(newSection != null ? newSection
                : (fee.getSectionSnapshot() != null ? fee.getSectionSnapshot() : student.getSection()));

        if (updateData.containsKey("paid_amount") && updateData.get("paid_amount") != null) {
            fee.setPaidAmount(Double.valueOf(updateData.get("paid_amount").toString()));
        }
        if (updateData.containsKey("payment_date") && updateData.get("payment_date") != null) {
            fee.setPaymentDate(LocalDate.parse(updateData.get("payment_date").toString()));
        }

        if (fee.getTotalAmount() < 0) throw ApiException.badRequest("Total amount cannot be negative");
        if (fee.getPaidAmount() < 0) throw ApiException.badRequest("Paid amount cannot be negative");
        if (fee.getPaidAmount() > fee.getTotalAmount()) throw ApiException.badRequest("Paid amount cannot be greater than total amount");

        double[] status = calculateFeeStatus(fee.getTotalAmount(), fee.getPaidAmount());
        fee.setDueAmount(status[0]);
        fee.setPaymentStatus(statusLabel(status[1]));

        if ((fee.getReceiptNo() == null || fee.getReceiptNo().isBlank()) && fee.getPaidAmount() > 0) {
            fee.setReceiptNo(generateReceiptNo());
        }

        return feeRepository.save(fee);
    }

    @DeleteMapping("/{feeId}")
    public Map<String, String> deleteFee(@PathVariable Long feeId) {
        permissionService.requireRoles("Admin");
        Fee fee = feeRepository.findById(feeId).orElseThrow(() -> ApiException.notFound("Fee record not found"));
        feeRepository.delete(fee);
        return Map.of("message", "Fee record deleted successfully");
    }

    @GetMapping("/metadata/fee-types")
    public Map<String, List<String>> getFeeTypes() {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return Map.of("fee_types", VALID_FEE_TYPES);
    }

    @GetMapping("/payment/config")
    public Map<String, Object> paymentConfig() {
        permissionService.requireRoles("Admin", "Accounts", "Principal");
        SchoolSettings settings = getOrCreateSettings();
        String upiId = schoolUpiId(settings);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", !upiId.isEmpty());
        body.put("upi_id", upiId);
        body.put("payee_name", settings.getSchoolName() != null ? settings.getSchoolName() : "School");
        body.put("currency", (settings.getCurrency() != null ? settings.getCurrency() : "INR").toUpperCase());
        return body;
    }

    @GetMapping("/{feeId}/payment/upi")
    public Map<String, Object> upiPaymentDetails(@PathVariable Long feeId) {
        permissionService.requireRoles("Admin", "Accounts", "Principal");

        SchoolSettings settings = getOrCreateSettings();
        String upiId = schoolUpiId(settings);
        if (upiId.isEmpty()) {
            throw ApiException.badRequest("UPI payment is not configured. Set the school's UPI ID in Settings.");
        }

        Fee fee = feeRepository.findById(feeId).orElseThrow(() -> ApiException.notFound("Fee record not found"));

        double balance = Math.max(nz(fee.getTotalAmount()) - nz(fee.getPaidAmount()), 0);
        if (balance <= 0) {
            throw ApiException.badRequest("This fee has no outstanding balance.");
        }

        String payeeName = settings.getSchoolName() != null ? settings.getSchoolName() : "School";
        String note = ("Fee #" + fee.getId() + " " + (fee.getFeeType() != null ? fee.getFeeType() : "")).trim();
        String truncatedNote = note.length() > 80 ? note.substring(0, 80) : note;
        String uri = buildUpiUri(upiId, payeeName, balance, truncatedNote);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("upi_id", upiId);
        body.put("payee_name", payeeName);
        body.put("amount", Math.round(balance * 100.0) / 100.0);
        body.put("currency", "INR");
        body.put("note", truncatedNote);
        body.put("uri", uri);
        return body;
    }

    @PostMapping("/{feeId}/payment/upi/confirm")
    public Fee confirmUpiPayment(@PathVariable Long feeId, @RequestBody Map<String, Object> payload) {
        permissionService.requireRoles("Admin", "Accounts", "Principal");

        String reference = payload.get("reference") == null ? "" : payload.get("reference").toString().trim();
        if (reference.isEmpty()) {
            throw ApiException.badRequest("Enter the UPI transaction reference (UTR) to confirm the payment.");
        }

        Fee fee = feeRepository.findById(feeId).orElseThrow(() -> ApiException.notFound("Fee record not found"));

        double balance = Math.max(nz(fee.getTotalAmount()) - nz(fee.getPaidAmount()), 0);
        if (balance <= 0) {
            throw ApiException.badRequest("This fee has no outstanding balance.");
        }

        fee.setPaidAmount(fee.getTotalAmount());
        fee.setPaymentDate(LocalDate.now());
        double[] status = calculateFeeStatus(fee.getTotalAmount(), fee.getPaidAmount());
        fee.setDueAmount(status[0]);
        fee.setPaymentStatus(statusLabel(status[1]));
        if (fee.getReceiptNo() == null || fee.getReceiptNo().isBlank()) {
            fee.setReceiptNo(generateReceiptNo());
        }

        String upiNote = "UPI Ref: " + reference;
        fee.setRemarks(fee.getRemarks() != null && !fee.getRemarks().isBlank() ? fee.getRemarks() + " | " + upiNote : upiNote);

        return feeRepository.save(fee);
    }

    // ===================== helpers =====================

    private void validateFeeAmounts(String feeType, double totalAmount, double paidAmount) {
        if (!VALID_FEE_TYPES.contains(feeType)) {
            throw ApiException.badRequest("Invalid fee type. Allowed: " + String.join(", ", VALID_FEE_TYPES));
        }
        if (totalAmount < 0) throw ApiException.badRequest("Total amount cannot be negative");
        if (paidAmount < 0) throw ApiException.badRequest("Paid amount cannot be negative");
        if (paidAmount > totalAmount) throw ApiException.badRequest("Paid amount cannot be greater than total amount");
    }

    /** Returns [dueAmount, statusCode] where statusCode: 0=Paid, 1=Partial, 2=Unpaid. */
    private double[] calculateFeeStatus(double totalAmount, double paidAmount) {
        double due = totalAmount - paidAmount;
        if (due <= 0) return new double[]{0, 0};
        if (paidAmount > 0) return new double[]{due, 1};
        return new double[]{due, 2};
    }

    private String statusLabel(double code) {
        if (code == 0) return "Paid";
        if (code == 1) return "Partial";
        return "Unpaid";
    }

    private String generateReceiptNo() {
        SchoolSettings settings = getOrCreateSettings();
        String prefix = settings.getReceiptPrefix() != null ? settings.getReceiptPrefix() : "REC";
        int year = Year.now().getValue();
        long count = feeRepository.count() + 1;
        return String.format("%s-%d-%05d", prefix, year, count);
    }

    private SchoolSettings getOrCreateSettings() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (!all.isEmpty()) {
            return all.get(0);
        }
        SchoolSettings settings = new SchoolSettings();
        settings.setSchoolName("International School");
        settings.setCurrency("INR");
        settings.setReceiptPrefix("REC");
        return schoolSettingsRepository.save(settings);
    }

    private Map<String, FeeStructure> resolveClassStructures(String academicYear, String className, String feeType) {
        List<String> classes = className != null ? Arrays.asList(className, null) : Collections.singletonList(null);
        for (String cls : classes) {
            List<FeeStructure> rows = feeStructureRepository.findAll().stream()
                    .filter(s -> Objects.equals(s.getAcademicYear(), academicYear))
                    .filter(s -> Objects.equals(s.getFeeType(), feeType))
                    .filter(s -> Objects.equals(s.getClassName(), cls))
                    .toList();
            if (!rows.isEmpty()) {
                Map<String, FeeStructure> result = new LinkedHashMap<>();
                for (FeeStructure row : rows) {
                    result.put(row.getResidentialType() == null ? "" : row.getResidentialType(), row);
                }
                return result;
            }
        }
        return Map.of();
    }

    private String schoolUpiId(SchoolSettings settings) {
        return settings.getUpiId() != null ? settings.getUpiId().trim() : "";
    }

    private String buildUpiUri(String upiId, String payeeName, double amount, String note) {
        String params = "pa=" + urlEncode(upiId)
                + "&pn=" + urlEncode(payeeName)
                + "&am=" + urlEncode(String.format(Locale.ROOT, "%.2f", amount))
                + "&cu=INR"
                + "&tn=" + urlEncode(note);
        return "upi://pay?" + params;
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private double nz(Double value) {
        return value == null ? 0 : value;
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
    }

    private String normalizedCurrentValue(Fee fee, String field) {
        Object value = switch (field) {
            case "fee_type" -> fee.getFeeType();
            case "academic_year" -> fee.getAcademicYear();
            case "total_amount" -> fee.getTotalAmount();
            case "due_date" -> fee.getDueDate();
            case "receipt_no" -> fee.getReceiptNo();
            case "remarks" -> fee.getRemarks();
            default -> null;
        };
        return value == null ? null : value.toString();
    }

    private String normalizedIncomingValue(Object value, String field) {
        return value == null ? null : value.toString();
    }

    private boolean numericEquals(Object incoming, Double current) {
        if (incoming == null) return current == null;
        if (current == null) return false;
        return Double.parseDouble(incoming.toString()) == current;
    }
}
