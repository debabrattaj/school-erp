package com.schoolerp.controller;

import com.schoolerp.dto.accounting.AccountTransactionCreate;
import com.schoolerp.entity.*;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** Direct port of backend/app/routes/accounting.py. */
@RestController
@RequestMapping("/accounting")
public class AccountingController {

    private static final List<String> VIEW_ROLES = List.of("Admin", "Principal", "Accounts");
    private static final List<String> MANAGE_ROLES = List.of("Admin", "Accounts");
    private static final Set<String> INVENTORY_PURCHASE_TYPES = Set.of("Stock In");
    private static final String CASH_LEDGER = "Cash";

    private final FeeRepository feeRepository;
    private final InventoryItemRepository inventoryItemRepository;
    private final InventoryTransactionRepository inventoryTransactionRepository;
    private final AccountTransactionRepository accountTransactionRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public AccountingController(
            FeeRepository feeRepository,
            InventoryItemRepository inventoryItemRepository,
            InventoryTransactionRepository inventoryTransactionRepository,
            AccountTransactionRepository accountTransactionRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.feeRepository = feeRepository;
        this.inventoryItemRepository = inventoryItemRepository;
        this.inventoryTransactionRepository = inventoryTransactionRepository;
        this.accountTransactionRepository = accountTransactionRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    @GetMapping("/summary")
    public Map<String, Object> getSummary(
            @RequestParam(name = "start_date", required = false) LocalDate startDate,
            @RequestParam(name = "end_date", required = false) LocalDate endDate
    ) {
        permissionService.requireRoles(VIEW_ROLES.toArray(new String[0]));

        List<Fee> fees = feeIncomeList(startDate, endDate);
        List<InventoryTransaction> inventoryRecords = inventoryExpenseList(startDate, endDate);
        List<AccountTransaction> manualEntries = manualEntriesList(startDate, endDate);

        double feeIncome = fees.stream().mapToDouble(f -> f.getPaidAmount() != null ? f.getPaidAmount() : 0).sum();
        double inventoryExpense = inventoryRecords.stream().mapToDouble(r -> r.getTotalCost() != null ? r.getTotalCost() : 0).sum();
        double otherIncome = manualEntries.stream().filter(e -> "Income".equals(e.getEntryType())).mapToDouble(AccountTransaction::getAmount).sum();
        double otherExpense = manualEntries.stream().filter(e -> "Expense".equals(e.getEntryType())).mapToDouble(AccountTransaction::getAmount).sum();

        Map<String, double[]> monthly = new TreeMap<>();
        DateTimeFormatter monthFmt = DateTimeFormatter.ofPattern("yyyy-MM");

        for (Fee fee : fees) {
            String key = fee.getPaymentDate().format(monthFmt);
            double[] bucket = monthly.computeIfAbsent(key, k -> new double[2]);
            bucket[0] += fee.getPaidAmount() != null ? fee.getPaidAmount() : 0;
        }
        for (InventoryTransaction record : inventoryRecords) {
            String key = record.getTransactionDate().format(monthFmt);
            double[] bucket = monthly.computeIfAbsent(key, k -> new double[2]);
            bucket[1] += record.getTotalCost() != null ? record.getTotalCost() : 0;
        }
        for (AccountTransaction entry : manualEntries) {
            String key = entry.getEntryDate().format(monthFmt);
            double[] bucket = monthly.computeIfAbsent(key, k -> new double[2]);
            if ("Income".equals(entry.getEntryType())) {
                bucket[0] += entry.getAmount();
            } else {
                bucket[1] += entry.getAmount();
            }
        }

        List<Map<String, Object>> monthlyList = new ArrayList<>();
        for (Map.Entry<String, double[]> entry : monthly.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", entry.getKey());
            row.put("income", entry.getValue()[0]);
            row.put("expense", entry.getValue()[1]);
            monthlyList.add(row);
        }

        double totalIncome = feeIncome + otherIncome;
        double totalExpense = inventoryExpense + otherExpense;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fee_income", feeIncome);
        body.put("inventory_expense", inventoryExpense);
        body.put("other_income", otherIncome);
        body.put("other_expense", otherExpense);
        body.put("total_income", totalIncome);
        body.put("total_expense", totalExpense);
        body.put("net_balance", totalIncome - totalExpense);
        body.put("monthly", monthlyList);
        return body;
    }

    @GetMapping("/ledger")
    public List<Map<String, Object>> getLedger(
            @RequestParam(name = "start_date", required = false) LocalDate startDate,
            @RequestParam(name = "end_date", required = false) LocalDate endDate,
            @RequestParam(name = "entry_type", required = false) String entryType
    ) {
        permissionService.requireRoles(VIEW_ROLES.toArray(new String[0]));

        List<LedgerRow> entries = buildLedgerEntries(startDate, endDate);
        if (entryType != null) {
            entries = entries.stream().filter(e -> entryType.equals(e.entryType)).toList();
        }
        entries = entries.stream()
                .sorted(Comparator.comparing((LedgerRow e) -> e.date).reversed())
                .toList();

        List<Map<String, Object>> result = new ArrayList<>();
        for (LedgerRow row : entries) {
            result.add(row.toMap());
        }
        return result;
    }

    @GetMapping("/export/tally")
    public ResponseEntity<String> exportTallyXml(
            @RequestParam(name = "start_date", required = false) LocalDate startDate,
            @RequestParam(name = "end_date", required = false) LocalDate endDate
    ) {
        permissionService.requireRoles(VIEW_ROLES.toArray(new String[0]));

        List<LedgerRow> entries = buildLedgerEntries(startDate, endDate).stream()
                .filter(e -> e.amount > 0)
                .sorted(Comparator.comparing((LedgerRow e) -> e.date))
                .toList();

        if (entries.isEmpty()) {
            throw ApiException.notFound("No ledger entries in the selected period to export");
        }

        Set<String> incomeCategories = new TreeSet<>();
        Set<String> expenseCategories = new TreeSet<>();
        for (LedgerRow entry : entries) {
            if ("Income".equals(entry.entryType)) {
                incomeCategories.add(entry.category);
            } else {
                expenseCategories.add(entry.category);
            }
        }

        StringBuilder messages = new StringBuilder();
        for (String name : incomeCategories) {
            messages.append(tallyLedgerMaster(name, "Indirect Incomes"));
        }
        for (String name : expenseCategories) {
            messages.append(tallyLedgerMaster(name, "Indirect Expenses"));
        }
        for (LedgerRow entry : entries) {
            messages.append(tallyVoucher(entry));
        }

        String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<ENVELOPE>"
                + "<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>"
                + "<BODY><IMPORTDATA>"
                + "<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>"
                + "<REQUESTDATA>" + messages + "</REQUESTDATA>"
                + "</IMPORTDATA></BODY>"
                + "</ENVELOPE>";

        String first = entries.get(0).date.toString();
        String last = entries.get(entries.size() - 1).date.toString();
        String filename = "tally-vouchers-" + first + "-to-" + last + ".xml";

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_XML)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(xml);
    }

