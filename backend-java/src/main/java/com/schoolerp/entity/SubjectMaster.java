package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "subjects")
public class SubjectMaster {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String subjectCode;

    @Column(nullable = false)
    private String subjectName;

    private String subjectType = "Scholastic";
    private boolean isActive = true;

    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSubjectCode() { return subjectCode; }
    public void setSubjectCode(String v) { this.subjectCode = v; }
    public String getSubjectName() { return subjectName; }
    public void setSubjectName(String v) { this.subjectName = v; }
    public String getSubjectType() { return subjectType; }
    public void setSubjectType(String v) { this.subjectType = v; }
    @com.fasterxml.jackson.annotation.JsonProperty("is_active")
    public boolean isActive() { return isActive; }
    public void setActive(boolean v) { this.isActive = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
}
