package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** A user's custom dashboard: the JSON list of widget configs. One row per user. */
@Entity
@Table(name = "dashboard_layouts")
public class DashboardLayout {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Lob
    private String widgets;

    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long v) { this.userId = v; }
    public String getWidgets() { return widgets; }
    public void setWidgets(String v) { this.widgets = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