    @GetMapping("/entries/")
    public List<AccountTransaction> getEntries() {
        permissionService.requireRoles(VIEW_ROLES.toArray(new String[0]));
        return accountTransactionRepository.findAll().stream()
                .sorted(Comparator.comparing(AccountTransaction::getEntryDate).reversed())
                .toList();
    }

    @PostMapping("/entries/")
    public AccountTransaction createEntry(@Valid @RequestBody AccountTransactionCreate payload) {
        permissionService.requireRoles(MANAGE_ROLES.toArray(new String[0]));
        if (!"Income".equals(payload.getEntryType()) && !"Expense".equals(payload.getEntryType())) {
            throw ApiException.badRequest("entry_type must be Income or Expense");
        }

        AccountTransaction entry = new AccountTransaction();
        entry.setEntryDate(payload.getEntryDate());
        entry.setEntryType(payload.getEntryType());
        entry.setCategory(payload.getCategory());
        entry.setAmount(payload.getAmount());
        entry.setPaymentMode(payload.getPaymentMode());
        entry.setReferenceNo(payload.getReferenceNo());
        entry.setDescription(payload.getDescription());

        return accountTransactionRepository.save(entry);
    }

    @PutMapping("/entries/{entryId}")
    public AccountTransaction updateEntry(@PathVariable Long entryId, @RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles(MANAGE_ROLES.toArray(new String[0]));
        AccountTransaction entry = accountTransactionRepository.findById(entryId)
                .orElseThrow(() -> ApiException.notFound("Ledger entry not found"));

        if (updateData.containsKey("entry_type") && updateData.get("entry_type") != null) {
            String entryType = updateData.get("entry_type").toString();
            if (!"Income".equals(entryType) && !"Expense".equals(entryType)) {
                throw ApiException.badRequest("entry_type must be Income or Expense");
            }
        }

        for (Map.Entry<String, Object> field : updateData.entrySet()) {
            Object value = field.getValue();
            String strValue = value == null ? null : value.toString();
            switch (field.getKey()) {
                case "entry_date" -> entry.setEntryDate(value == null ? null : LocalDate.parse(strValue));
                case "entry_type" -> entry.setEntryType(strValue);
                case "category" -> entry.setCategory(strValue);
                case "amount" -> entry.setAmount(value == null ? null : Double.parseDouble(strValue));
                case "payment_mode" -> entry.setPaymentMode(strValue);
                case "reference_no" -> entry.setReferenceNo(strValue);
                case "description" -> entry.setDescription(strValue);
                default -> { }
            }
        }

        return accountTransactionRepository.save(entry);
    }

