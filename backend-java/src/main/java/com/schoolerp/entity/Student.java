package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "students")
public class Student {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String admissionNo;
    private String rollNo;

    @Column(name = "class_id")
    private Long classId;
    private String className;
    private String section;
    private String house;
    private LocalDate admissionDate;
    private String studentStatus = "Active";
    private String residentialType = "Day Scholar";

    @Column(nullable = false)
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

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAdmissionNo() { return admissionNo; }
    public void setAdmissionNo(String v) { this.admissionNo = v; }
    public String getRollNo() { return rollNo; }
    public void setRollNo(String v) { this.rollNo = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
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
}
