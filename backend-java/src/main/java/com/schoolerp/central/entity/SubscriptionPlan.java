package com.schoolerp.central.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Available plans the owner sells to schools. */
@Entity
@Table(name = "subscription_plans")
public class SubscriptionPlan {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    private Integer priceMonthly = 0;
    private Integer priceYearly = 0;
    private Integer maxStudents;
    private Integer maxUsers;
    private String description;
    private boolean isActive = true;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public Integer getPriceMonthly() { return priceMonthly; }
    public void setPriceMonthly(Integer v) { this.priceMonthly = v; }
    public Integer getPriceYearly() { return priceYearly; }
    public void setPriceYearly(Integer v) { this.priceYearly = v; }
    public Integer getMaxStudents() { return maxStudents; }
    public void setMaxStudents(Integer v) { this.maxStudents = v; }
    public Integer getMaxUsers() { return maxUsers; }
    public void setMaxUsers(Integer v) { this.maxUsers = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { this.description = v; }
    public boolean isActive() { return isActive; }
    public void setActive(boolean v) { this.isActive = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
