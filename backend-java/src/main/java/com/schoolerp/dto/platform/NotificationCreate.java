package com.schoolerp.dto.platform;

import jakarta.validation.constraints.NotBlank;

public class NotificationCreate {
    private Long accountId;
    @NotBlank
    private String title;
    @NotBlank
    private String message;
    private String notificationType = "info";

    public Long getAccountId() { return accountId; }
    public void setAccountId(Long v) { this.accountId = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { this.title = v; }
    public String getMessage() { return message; }
    public void setMessage(String v) { this.message = v; }
    public String getNotificationType() { return notificationType; }
    public void setNotificationType(String v) { this.notificationType = v; }
}