    @DeleteMapping("/entries/{entryId}")
    public Map<String, String> deleteEntry(@PathVariable Long entryId) {
        permissionService.requireRoles("Admin");
        AccountTransaction entry = accountTransactionRepository.findById(entryId)
                .orElseThrow(() -> ApiException.notFound("Ledger entry not found"));
        accountTransactionRepository.delete(entry);
        return Map.of("message", "Ledger entry deleted successfully");
    }

    // ===================== helpers =====================

    private List<Fee> feeIncomeList(LocalDate start, LocalDate end) {
        return feeRepository.findAll().stream()
                .filter(f -> f.getPaidAmount() != null && f.getPaidAmount() > 0)
                .filter(f -> f.getPaymentDate() != null)
                .filter(f -> inRange(f.getPaymentDate(), start, end))
                .toList();
    }

    private List<InventoryTransaction> inventoryExpenseList(LocalDate start, LocalDate end) {
        return inventoryTransactionRepository.findAll().stream()
                .filter(t -> INVENTORY_PURCHASE_TYPES.contains(t.getTransactionType()))
                .filter(t -> t.getTotalCost() != null)
                .filter(t -> inRange(t.getTransactionDate(), start, end))
                .toList();
    }

    private List<AccountTransaction> manualEntriesList(LocalDate start, LocalDate end) {
        return accountTransactionRepository.findAll().stream()
                .filter(e -> inRange(e.getEntryDate(), start, end))
                .toList();
    }

    private boolean inRange(LocalDate value, LocalDate start, LocalDate end) {
        if (value == null) {
            return false;
        }
        if (start != null && value.isBefore(start)) {
            return false;
        }
        if (end != null && value.isAfter(end)) {
            return false;
        }
        return true;
    }

