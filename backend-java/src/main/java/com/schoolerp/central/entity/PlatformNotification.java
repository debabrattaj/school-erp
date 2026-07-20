package com.schoolerp.central.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Notifications pushed by the owner to school admins. */
@Entity
@Table(name = "platform_notifications")
public class PlatformNotification {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "account_id")
    private Long accountId; // null = broadcast to all

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String message;

    private String notificationType = "info"; // info / warning / urgent
    private boolean isRead = false;

    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getAccountId() { return accountId; }
    public void setAccountId(Long v) { this.accountId = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { this.title = v; }
    public String getMessage() { return message; }
    public void setMessage(String v) { this.message = v; }
    public String getNotificationType() { return notificationType; }
    public void setNotificationType(String v) { this.notificationType = v; }
    public boolean isRead() { return isRead; }
    public void setRead(boolean v) { this.isRead = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
}
