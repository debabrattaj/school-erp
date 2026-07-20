package com.schoolerp.central.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "school_accounts")
public class SchoolAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String schoolName;

    @Column(nullable = false, unique = true)
    private String accountCode;

    @Column(unique = true)
    private String domain;

    private String schoolType = "English Medium";
    private String curriculum = "CBSE";
    private String country = "India";
    private String timezone = "Asia/Calcutta";

    @Column(nullable = false)
    private String databaseUrl;

    @Column(nullable = false)
    private String status = "Active";

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSchoolName() { return schoolName; }
    public void setSchoolName(String v) { this.schoolName = v; }
    public String getAccountCode() { return accountCode; }
    public void setAccountCode(String v) { this.accountCode = v; }
    public String getDomain() { return domain; }
    public void setDomain(String v) { this.domain = v; }
    public String getSchoolType() { return schoolType; }
    public void setSchoolType(String v) { this.schoolType = v; }
    public String getCurriculum() { return curriculum; }
    public void setCurriculum(String v) { this.curriculum = v; }
    public String getCountry() { return country; }
    public void setCountry(String v) { this.country = v; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String v) { this.timezone = v; }
    public String getDatabaseUrl() { return databaseUrl; }
    public void setDatabaseUrl(String v) { this.databaseUrl = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
