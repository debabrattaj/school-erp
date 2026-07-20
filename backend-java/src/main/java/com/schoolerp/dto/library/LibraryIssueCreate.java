package com.schoolerp.dto.library;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class LibraryIssueCreate {
    @NotNull
    private Long bookId;
    @NotNull
    private Long studentId;
    @NotNull
    private LocalDate issueDate;
    private LocalDate dueDate;
    private LocalDate returnDate;
    private String status = "Issued";
    private Double fineAmount = 0.0;
    private String remarks;

    public Long getBookId() { return bookId; }
    public void setBookId(Long v) { this.bookId = v; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public LocalDate getIssueDate() { return issueDate; }
    public void setIssueDate(LocalDate v) { this.issueDate = v; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate v) { this.dueDate = v; }
    public LocalDate getReturnDate() { return returnDate; }
    public void setReturnDate(LocalDate v) { this.returnDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public Double getFineAmount() { return fineAmount; }
    public void setFineAmount(Double v) { this.fineAmount = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
