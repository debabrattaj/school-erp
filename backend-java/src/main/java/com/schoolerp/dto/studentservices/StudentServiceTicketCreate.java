package com.schoolerp.dto.studentservices;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class StudentServiceTicketCreate {
    private String ticketNo = "";
    private Long studentId;
    @NotBlank
    private String requesterName;
    private String requesterRole = "Parent";
    private String contactPhone;
    private String contactEmail;
    @NotNull
    private String category;
    private String priority = "Medium";
    @NotBlank
    private String subject;
    @NotBlank
    private String description;
    private String assignedTo;
    private LocalDate dueDate;
    private String status = "Open";
    private String resolution;
    private LocalDate closedDate;
    private String remarks;

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
}
