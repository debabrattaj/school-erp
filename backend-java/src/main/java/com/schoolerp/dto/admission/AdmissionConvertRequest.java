package com.schoolerp.dto.admission;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class AdmissionConvertRequest {
    private String admissionNo;
    @NotBlank
    private String firstName;
    private String lastName;
    private String className;
    private String section;
    private LocalDate admissionDate;
    private String studentStatus = "Active";
    private String guardianName;
    private String guardianPhone;
    private String guardianEmail;

    public String getAdmissionNo() { return admissionNo; }
    public void setAdmissionNo(String v) { this.admissionNo = v; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String v) { this.firstName = v; }
    public String getLastName() { return lastName; }
    public void setLastName(String v) { this.lastName = v; }
    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getSection() { return section; }
    public void setSection(String v) { this.section = v; }
    public LocalDate getAdmissionDate() { return admissionDate; }
    public void setAdmissionDate(LocalDate v) { this.admissionDate = v; }
    public String getStudentStatus() { return studentStatus; }
    public void setStudentStatus(String v) { this.studentStatus = v; }
    public String getGuardianName() { return guardianName; }
    public void setGuardianName(String v) { this.guardianName = v; }
    public String getGuardianPhone() { return guardianPhone; }
    public void setGuardianPhone(String v) { this.guardianPhone = v; }
    public String getGuardianEmail() { return guardianEmail; }
    public void setGuardianEmail(String v) { this.guardianEmail = v; }
}
