package com.schoolerp.dto.schoolclass;

import jakarta.validation.constraints.NotBlank;

public class SchoolClassCreate {
    @NotBlank
    private String className;
    @NotBlank
    private String section;
    private String classTeacher;
    private Long classTeacherId;
    private String roomNo;

    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getSection() { return section; }
    public void setSection(String v) { this.section = v; }
    public String getClassTeacher() { return classTeacher; }
    public void setClassTeacher(String v) { this.classTeacher = v; }
    public Long getClassTeacherId() { return classTeacherId; }
    public void setClassTeacherId(Long v) { this.classTeacherId = v; }
    public String getRoomNo() { return roomNo; }
    public void setRoomNo(String v) { this.roomNo = v; }
}
