package com.schoolerp.controller;

import com.schoolerp.dto.studentservices.StudentServiceTicketCreate;
import com.schoolerp.entity.Student;
import com.schoolerp.entity.StudentServiceTicket;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.repository.StudentServiceTicketRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/student_services.py. */
@RestController
@RequestMapping("/student-services")
public class StudentServiceController {

    private static final List<String> VALID_ROLES = List.of("Parent", "Student", "Guardian", "Staff", "Other");
    private static final List<String> VALID_CATEGORIES = List.of(
            "General Request", "Counseling", "Documents", "Transport", "Hostel", "Fees", "Academics", "Facilities", "Complaint"
    );
    private static final List<String> VALID_PRIORITIES = List.of("Low", "Medium", "High", "Urgent");
    private static final List<String> VALID_STATUSES = List.of("Open", "In Progress", "Waiting", "Resolved", "Closed");

    private final StudentServiceTicketRepository ticketRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public StudentServiceController(
            StudentServiceTicketRepository ticketRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.ticketRepository = ticketRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> getServiceTickets(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String priority
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return ticketRepository.findAll().stream()
                .filter(t -> status == null || status.equals(t.getStatus()))
                .filter(t -> category == null || category.equals(t.getCategory()))
                .filter(t -> priority == null || priority.equals(t.getPriority()))
                .sorted(Comparator.comparing(StudentServiceTicket::getId).reversed())
                .map(this::serialize)
                .toList();
    }

    @GetMapping("/{ticketId}")
    public Map<String, Object> getServiceTicket(@PathVariable Long ticketId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return serialize(requireTicket(ticketId));
    }

    @PostMapping({"", "/"})
    public Map<String, Object> createServiceTicket(@Valid @RequestBody StudentServiceTicketCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        validatePayload(payload);

        String ticketNo = payload.getTicketNo() != null ? payload.getTicketNo().trim() : "";
        if (ticketNo.isEmpty()) {
            ticketNo = nextTicketNo();
        }
        if (ticketRepository.findByTicketNo(ticketNo).isPresent()) {
            throw ApiException.badRequest("Ticket number already exists");
        }

        StudentServiceTicket ticket = new StudentServiceTicket();
        ticket.setTicketNo(ticketNo);
        applyPayload(ticket, payload);

        return serialize(ticketRepository.save(ticket));
    }

    @PutMapping("/{ticketId}")
    public Map<String, Object> updateServiceTicket(@PathVariable Long ticketId, @Valid @RequestBody StudentServiceTicketCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        StudentServiceTicket ticket = requireTicket(ticketId);
        validatePayload(payload);

        String ticketNo = payload.getTicketNo() != null ? payload.getTicketNo().trim() : "";
        if (ticketNo.isEmpty()) {
            ticketNo = ticket.getTicketNo();
        }
        String finalTicketNo = ticketNo;
        ticketRepository.findByTicketNo(ticketNo).ifPresent(existing -> {
            if (!existing.getId().equals(ticketId)) {
                throw ApiException.badRequest("Ticket number already exists");
            }
        });

        ticket.setTicketNo(finalTicketNo);
        applyPayload(ticket, payload);

        return serialize(ticketRepository.save(ticket));
    }

    @DeleteMapping("/{ticketId}")
    public Map<String, String> deleteServiceTicket(@PathVariable Long ticketId) {
        permissionService.requireRoles("Admin");
        StudentServiceTicket ticket = requireTicket(ticketId);
        ticketRepository.delete(ticket);
        return Map.of("message", "Service ticket deleted successfully");
    }

    // ===================== helpers =====================

    private void applyPayload(StudentServiceTicket ticket, StudentServiceTicketCreate payload) {
        ticket.setStudentId(payload.getStudentId());
        ticket.setRequesterName(payload.getRequesterName());
        ticket.setRequesterRole(payload.getRequesterRole());
        ticket.setContactPhone(payload.getContactPhone());
        ticket.setContactEmail(payload.getContactEmail());
        ticket.setCategory(payload.getCategory());
        ticket.setPriority(payload.getPriority());
        ticket.setSubject(payload.getSubject());
        ticket.setDescription(payload.getDescription());
        ticket.setAssignedTo(payload.getAssignedTo());
        ticket.setDueDate(payload.getDueDate());
        ticket.setStatus(payload.getStatus());
        ticket.setResolution(payload.getResolution());
        ticket.setClosedDate(payload.getClosedDate());
        ticket.setRemarks(payload.getRemarks());
    }

    private void validatePayload(StudentServiceTicketCreate payload) {
        if (payload.getStudentId() != null && !studentRepository.existsById(payload.getStudentId())) {
            throw ApiException.notFound("Student not found");
        }
        if (payload.getRequesterName() == null || payload.getRequesterName().trim().isEmpty()) {
            throw ApiException.badRequest("Requester name is required");
        }
        if (payload.getRequesterRole() != null && !VALID_ROLES.contains(payload.getRequesterRole())) {
            throw ApiException.badRequest("Invalid requester role");
        }
        if (payload.getCategory() == null || !VALID_CATEGORIES.contains(payload.getCategory())) {
            throw ApiException.badRequest("Invalid service category");
        }
        if (payload.getPriority() != null && !VALID_PRIORITIES.contains(payload.getPriority())) {
            throw ApiException.badRequest("Invalid priority");
        }
        if (payload.getSubject() == null || payload.getSubject().trim().isEmpty()) {
            throw ApiException.badRequest("Subject is required");
        }
        if (payload.getDescription() == null || payload.getDescription().trim().isEmpty()) {
            throw ApiException.badRequest("Description is required");
        }
        if (payload.getStatus() != null && !VALID_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid ticket status");
        }
    }

    private StudentServiceTicket requireTicket(Long id) {
        return ticketRepository.findById(id).orElseThrow(() -> ApiException.notFound("Service ticket not found"));
    }

    private String nextTicketNo() {
        Long latestId = ticketRepository.findTopByOrderByIdDesc().map(StudentServiceTicket::getId).orElse(null);
        long nextNumber = (latestId != null ? latestId : 0) + 1;
        return String.format("SVC-%04d", nextNumber);
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serialize(StudentServiceTicket ticket) {
        Student student = ticket.getStudentId() != null
                ? studentRepository.findById(ticket.getStudentId()).orElse(null)
                : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", ticket.getId());
        body.put("ticket_no", ticket.getTicketNo());
        body.put("student_id", ticket.getStudentId());
        body.put("requester_name", ticket.getRequesterName());
        body.put("requester_role", ticket.getRequesterRole());
        body.put("contact_phone", ticket.getContactPhone());
        body.put("contact_email", ticket.getContactEmail());
        body.put("category", ticket.getCategory());
        body.put("priority", ticket.getPriority());
        body.put("subject", ticket.getSubject());
        body.put("description", ticket.getDescription());
        body.put("assigned_to", ticket.getAssignedTo());
        body.put("due_date", ticket.getDueDate());
        body.put("status", ticket.getStatus());
        body.put("resolution", ticket.getResolution());
        body.put("closed_date", ticket.getClosedDate());
        body.put("remarks", ticket.getRemarks());
        body.put("created_at", ticket.getCreatedAt());
        body.put("updated_at", ticket.getUpdatedAt());
        body.put("student_name", student != null ? studentName(student) : null);
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_name", student != null ? student.getClassName() : null);
        body.put("section", student != null ? student.getSection() : null);
        return body;
    }
}
