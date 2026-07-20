package com.schoolerp.controller;

import com.schoolerp.dto.communication.CommunicationLogCreate;
import com.schoolerp.dto.communication.CommunicationTemplateCreate;
import com.schoolerp.entity.CommunicationLog;
import com.schoolerp.entity.CommunicationTemplate;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.CommunicationLogRepository;
import com.schoolerp.repository.CommunicationTemplateRepository;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.MailerService;
import com.schoolerp.service.WhatsAppService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/communications.py. */
@RestController
@RequestMapping("/communications")
public class CommunicationController {

    private static final List<String> VALID_CHANNELS = List.of("WhatsApp", "SMS", "Email", "In App");
    private static final List<String> VALID_TEMPLATE_STATUSES = List.of("Active", "Inactive", "Draft");
    private static final List<String> VALID_LOG_STATUSES = List.of("Queued", "Sent", "Failed");

    private final CommunicationTemplateRepository templateRepository;
    private final CommunicationLogRepository logRepository;
    private final PermissionService permissionService;
    private final MailerService mailerService;
    private final WhatsAppService whatsAppService;

    public CommunicationController(
            CommunicationTemplateRepository templateRepository,
            CommunicationLogRepository logRepository,
            PermissionService permissionService,
            MailerService mailerService,
            WhatsAppService whatsAppService
    ) {
        this.templateRepository = templateRepository;
        this.logRepository = logRepository;
        this.permissionService = permissionService;
        this.mailerService = mailerService;
        this.whatsAppService = whatsAppService;
    }

    // ===================== templates =====================

    @GetMapping("/templates/")
    public List<CommunicationTemplate> getTemplates(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String status
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return templateRepository.findAll().stream()
                .filter(t -> category == null || category.equals(t.getCategory()))
                .filter(t -> status == null || status.equals(t.getStatus()))
                .sorted(Comparator.comparing(CommunicationTemplate::getId).reversed())
                .toList();
    }

    @PostMapping("/templates/")
    public CommunicationTemplate createTemplate(@Valid @RequestBody CommunicationTemplateCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        validateTemplate(payload);

        if (templateRepository.findByTemplateName(payload.getTemplateName()).isPresent()) {
            throw ApiException.badRequest("Template name already exists");
        }

        CommunicationTemplate template = new CommunicationTemplate();
        applyTemplatePayload(template, payload);
        return templateRepository.save(template);
    }

    @PutMapping("/templates/{templateId}")
    public CommunicationTemplate updateTemplate(@PathVariable Long templateId, @Valid @RequestBody CommunicationTemplateCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        CommunicationTemplate template = requireTemplate(templateId);
        validateTemplate(payload);

        templateRepository.findByTemplateName(payload.getTemplateName()).ifPresent(existing -> {
            if (!existing.getId().equals(templateId)) {
                throw ApiException.badRequest("Template name already exists");
            }
        });

        applyTemplatePayload(template, payload);
        return templateRepository.save(template);
    }

    @DeleteMapping("/templates/{templateId}")
    public Map<String, String> deleteTemplate(@PathVariable Long templateId) {
        permissionService.requireRoles("Admin");
        CommunicationTemplate template = requireTemplate(templateId);
        templateRepository.delete(template);
        return Map.of("message", "Communication template deleted successfully");
    }

    // ===================== logs =====================

    @GetMapping("/logs/")
    public List<Map<String, Object>> getLogs(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String status
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        return logRepository.findAll().stream()
                .filter(l -> category == null || category.equals(l.getCategory()))
                .filter(l -> status == null || status.equals(l.getStatus()))
                .sorted(Comparator.comparing(CommunicationLog::getId).reversed())
                .map(this::serializeLog)
                .toList();
    }

    @PostMapping("/logs/")
    public Map<String, Object> createLog(@Valid @RequestBody CommunicationLogCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        validateLog(payload);

        CommunicationLog log = new CommunicationLog();
        log.setTemplateId(payload.getTemplateId());
        log.setChannel(payload.getChannel());
        log.setCategory(payload.getCategory());
        log.setRecipientName(payload.getRecipientName());
        log.setRecipientPhone(payload.getRecipientPhone());
        log.setRecipientEmail(payload.getRecipientEmail());
        log.setMessageBody(payload.getMessageBody());
        log.setRelatedModule(payload.getRelatedModule());
        log.setRelatedRecordId(payload.getRelatedRecordId());
        log.setStatus(payload.getStatus());
        log.setErrorMessage(payload.getErrorMessage());
        if ("Sent".equals(payload.getStatus())) {
            log.setSentAt(LocalDateTime.now());
        }

        deliverMessage(log);
        log = logRepository.save(log);
        return serializeLog(log);
    }

    @PostMapping("/logs/{logId}/send")
    public Map<String, Object> sendLog(@PathVariable Long logId) {
        permissionService.requireRoles("Admin", "Principal", "Teacher", "Accounts");
        CommunicationLog log = requireLog(logId);
        deliverMessage(log);
        log = logRepository.save(log);
        return serializeLog(log);
    }

    @PutMapping("/logs/{logId}/status")
    public Map<String, Object> updateLogStatus(@PathVariable Long logId, @RequestParam String status) {
        permissionService.requireRoles("Admin", "Principal");
        if (!VALID_LOG_STATUSES.contains(status)) {
            throw ApiException.badRequest("Invalid message status");
        }

        CommunicationLog log = requireLog(logId);
        log.setStatus(status);
        if ("Sent".equals(status)) {
            log.setSentAt(LocalDateTime.now());
        }
        log = logRepository.save(log);
        return serializeLog(log);
    }

    // ===================== delivery helpers =====================

