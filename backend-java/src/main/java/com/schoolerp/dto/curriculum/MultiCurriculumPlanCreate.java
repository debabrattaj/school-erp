package com.schoolerp.dto.curriculum;

import jakarta.validation.constraints.NotBlank;

public class MultiCurriculumPlanCreate {
    @NotBlank
    private String programName;
    @NotBlank
    private String curriculumTrack;
    @NotBlank
    private String gradeLevel;
    @NotBlank
    private String academicYear;
    private Long classId;
    private String subjectGroups;
    private String assessmentModel;
    private String coordinator;
    private String status = "Draft";
    private String remarks;

    public String getProgramName() { return programName; }
    public void setProgramName(String v) { this.programName = v; }
    public String getCurriculumTrack() { return curriculumTrack; }
    public void setCurriculumTrack(String v) { this.curriculumTrack = v; }
    public String getGradeLevel() { return gradeLevel; }
    public void setGradeLevel(String v) { this.gradeLevel = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getSubjectGroups() { return subjectGroups; }
    public void setSubjectGroups(String v) { this.subjectGroups = v; }
    public String getAssessmentModel() { return assessmentModel; }
    public void setAssessmentModel(String v) { this.assessmentModel = v; }
    public String getCoordinator() { return coordinator; }
    public void setCoordinator(String v) { this.coordinator = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
