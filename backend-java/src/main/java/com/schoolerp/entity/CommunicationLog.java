package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "communication_logs")
public class CommunicationLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "template_id")
    private Long templateId;

    private String channel = "WhatsApp";

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String recipientName;

    private String recipientPhone;
    private String recipientEmail;

    @Lob
    @Column(nullable = false)
    private String messageBody;

    private String relatedModule;
    private Long relatedRecordId;
    private String status = "Queued";
    private LocalDateTime sentAt;

    @Lob
    private String errorMessage;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long v) { this.templateId = v; }
    public String getChannel() { return channel; }
    public void setChannel(String v) { this.channel = v; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String v) { this.recipientName = v; }
    public String getRecipientPhone() { return recipientPhone; }
    public void setRecipientPhone(String v) { this.recipientPhone = v; }
    public String getRecipientEmail() { return recipientEmail; }
    public void setRecipientEmail(String v) { this.recipientEmail = v; }
    public String getMessageBody() { return messageBody; }
    public void setMessageBody(String v) { this.messageBody = v; }
    public String getRelatedModule() { return relatedModule; }
    public void setRelatedModule(String v) { this.relatedModule = v; }
    public Long getRelatedRecordId() { return relatedRecordId; }
    public void setRelatedRecordId(Long v) { this.relatedRecordId = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public LocalDateTime getSentAt() { return sentAt; }
    public void setSentAt(LocalDateTime v) { this.sentAt = v; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String v) { this.errorMessage = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
