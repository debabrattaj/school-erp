package com.schoolerp.dto.timetable;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class TimetableEntryCreate {
    private String academicYear;
    private Long classId;
    private String classNameSnapshot;
    private String sectionSnapshot;
    @NotBlank
    private String dayOfWeek;
    @NotNull
    private Integer periodNo;
    private String entryType = "period";
    private String label;
    private Integer durationMin;
    private String startTime;
    private String endTime;
    private String subject;
    private Long teacherId;
    private String teacherNameSnapshot;
    private String room;

    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getClassNameSnapshot() { return classNameSnapshot; }
    public void setClassNameSnapshot(String v) { this.classNameSnapshot = v; }
    public String getSectionSnapshot() { return sectionSnapshot; }
    public void setSectionSnapshot(String v) { this.sectionSnapshot = v; }
    public String getDayOfWeek() { return dayOfWeek; }
    public void setDayOfWeek(String v) { this.dayOfWeek = v; }
    public Integer getPeriodNo() { return periodNo; }
    public void setPeriodNo(Integer v) { this.periodNo = v; }
    public String getEntryType() { return entryType; }
    public void setEntryType(String v) { this.entryType = v; }
    public String getLabel() { return label; }
    public void setLabel(String v) { this.label = v; }
    public Integer getDurationMin() { return durationMin; }
    public void setDurationMin(Integer v) { this.durationMin = v; }
    public String getStartTime() { return startTime; }
    public void setStartTime(String v) { this.startTime = v; }
    public String getEndTime() { return endTime; }
    public void setEndTime(String v) { this.endTime = v; }
    public String getSubject() { return subject; }
    public void setSubject(String v) { this.subject = v; }
    public Long getTeacherId() { return teacherId; }
    public void setTeacherId(Long v) { this.teacherId = v; }
    public String getTeacherNameSnapshot() { return teacherNameSnapshot; }
    public void setTeacherNameSnapshot(String v) { this.teacherNameSnapshot = v; }
    public String getRoom() { return room; }
    public void setRoom(String v) { this.room = v; }
}
