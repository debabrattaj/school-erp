package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "student_service_tickets")
public class StudentServiceTicket {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ticket_no", nullable = false, unique = true)
    private String ticketNo;

    @Column(name = "student_id")
    private Long studentId;

    @Column(nullable = false)
    private String requesterName;

    private String requesterRole = "Parent";
    private String contactPhone;
    private String contactEmail;

    @Column(nullable = false)
    private String category;

    private String priority = "Medium";

    @Column(nullable = false)
    private String subject;

    @Lob
    @Column(nullable = false)
    private String description;

    private String assignedTo;
    private LocalDate dueDate;
    private String status = "Open";

    @Lob
    private String resolution;

    private LocalDate closedDate;

    @Lob
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTicketNo() { return ticketNo; }
    public void setTicketNo(String v) { this.ticketNo = v; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public String getRequesterName() { return requesterName; }
    public void setRequesterName(String v) { this.requesterName = v; }
    public String getRequesterRole() { return requesterRole; }
    public void setRequesterRole(String v) { this.requesterRole = v; }
    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String v) { this.contactPhone = v; }
    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String v) { this.contactEmail = v; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getPriority() { return priority; }
    public void setPriority(String v) { this.priority = v; }
    public String getSubject() { return subject; }
    public void setSubject(String v) { this.subject = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { this.description = v; }
    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String v) { this.assignedTo = v; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate v) { this.dueDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getResolution() { return resolution; }
    public void setResolution(String v) { this.resolution = v; }
    public LocalDate getClosedDate() { return closedDate; }
    public void setClosedDate(LocalDate v) { this.closedDate = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
