package com.schoolerp.dto.hostel;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class HostelAllocationCreate {
    @NotNull
    private Long studentId;
    @NotNull
    private Long roomId;
    @NotBlank
    private String bedNo;
    private LocalDate startDate;
    private LocalDate endDate;
    private String status = "Active";
    private String remarks;

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public Long getRoomId() { return roomId; }
    public void setRoomId(Long v) { this.roomId = v; }
    public String getBedNo() { return bedNo; }
    public void setBedNo(String v) { this.bedNo = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
