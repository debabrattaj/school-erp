package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "exams")
public class Exam {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String examName;
    private String examType;

    @Column(nullable = false)
    private String className;

    @Column(nullable = false)
    private String section;

    @Column(nullable = false)
    private LocalDate examDate;

    private String academicYear;
    private String remarks;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getExamName() { return examName; }
    public void setExamName(String v) { this.examName = v; }
    public String getExamType() { return examType; }
    public void setExamType(String v) { this.examType = v; }
    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getSection() { return section; }
    public void setSection(String v) { this.section = v; }
    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate v) { this.examDate = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
