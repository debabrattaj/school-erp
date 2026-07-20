package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "teachers")
public class Teacher {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String employeeNo;

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String email;
    private String phone;
    private String gender;

    private String department;
    private String subject;
    private String assignedClass;
    private String qualification;

    private LocalDate joiningDate;
    private String employmentType;
    private String salaryGrade;

    private String photoUrl;
    private String address;

    private boolean isClassTeacher = false;

    @Column(name = "class_id")
    private Long classId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getEmployeeNo() { return employeeNo; }
    public void setEmployeeNo(String v) { this.employeeNo = v; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }
    public String getGender() { return gender; }
    public void setGender(String v) { this.gender = v; }
    public String getDepartment() { return department; }
    public void setDepartment(String v) { this.department = v; }
    public String getSubject() { return subject; }
    public void setSubject(String v) { this.subject = v; }
    public String getAssignedClass() { return assignedClass; }
    public void setAssignedClass(String v) { this.assignedClass = v; }
    public String getQualification() { return qualification; }
    public void setQualification(String v) { this.qualification = v; }
    public LocalDate getJoiningDate() { return joiningDate; }
    public void setJoiningDate(LocalDate v) { this.joiningDate = v; }
    public String getEmploymentType() { return employmentType; }
    public void setEmploymentType(String v) { this.employmentType = v; }
    public String getSalaryGrade() { return salaryGrade; }
    public void setSalaryGrade(String v) { this.salaryGrade = v; }
    public String getPhotoUrl() { return photoUrl; }
    public void setPhotoUrl(String v) { this.photoUrl = v; }
    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }
    @com.fasterxml.jackson.annotation.JsonProperty("is_class_teacher")
    public boolean isClassTeacher() { return isClassTeacher; }
    public void setClassTeacher(boolean v) { this.isClassTeacher = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
}
