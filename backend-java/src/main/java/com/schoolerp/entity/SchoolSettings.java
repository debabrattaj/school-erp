package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "school_settings")
public class SchoolSettings {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String schoolName = "International School";
    private String tagline;
    private String institutionType = "International School";
    private String boardAffiliation;
    private String schoolCode;
    private String website;
    private String logoUrl;

    private String campusName;
    private String campusCity;
    private String campusState;
    private String campusCountry = "India";

    private String address;
    private String phone;
    private String email;
    private String principalName;

    private String academicYear;
    private String defaultSections = "A,B,C";
    private String houses = "Red,Blue,Green,Yellow";
    private String workingDays;

    private String currency = "INR";
    private String receiptPrefix = "REC";
    private String upiId;
    private String lateFeeRule;

    private Double passPercentage = 40.0;
    private String gradeRules = "A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39";

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSchoolName() { return schoolName; }
    public void setSchoolName(String v) { this.schoolName = v; }
    public String getTagline() { return tagline; }
    public void setTagline(String v) { this.tagline = v; }
    public String getInstitutionType() { return institutionType; }
    public void setInstitutionType(String v) { this.institutionType = v; }
    public String getBoardAffiliation() { return boardAffiliation; }
    public void setBoardAffiliation(String v) { this.boardAffiliation = v; }
    public String getSchoolCode() { return schoolCode; }
    public void setSchoolCode(String v) { this.schoolCode = v; }
    public String getWebsite() { return website; }
    public void setWebsite(String v) { this.website = v; }
    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String v) { this.logoUrl = v; }
    public String getCampusName() { return campusName; }
    public void setCampusName(String v) { this.campusName = v; }
    public String getCampusCity() { return campusCity; }
    public void setCampusCity(String v) { this.campusCity = v; }
    public String getCampusState() { return campusState; }
    public void setCampusState(String v) { this.campusState = v; }
    public String getCampusCountry() { return campusCountry; }
    public void setCampusCountry(String v) { this.campusCountry = v; }
    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }
    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getPrincipalName() { return principalName; }
    public void setPrincipalName(String v) { this.principalName = v; }
    public String getAcademicYear() { return academicYear; }
    public void setAcademicYear(String v) { this.academicYear = v; }
    public String getDefaultSections() { return defaultSections; }
    public void setDefaultSections(String v) { this.defaultSections = v; }
    public String getHouses() { return houses; }
    public void setHouses(String v) { this.houses = v; }
    public String getWorkingDays() { return workingDays; }
    public void setWorkingDays(String v) { this.workingDays = v; }
    public String getCurrency() { return currency; }
    public void setCurrency(String v) { this.currency = v; }
    public String getReceiptPrefix() { return receiptPrefix; }
    public void setReceiptPrefix(String v) { this.receiptPrefix = v; }
    public String getUpiId() { return upiId; }
    public void setUpiId(String v) { this.upiId = v; }
    public String getLateFeeRule() { return lateFeeRule; }
    public void setLateFeeRule(String v) { this.lateFeeRule = v; }
    public Double getPassPercentage() { return passPercentage; }
    public void setPassPercentage(Double v) { this.passPercentage = v; }
    public String getGradeRules() { return gradeRules; }
    public void setGradeRules(String v) { this.gradeRules = v; }
}
