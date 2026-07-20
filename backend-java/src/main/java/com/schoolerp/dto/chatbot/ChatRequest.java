package com.schoolerp.dto.chatbot;

public class ChatRequest {
    private String message;
    private Long studentId;

    public String getMessage() { return message; }
    public void setMessage(String v) { this.message = v; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
}
