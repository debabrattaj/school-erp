package com.schoolerp.dto.attendance;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class AttendanceCreate {
    @NotNull
    private Long studentId;
    @NotNull
    private LocalDate attendanceDate;
    private String academicYear;
    private Long classId;
    private String classNameSnapshot;
    private String sectionSnapshot;
    @NotBlank
    private String status;
    private String remarks;

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public LocalDate getAttendanceDate() { return attendanceDate; }
    public void setAttendanceDate(LocalDate v) { this.attendanceDate = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getClassNameSnapshot() { return classNameSnapshot; }
    public void setClassNameSnapshot(String v) { this.classNameSnapshot = v; }
    public String getSectionSnapshot() { return sectionSnapshot; }
    public void setSectionSnapshot(String v) { this.sectionSnapshot = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
