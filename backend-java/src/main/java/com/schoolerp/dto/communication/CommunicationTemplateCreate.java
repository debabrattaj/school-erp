package com.schoolerp.dto.communication;

import jakarta.validation.constraints.NotBlank;

public class CommunicationTemplateCreate {
    @NotBlank
    private String templateName;
    private String channel = "WhatsApp";
    @NotBlank
    private String category;
    private String audience = "Parents";
    private String subject;
    @NotBlank
    private String body;
    private String variables;
    private String language = "English";
    private String status = "Active";
    private String remarks;

    public String getTemplateName() { return templateName; }
    public void setTemplateName(String v) { this.templateName = v; }
    public String getChannel() { return channel; }
    public void setChannel(String v) { this.channel = v; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getAudience() { return audience; }
    public void setAudience(String v) { this.audience = v; }
    public String getSubject() { return subject; }
    public void setSubject(String v) { this.subject = v; }
    public String getBody() { return body; }
    public void setBody(String v) { this.body = v; }
    public String getVariables() { return variables; }
    public void setVariables(String v) { this.variables = v; }
    public String getLanguage() { return language; }
    public void setLanguage(String v) { this.language = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
