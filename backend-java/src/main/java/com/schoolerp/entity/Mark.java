package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "marks")
public class Mark {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(name = "exam_id", nullable = false)
    private Long examId;

    @Column(name = "class_subject_id")
    private Long classSubjectId;
    private String subjectName;
    private String academicYear;

    @Column(name = "class_id")
    private Long classId;
    private String classNameSnapshot;
    private String sectionSnapshot;
    private String examNameSnapshot;

    private String subject;

    @Column(nullable = false)
    private Double marksObtained;
    private Double maxMarks = 100.0;
    private Double totalMarks = 100.0;

    private String grade;
    private String remarks;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public Long getExamId() { return examId; }
    public void setExamId(Long v) { this.examId = v; }
    public Long getClassSubjectId() { return classSubjectId; }
    public void setClassSubjectId(Long v) { this.classSubjectId = v; }
    public String getSubjectName() { return subjectName; }
    public void setSubjectName(String v) { this.subjectName = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getClassNameSnapshot() { return classNameSnapshot; }
    public void setClassNameSnapshot(String v) { this.classNameSnapshot = v; }
    public String getSectionSnapshot() { return sectionSnapshot; }
    public void setSectionSnapshot(String v) { this.sectionSnapshot = v; }
    public String getExamNameSnapshot() { return examNameSnapshot; }
    public void setExamNameSnapshot(String v) { this.examNameSnapshot = v; }
    public String getSubject() { return subject; }
    public void setSubject(String v) { this.subject = v; }
    public Double getMarksObtained() { return marksObtained; }
    public void setMarksObtained(Double v) { this.marksObtained = v; }
    public Double getMaxMarks() { return maxMarks; }
    public void setMaxMarks(Double v) { this.maxMarks = v; }
    public Double getTotalMarks() { return totalMarks; }
    public void setTotalMarks(Double v) { this.totalMarks = v; }
    public String getGrade() { return grade; }
    public void setGrade(String v) { this.grade = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
