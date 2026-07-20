package com.schoolerp.dto.student;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class StudentCreate {
    @NotBlank
    private String admissionNo;
    private String rollNo;
    private String rollNoMode = "auto";
    private String className;
    private String section;
    private String house;
    private LocalDate admissionDate;
    private String studentStatus = "Active";
    private String residentialType = "Day Scholar";
    private Long classId;
    @NotBlank
    private String firstName;
    private String lastName;
    private String gender;
    private LocalDate dob;
    private String nationality;
    private String bloodGroup;
    private String photoUrl;
    private String fatherName;
    private String motherName;
    private String guardianName;
    private String guardianPhone;
    private String guardianEmail;
    private String medicalNotes;
    private String allergies;
    private String transportRoute;
    private String pickupPoint;
    private String birthCertificate;
    private String transferCertificate;
    private String passportNo;

    public String getAdmissionNo() { return admissionNo; }
    public void setAdmissionNo(String v) { this.admissionNo = v; }
    public String getRollNo() { return rollNo; }
    public void setRollNo(String v) { this.rollNo = v; }
    public String getRollNoMode() { return rollNoMode; }
    public void setRollNoMode(String v) { this.rollNoMode = v; }
    public String getClassName() { return className; }
    public void setClassName(String v) { this.className = v; }
    public String getSection() { return section; }
    public void setSection(String v) { this.section = v; }
    public String getHouse() { return house; }
    public void setHouse(String v) { this.house = v; }
    public LocalDate getAdmissionDate() { return admissionDate; }
    public void setAdmissionDate(LocalDate v) { this.admissionDate = v; }
    public String getStudentStatus() { return studentStatus; }
    public void setStudentStatus(String v) { this.studentStatus = v; }
    public String getResidentialType() { return residentialType; }
    public void setResidentialType(String v) { this.residentialType = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String v) { this.firstName = v; }
    public String getLastName() { return lastName; }
    public void setLastName(String v) { this.lastName = v; }
    public String getGender() { return gender; }
    public void setGender(String v) { this.gender = v; }
    public LocalDate getDob() { return dob; }
    public void setDob(LocalDate v) { this.dob = v; }
    public String getNationality() { return nationality; }
    public void setNationality(String v) { this.nationality = v; }
    public String getBloodGroup() { return bloodGroup; }
    public void setBloodGroup(String v) { this.bloodGroup = v; }
    public String getPhotoUrl() { return photoUrl; }
    public void setPhotoUrl(String v) { this.photoUrl = v; }
    public String getFatherName() { return fatherName; }
    public void setFatherName(String v) { this.fatherName = v; }
    public String getMotherName() { return motherName; }
    public void setMotherName(String v) { this.motherName = v; }
    public String getGuardianName() { return guardianName; }
    public void setGuardianName(String v) { this.guardianName = v; }
    public String getGuardianPhone() { return guardianPhone; }
    public void setGuardianPhone(String v) { this.guardianPhone = v; }
    public String getGuardianEmail() { return guardianEmail; }
    public void setGuardianEmail(String v) { this.guardianEmail = v; }
    public String getMedicalNotes() { return medicalNotes; }
    public void setMedicalNotes(String v) { this.medicalNotes = v; }
    public String getAllergies() { return allergies; }
    public void setAllergies(String v) { this.allergies = v; }
    public String getTransportRoute() { return transportRoute; }
    public void setTransportRoute(String v) { this.transportRoute = v; }
    public String getPickupPoint() { return pickupPoint; }
    public void setPickupPoint(String v) { this.pickupPoint = v; }
    public String getBirthCertificate() { return birthCertificate; }
    public void setBirthCertificate(String v) { this.birthCertificate = v; }
    public String getTransferCertificate() { return transferCertificate; }
    public void setTransferCertificate(String v) { this.transferCertificate = v; }
    public String getPassportNo() { return passportNo; }
    public void setPassportNo(String v) { this.passportNo = v; }

    /** Copy this create payload's fields onto a new/existing Student entity (excludes roll_no/roll_no_mode, handled by the caller). */
    public void applyTo(com.schoolerp.entity.Student student) {
        student.setAdmissionNo(admissionNo);
        student.setClassName(className);
        student.setSection(section);
        student.setHouse(house);
        student.setAdmissionDate(admissionDate);
        student.setStudentStatus(studentStatus);
        student.setResidentialType(residentialType);
        student.setClassId(classId);
        student.setFirstName(firstName);
        student.setLastName(lastName);
        student.setGender(gender);
        student.setDob(dob);
        student.setNationality(nationality);
        student.setBloodGroup(bloodGroup);
        student.setPhotoUrl(photoUrl);
        student.setFatherName(fatherName);
        student.setMotherName(motherName);
        student.setGuardianName(guardianName);
        student.setGuardianPhone(guardianPhone);
        student.setGuardianEmail(guardianEmail);
        student.setMedicalNotes(medicalNotes);
        student.setAllergies(allergies);
        student.setTransportRoute(transportRoute);
        student.setPickupPoint(pickupPoint);
        student.setBirthCertificate(birthCertificate);
        student.setTransferCertificate(transferCertificate);
        student.setPassportNo(passportNo);
    }
}
