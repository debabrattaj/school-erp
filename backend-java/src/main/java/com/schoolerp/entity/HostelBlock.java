package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "hostel_blocks")
public class HostelBlock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String blockName;

    @Column(nullable = false)
    private String hostelType = "Boys";

    private String wardenName;
    private String wardenPhone;
    private Boolean isActive = true;
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getBlockName() { return blockName; }
    public void setBlockName(String v) { this.blockName = v; }
    public String getHostelType() { return hostelType; }
    public void setHostelType(String v) { this.hostelType = v; }
    public String getWardenName() { return wardenName; }
    public void setWardenName(String v) { this.wardenName = v; }
    public String getWardenPhone() { return wardenPhone; }
    public void setWardenPhone(String v) { this.wardenPhone = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
