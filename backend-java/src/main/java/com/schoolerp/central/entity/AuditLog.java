package com.schoolerp.central.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Append-only record of who performed a mutating action, and when. */
@Entity
@Table(name = "audit_logs")
public class AuditLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDateTime createdAt = LocalDateTime.now();
    private String accountCode;
    private String actorEmail;
    private String actorRole;

    @Column(nullable = false)
    private String method;

    @Column(nullable = false)
    private String path;

    private Integer statusCode;
    private String clientIp;

    @Lob
    private String detail;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public String getAccountCode() { return accountCode; }
    public void setAccountCode(String v) { this.accountCode = v; }
    public String getActorEmail() { return actorEmail; }
    public void setActorEmail(String v) { this.actorEmail = v; }
    public String getActorRole() { return actorRole; }
    public void setActorRole(String v) { this.actorRole = v; }
    public String getMethod() { return method; }
    public void setMethod(String v) { this.method = v; }
    public String getPath() { return path; }
    public void setPath(String v) { this.path = v; }
    public Integer getStatusCode() { return statusCode; }
    public void setStatusCode(Integer v) { this.statusCode = v; }
    public String getClientIp() { return clientIp; }
    public void setClientIp(String v) { this.clientIp = v; }
    public String getDetail() { return detail; }
    public void setDetail(String v) { this.detail = v; }
}
