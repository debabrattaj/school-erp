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
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.FeeService;
import com.schoolerp.service.NotificationService;
import com.schoolerp.service.PaymentLinkService;
import com.schoolerp.service.PdfService;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/**
 * Direct port of backend/app/routes/fees.py's core CRUD, PDF receipt, and
 * UPI payment endpoints.
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
    private final FeeStructureRepository feeStructureRepository;
    private final PermissionService permissionService;
    private final NotificationService notificationService;
    private final PdfService pdfService;
    private final FeeService feeService;
    private final PaymentLinkService paymentLinkService;

    public FeeController(
            FeeRepository feeRepository,
            StudentRepository studentRepository,
            FeeStructureRepository feeStructureRepository,
            PermissionService permissionService,
            NotificationService notificationService,
            PdfService pdfService,
            FeeService feeService,
            PaymentLinkService paymentLinkService
    ) {
        this.feeRepository = feeRepository;
        this.studentRepository = studentRepository;
        this.feeStructureRepository = feeStructureRepository;
        this.permissionService = permissionService;
        this.notificationService = notificationService;
        this.pdfService = pdfService;
        this.feeService = feeService;
        this.paymentLinkService = paymentLinkService;
    }

    @PostMapping({"", "/"})
    public Fee createFee(@Valid @RequestBody FeeCreate payload) {
        permissionService.requireRoles("Admin", "Accounts");

        Student student = studentRepository.findById(payload.getStudentId())
                .orElseThrow(() -> ApiException.notFound("Student not found"));

        validateFeeAmounts(payload.getFeeType(), payload.getTotalAmount(), payload.getPaidAmount());
        double[] status = feeService.calculateFeeStatus(payload.getTotalAmount(), payload.getPaidAmount());

        String receiptNo = payload.getReceiptNo();
        if ((receiptNo == null || receiptNo.isBlank()) && payload.getPaidAmount() > 0) {
            receiptNo = feeService.generateReceiptNo();
        }

        Fee fee = new Fee();
        fee.setStudentId(payload.getStudentId());
        fee.setFeeType(payload.getFeeType());
        fee.setAcademicYear(payload.getAcademicYear() != null ? payload.getAcademicYear() : feeService.getOrCreateSettings().getAcademicYear());
        fee.setClassId(payload.getClassId() != null ? payload.getClassId() : student.getClassId());
        fee.setClassNameSnapshot(payload.getClassNameSnapshot() != null ? payload.getClassNameSnapshot() : student.getClassName());
        fee.setSectionSnapshot(payload.getSectionSnapshot() != null ? payload.getSectionSnapshot() : student.getSection());
        fee.setTotalAmount(payload.getTotalAmount());
        fee.setPaidAmount(payload.getPaidAmount());
        fee.setDueAmount(status[0]);
        fee.setPaymentStatus(feeService.statusLabel(status[1]));
        fee.setPaymentDate(payload.getPaymentDate());
        fee.setDueDate(payload.getDueDate());
        fee.setReceiptNo(receiptNo);
        fee.setRemarks(payload.getRemarks());

        fee = feeRepository.save(fee);
        SchoolSettings settings = feeService.getOrCreateSettings();
        notificationService.notifyGuardianFeeAdded(fee, student, settings.getSchoolName() != null ? settings.getSchoolName() : "School");
        return fee;
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

        String academicYear = payload.getAcademicYear() != null ? payload.getAcademicYear() : feeService.getOrCreateSettings().getAcademicYear();

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

            double[] status = feeService.calculateFeeStatus(batch.amount(), payload.getPaidAmount());

            for (Student student : batchStudents) {
                String receiptNo = payload.getPaidAmount() > 0 ? feeService.generateReceiptNo() : null;

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
                fee.setPaymentStatus(feeService.statusLabel(status[1]));
                fee.setPaymentDate(payload.getPaymentDate());
                fee.setDueDate(batch.dueDate());
                fee.setReceiptNo(receiptNo);
                fee.setRemarks(payload.getRemarks());
                fee = feeRepository.save(fee);
                createdCount++;

                SchoolSettings settings = feeService.getOrCreateSettings();
                notificationService.notifyGuardianFeeAdded(fee, student, settings.getSchoolName() != null ? settings.getSchoolName() : "School");
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

    @GetMapping("/{feeId}/receipt")
    public org.springframework.http.ResponseEntity<byte[]> feeReceipt(@PathVariable Long feeId) {
        permissionService.requireRoles("Admin", "Accounts", "Principal");

        Fee fee = feeRepository.findById(feeId).orElseThrow(() -> ApiException.notFound("Fee record not found"));
        Student student = studentRepository.findById(fee.getStudentId()).orElse(null);
        SchoolSettings settings = feeService.getOrCreateSettings();

        String studentName = "-";
        String classLabel = fee.getClassNameSnapshot() != null ? fee.getClassNameSnapshot() : "";
        if (student != null) {
            studentName = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                    + (student.getLastName() != null ? student.getLastName() : "")).trim();
            if (studentName.isEmpty()) {
                studentName = student.getAdmissionNo() != null ? student.getAdmissionNo() : "-";
            }
            if (classLabel.isEmpty()) {
                classLabel = student.getClassName() != null ? student.getClassName() : "";
            }
            if (student.getAdmissionNo() != null) {
                studentName = student.getAdmissionNo() + " - " + studentName;
            }
        }

        double total = fee.getTotalAmount() != null ? fee.getTotalAmount() : 0;
        double paid = fee.getPaidAmount() != null ? fee.getPaidAmount() : 0;

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("school_name", settings.getSchoolName());
        data.put("currency", settings.getCurrency());
        data.put("receipt_no", fee.getReceiptNo());
        data.put("student_name", studentName);
        data.put("class_label", classLabel.isEmpty() ? "-" : classLabel);
        data.put("fee_type", fee.getFeeType());
        data.put("academic_year", fee.getAcademicYear());
        data.put("total", total);
        data.put("paid", paid);
        data.put("balance", Math.max(total - paid, 0));
        data.put("status", fee.getPaymentStatus());
        data.put("payment_date", fee.getPaymentDate() != null ? fee.getPaymentDate().toString() : "-");

        byte[] pdfBytes = pdfService.feeReceiptPdf(data);
        String filename = "receipt_" + (fee.getReceiptNo() != null ? fee.getReceiptNo() : fee.getId()) + ".pdf";

        return org.springframework.http.ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "inline; filename=" + filename)
                .body(pdfBytes);
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

        double[] originalStatus = feeService.calculateFeeStatus(fee.getTotalAmount(), fee.getPaidAmount());
        if (feeService.statusLabel(originalStatus[1]).equals("Paid")) {
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
                : (fee.getAcademicYear() != null ? fee.getAcademicYear() : feeService.getOrCreateSettings().getAcademicYear()));

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

        double[] status = feeService.calculateFeeStatus(fee.getTotalAmount(), fee.getPaidAmount());
        fee.setDueAmount(status[0]);
        fee.setPaymentStatus(feeService.statusLabel(status[1]));

        if ((fee.getReceiptNo() == null || fee.getReceiptNo().isBlank()) && fee.getPaidAmount() > 0) {
            fee.setReceiptNo(feeService.generateReceiptNo());
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
        SchoolSettings settings = feeService.getOrCreateSettings();
        String upiId = schoolUpiId(settings);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", !upiId.isEmpty());
        body.put("upi_id", upiId);
        body.put("payee_name", settings.getSchoolName() != null ? settings.getSchoolName() : "School");
        body.put("currency", (settings.getCurrency() != null ? settings.getCurrency() : "INR").toUpperCase());
        return body;
    }

    /** Public, no-login payment page a guardian opens from a WhatsApp/SMS link. */
    @GetMapping("/{feeId}/pay")
    public ResponseEntity<String> publicPaymentPage(@PathVariable Long feeId, @RequestParam String token) {
        if (!paymentLinkService.verifyPaymentLinkToken(feeId, token)) {
            return paymentPage(
                    "<h2>This payment link is invalid or has expired.</h2>"
                            + "<p>Please contact the school office for a new link.</p>",
                    HttpStatus.BAD_REQUEST);
        }

        Fee fee = feeRepository.findById(feeId).orElse(null);
        if (fee == null) {
            return paymentPage("<h2>Fee record not found.</h2>", HttpStatus.NOT_FOUND);
        }

        double balance = Math.max(nz(fee.getTotalAmount()) - nz(fee.getPaidAmount()), 0);
        if (balance <= 0) {
            return paymentPage("<h2>This fee is already fully paid.</h2><p>Thank you!</p>", HttpStatus.OK);
        }

        SchoolSettings settings = feeService.getOrCreateSettings();
        String upiId = schoolUpiId(settings);
        if (upiId.isEmpty()) {
            return paymentPage("<h2>Online payment is not available for this school right now.</h2>", HttpStatus.BAD_REQUEST);
        }

        Student student = studentRepository.findById(fee.getStudentId()).orElse(null);
        String studentLabel = "-";
        if (student != null) {
            studentLabel = (nzStr(student.getFirstName()) + " " + nzStr(student.getLastName())).trim();
        }

        String payeeName = settings.getSchoolName() != null ? settings.getSchoolName() : "School";
        String note = ("Fee #" + fee.getId() + " " + (fee.getFeeType() != null ? fee.getFeeType() : "")).trim();
        String truncatedNote = note.length() > 80 ? note.substring(0, 80) : note;
        String uri = buildUpiUri(upiId, payeeName, balance, truncatedNote);
        String qrBase64 = generateQrCodeBase64(uri);

        String body = String.format(Locale.ROOT, """
                <h2>Pay via UPI</h2>
                <p>%s &mdash; %s</p>
                <img src="data:image/png;base64,%s" alt="UPI payment QR code" style="width:220px;height:220px;" />
                <p style="font-size:1.3rem;margin:10px 0 2px;"><strong>Rs. %.2f</strong></p>
                <p style="margin:0;color:#667085;">to <strong>%s</strong> (%s)</p>
                <p style="margin-top:16px;">
                  <a href="%s" style="display:inline-block;padding:12px 22px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;">Open in UPI app</a>
                </p>
                <p style="color:#667085;font-size:0.85rem;margin-top:24px;">
                  After paying, please share the transaction reference with the school office to get your receipt.
                </p>
                """,
                escapeHtml(fee.getFeeType() != null ? fee.getFeeType() : "Fee"),
                escapeHtml(studentLabel),
                qrBase64,
                balance,
                escapeHtml(upiId),
                escapeHtml(payeeName),
                uri);

        return paymentPage(body, HttpStatus.OK);
    }

    @GetMapping("/{feeId}/payment/upi")
    public Map<String, Object> upiPaymentDetails(@PathVariable Long feeId) {
        permissionService.requireRoles("Admin", "Accounts", "Principal");

        SchoolSettings settings = feeService.getOrCreateSettings();
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
        double[] status = feeService.calculateFeeStatus(fee.getTotalAmount(), fee.getPaidAmount());
        fee.setDueAmount(status[0]);
        fee.setPaymentStatus(feeService.statusLabel(status[1]));
        if (fee.getReceiptNo() == null || fee.getReceiptNo().isBlank()) {
            fee.setReceiptNo(feeService.generateReceiptNo());
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

    private String nzStr(String value) {
        return value == null ? "" : value;
    }

    private String escapeHtml(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }

    private ResponseEntity<String> paymentPage(String bodyHtml, HttpStatus status) {
        String html = "<!doctype html>\n<html>\n<head>\n"
                + "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
                + "  <title>Fee Payment</title>\n</head>\n"
                + "<body style=\"font-family:system-ui,sans-serif;text-align:center;padding:32px 20px;"
                + "max-width:420px;margin:0 auto;color:#1e293b;\">\n  " + bodyHtml + "\n</body>\n</html>";
        return ResponseEntity.status(status).contentType(MediaType.TEXT_HTML).body(html);
    }

    private String generateQrCodeBase64(String content) {
        try {
            BitMatrix matrix = new QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 220, 220);
            BufferedImage image = MatrixToImageWriter.toBufferedImage(matrix);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            javax.imageio.ImageIO.write(image, "PNG", out);
            return Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            return "";
        }
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