    private void deliverMessage(CommunicationLog log) {
        if ("Email".equals(log.getChannel())) {
            deliverEmail(log);
        } else if ("WhatsApp".equals(log.getChannel()) || "SMS".equals(log.getChannel())) {
            deliverWhatsapp(log);
        } else {
            markSent(log);
        }
    }

    private void deliverEmail(CommunicationLog log) {
        if (log.getRecipientEmail() == null || log.getRecipientEmail().isBlank()) {
            markFailed(log, "No recipient email address");
            return;
        }
        String subject = emailSubjectFor(log);
        if (mailerService.sendEmail(log.getRecipientEmail().trim(), subject, log.getMessageBody())) {
            markSent(log);
        } else {
            markFailed(log, "Email delivery failed");
        }
    }

    private void deliverWhatsapp(CommunicationLog log) {
        if (log.getRecipientPhone() == null || log.getRecipientPhone().isBlank()) {
            markFailed(log, "No recipient phone number");
            return;
        }
        if (whatsAppService.sendWhatsapp(log.getRecipientPhone().trim(), log.getMessageBody())) {
            markSent(log);
        } else {
            markFailed(log, "WhatsApp delivery failed");
        }
    }

    private String emailSubjectFor(CommunicationLog log) {
        if (log.getTemplateId() != null) {
            CommunicationTemplate template = templateRepository.findById(log.getTemplateId()).orElse(null);
            if (template != null && template.getSubject() != null && !template.getSubject().isBlank()) {
                return template.getSubject().trim();
            }
        }
        if (log.getCategory() != null && !log.getCategory().isBlank()) {
            return log.getCategory().trim();
        }
        return "Message from your school";
    }

    private void markSent(CommunicationLog log) {
        log.setStatus("Sent");
        log.setSentAt(LocalDateTime.now());
        log.setErrorMessage(null);
    }

    private void markFailed(CommunicationLog log, String reason) {
        log.setStatus("Failed");
        log.setErrorMessage(reason);
        log.setSentAt(null);
    }

    // ===================== validation / lookup helpers =====================

    private void validateTemplate(CommunicationTemplateCreate payload) {
        if (payload.getTemplateName() == null || payload.getTemplateName().trim().isEmpty()) {
            throw ApiException.badRequest("Template name is required");
        }
        if (payload.getChannel() != null && !VALID_CHANNELS.contains(payload.getChannel())) {
            throw ApiException.badRequest("Invalid communication channel");
        }
        if (payload.getCategory() == null || payload.getCategory().trim().isEmpty()) {
            throw ApiException.badRequest("Category is required");
        }
        if (payload.getBody() == null || payload.getBody().trim().isEmpty()) {
            throw ApiException.badRequest("Template body is required");
        }
        if (payload.getStatus() != null && !VALID_TEMPLATE_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid template status");
        }
    }

    private void validateLog(CommunicationLogCreate payload) {
        if (payload.getTemplateId() != null && !templateRepository.existsById(payload.getTemplateId())) {
            throw ApiException.notFound("Communication template not found");
        }
        if (payload.getChannel() != null && !VALID_CHANNELS.contains(payload.getChannel())) {
            throw ApiException.badRequest("Invalid communication channel");
        }
        if (payload.getCategory() == null || payload.getCategory().trim().isEmpty()) {
            throw ApiException.badRequest("Category is required");
        }
        if (payload.getRecipientName() == null || payload.getRecipientName().trim().isEmpty()) {
            throw ApiException.badRequest("Recipient name is required");
        }
        if (payload.getMessageBody() == null || payload.getMessageBody().trim().isEmpty()) {
            throw ApiException.badRequest("Message body is required");
        }
        if (payload.getStatus() != null && !VALID_LOG_STATUSES.contains(payload.getStatus())) {
            throw ApiException.badRequest("Invalid message status");
        }
    }

    private void applyTemplatePayload(CommunicationTemplate template, CommunicationTemplateCreate payload) {
        template.setTemplateName(payload.getTemplateName());
        template.setChannel(payload.getChannel());
        template.setCategory(payload.getCategory());
        template.setAudience(payload.getAudience());
        template.setSubject(payload.getSubject());
        template.setBody(payload.getBody());
        template.setVariables(payload.getVariables());
        template.setLanguage(payload.getLanguage());
        template.setStatus(payload.getStatus());
        template.setRemarks(payload.getRemarks());
    }

    private CommunicationTemplate requireTemplate(Long id) {
        return templateRepository.findById(id).orElseThrow(() -> ApiException.notFound("Communication template not found"));
    }

    private CommunicationLog requireLog(Long id) {
        return logRepository.findById(id).orElseThrow(() -> ApiException.notFound("Communication log not found"));
    }

    private Map<String, Object> serializeLog(CommunicationLog log) {
        CommunicationTemplate template = log.getTemplateId() != null
                ? templateRepository.findById(log.getTemplateId()).orElse(null)
                : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", log.getId());
        body.put("template_id", log.getTemplateId());
        body.put("template_name", template != null ? template.getTemplateName() : null);
        body.put("channel", log.getChannel());
        body.put("category", log.getCategory());
        body.put("recipient_name", log.getRecipientName());
        body.put("recipient_phone", log.getRecipientPhone());
        body.put("recipient_email", log.getRecipientEmail());
        body.put("message_body", log.getMessageBody());
        body.put("related_module", log.getRelatedModule());
        body.put("related_record_id", log.getRelatedRecordId());
        body.put("status", log.getStatus());
        body.put("sent_at", log.getSentAt());
        body.put("error_message", log.getErrorMessage());
        body.put("created_at", log.getCreatedAt());
        body.put("updated_at", log.getUpdatedAt());
        return body;
    }
}