    private List<LedgerRow> buildLedgerEntries(LocalDate start, LocalDate end) {
        List<LedgerRow> entries = new ArrayList<>();

        for (Fee fee : feeIncomeList(start, end)) {
            Student student = studentRepository.findById(fee.getStudentId()).orElse(null);
            entries.add(new LedgerRow(
                    fee.getPaymentDate(), "Income", "Fee Collection",
                    fee.getFeeType() + " - " + studentName(student),
                    fee.getPaidAmount() != null ? fee.getPaidAmount() : 0,
                    "fees", fee.getReceiptNo()
            ));
        }

        for (InventoryTransaction record : inventoryExpenseList(start, end)) {
            InventoryItem item = inventoryItemRepository.findById(record.getItemId()).orElse(null);
            entries.add(new LedgerRow(
                    record.getTransactionDate(), "Expense", "Inventory Purchase",
                    item != null ? item.getItemName() : "Inventory purchase",
                    record.getTotalCost() != null ? record.getTotalCost() : 0,
                    "inventory", record.getReferenceNo()
            ));
        }

        for (AccountTransaction entry : manualEntriesList(start, end)) {
            entries.add(new LedgerRow(
                    entry.getEntryDate(), entry.getEntryType(), entry.getCategory(),
                    entry.getDescription() != null ? entry.getDescription() : entry.getCategory(),
                    entry.getAmount(), "manual", entry.getReferenceNo()
            ));
        }

        return entries;
    }

    private String studentName(Student student) {
        if (student == null) {
            return "-";
        }
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private String escapeXml(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String tallyLedgerMaster(String name, String parent) {
        return "<TALLYMESSAGE xmlns:UDF=\"TallyUDF\">"
                + "<LEDGER NAME=\"" + escapeXml(name) + "\" ACTION=\"Create\">"
                + "<NAME>" + escapeXml(name) + "</NAME>"
                + "<PARENT>" + escapeXml(parent) + "</PARENT>"
                + "</LEDGER>"
                + "</TALLYMESSAGE>";
    }

    private String tallyVoucher(LedgerRow entry) {
        boolean isIncome = "Income".equals(entry.entryType);
        String vchType = isIncome ? "Receipt" : "Payment";
        double amount = Math.round(entry.amount * 100.0) / 100.0;
        String category = entry.category;

        String narration = entry.description != null ? entry.description : category;
        if (entry.referenceNo != null && !entry.referenceNo.isBlank()) {
            narration = narration + " (Ref: " + entry.referenceNo + ")";
        }

        String debitLedger = isIncome ? CASH_LEDGER : category;
        String creditLedger = isIncome ? category : CASH_LEDGER;

        return "<TALLYMESSAGE xmlns:UDF=\"TallyUDF\">"
                + "<VOUCHER VCHTYPE=\"" + vchType + "\" ACTION=\"Create\">"
                + "<DATE>" + entry.date.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + "</DATE>"
                + "<VOUCHERTYPENAME>" + vchType + "</VOUCHERTYPENAME>"
                + "<NARRATION>" + escapeXml(narration) + "</NARRATION>"
                + "<ALLLEDGERENTRIES.LIST>"
                + "<LEDGERNAME>" + escapeXml(debitLedger) + "</LEDGERNAME>"
                + "<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>"
                + String.format("<AMOUNT>-%.2f</AMOUNT>", amount)
                + "</ALLLEDGERENTRIES.LIST>"
                + "<ALLLEDGERENTRIES.LIST>"
                + "<LEDGERNAME>" + escapeXml(creditLedger) + "</LEDGERNAME>"
                + "<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>"
                + String.format("<AMOUNT>%.2f</AMOUNT>", amount)
                + "</ALLLEDGERENTRIES.LIST>"
                + "</VOUCHER>"
                + "</TALLYMESSAGE>";
    }

    private static class LedgerRow {
        final LocalDate date;
        final String entryType;
        final String category;
        final String description;
        final double amount;
        final String source;
        final String referenceNo;

        LedgerRow(LocalDate date, String entryType, String category, String description, double amount, String source, String referenceNo) {
            this.date = date;
            this.entryType = entryType;
            this.category = category;
            this.description = description;
            this.amount = amount;
            this.source = source;
            this.referenceNo = referenceNo;
        }

        Map<String, Object> toMap() {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("date", date);
            body.put("entry_type", entryType);
            body.put("category", category);
            body.put("description", description);
            body.put("amount", amount);
            body.put("source", source);
            body.put("reference_no", referenceNo);
            return body;
        }
    }
}
