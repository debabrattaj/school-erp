package com.schoolerp.controller;

import com.schoolerp.dto.international.InternationalDocumentCreate;
import com.schoolerp.entity.InternationalDocument;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.InternationalDocumentRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/international_documents.py. */
@RestController
@RequestMapping("/international-documents")
public class InternationalDocumentController {

    private static final List<String> VALID_STATUSES = List.of("Pending", "Submitted", "Verified", "Rejected", "Expired");

    private final InternationalDocumentRepository documentRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public InternationalDocumentController(
            InternationalDocumentRepository documentRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.documentRepository = documentRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> getDocuments(
            @RequestParam(name = "student_id", required = false) Long studentId,
            @RequestParam(required = false) String status,
            @RequestParam(name = "document_type", required = false) String documentType
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return documentRepository.findAll().stream()
                .filter(d -> studentId == null || studentId.equals(d.getStudentId()))
                .filter(d -> status == null || status.equals(d.getStatus()))
                .filter(d -> documentType == null || documentType.equals(d.getDocumentType()))
                .sorted(Comparator.comparing(InternationalDocument::getId).reversed())
                .map(this::serialize)
                .toList();
    }

    @GetMapping("/{documentId}")
    public Map<String, Object> getDocument(@PathVariable Long documentId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return serialize(requireDocument(documentId));
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createDocument(@Valid @RequestBody InternationalDocumentCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        requireStudent(payload.getStudentId());
        validatePayload(payload);

        InternationalDocument document = new InternationalDocument();
        applyPayload(document, payload);

        return serialize(documentRepository.save(document));
    }

    @PutMapping("/{documentId}")
    public Map<String, Object> updateDocument(@PathVariable Long documentId, @Valid @RequestBody InternationalDocumentCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        InternationalDocument document = requireDocument(documentId);
        requireStudent(payload.getStudentId());
        validatePayload(payload);

        applyPayload(document, payload);

        return serialize(documentRepository.save(document));
    }

    @DeleteMapping("/{documentId}")
    public Map<String, String> deleteDocument(@PathVariable Long documentId) {
        permissionService.requireRoles("Admin");
        InternationalDocument document = requireDocument(documentId);
        documentRepository.delete(document);
        return Map.of("message", "International document deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(InternationalDocument document, InternationalDocumentCreate payload) {
        document.setStudentId(payload.getStudentId());
        document.setDocumentType(payload.getDocumentType());
        document.setDocumentNo(payload.getDocumentNo());
        document.setIssueDate(payload.getIssueDate());
        document.setExpiryDate(payload.getExpiryDate());
        document.setIssuingCountry(payload.getIssuingCountry());
        document.setStatus(payload.getStatus());
        document.setFileUrl(payload.getFileUrl());
        document.setVerifiedBy(payload.getVerifiedBy());
        document.setVerifiedDate(payload.getVerifiedDate());
        document.setRemarks(payload.getRemarks());
    }

    private void validatePayload(InternationalDocumentCreate payload) {
        if (payload.getDocumentType() == null || payload.getDocumentType().trim().isEmpty()) {
            throw ApiException.badRequest("Document type is required");
        }
        if (payload.getStatus() != null && !VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid document status");
        }
    }

    private void requireStudent(Long id) {
        if (id == null || !studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }

    private InternationalDocument requireDocument(Long id) {
        return documentRepository.findById(id).orElseThrow(() -> ApiException.notFound("International document not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serialize(InternationalDocument document) {
        Student student = studentRepository.findById(document.getStudentId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", document.getId());
        body.put("student_id", document.getStudentId());
        body.put("document_type", document.getDocumentType());
        body.put("document_no", document.getDocumentNo());
        body.put("issue_date", document.getIssueDate());
        body.put("expiry_date", document.getExpiryDate());
        body.put("issuing_country", document.getIssuingCountry());
        body.put("status", document.getStatus());
        body.put("file_url", document.getFileUrl());
        body.put("verified_by", document.getVerifiedBy());
        body.put("verified_date", document.getVerifiedDate());
        body.put("remarks", document.getRemarks());
        body.put("created_at", document.getCreatedAt());
        body.put("updated_at", document.getUpdatedAt());
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_name", student != null ? student.getClassName() : null);
        body.put("section", student != null ? student.getSection() : null);
        return body;
    }
}
