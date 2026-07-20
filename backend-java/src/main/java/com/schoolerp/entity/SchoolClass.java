package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "classes")
public class SchoolClass {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String className;

    @Column(nullable = false)
    private String section;

    private String classTeacher;
    private String roomNumber;
    private String academicYear;

    @Column(name = "class_teacher_id")
    private Long classTeacherId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getSection() { return section; }
    public void setSection(String v) { this.section = v; }
    public String getClassTeacher() { return classTeacher; }
    public void setClassTeacher(String v) { this.classTeacher = v; }
    @com.fasterxml.jackson.annotation.JsonIgnore
    public String getRoomNumber() { return roomNumber; }
    public void setRoomNumber(String v) { this.roomNumber = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getClassTeacherId() { return classTeacherId; }
    public void setClassTeacherId(Long v) { this.classTeacherId = v; }

    /** JSON-exposed alias for room_number, matching schemas.py's room_no field name. */
    @com.fasterxml.jackson.annotation.JsonProperty("room_no")
    public String getRoomNo() { return roomNumber; }
    @com.fasterxml.jackson.annotation.JsonProperty("room_no")
    public void setRoomNo(String v) { this.roomNumber = v; }
}
