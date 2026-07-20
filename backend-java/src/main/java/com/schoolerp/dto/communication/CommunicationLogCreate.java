package com.schoolerp.dto.communication;

import jakarta.validation.constraints.NotBlank;

public class CommunicationLogCreate {
    private Long templateId;
    private String channel = "WhatsApp";
    @NotBlank
    private String category;
    @NotBlank
    private String recipientName;
    private String recipientPhone;
    private String recipientEmail;
    @NotBlank
    private String messageBody;
    private String relatedModule;
    private Long relatedRecordId;
    private String status = "Queued";
    private String errorMessage;

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
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String v) { this.errorMessage = v; }
}
