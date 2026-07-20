package com.schoolerp.service;

import com.schoolerp.entity.CommunicationLog;
import com.schoolerp.entity.CommunicationTemplate;
import com.schoolerp.repository.CommunicationTemplateRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * Shared delivery logic extracted from CommunicationController so
 * NotificationService (app/notifications.py's event-driven hooks) can route
 * messages through the same channel logic as the /communications endpoints,
 * exactly like the Python source's shared deliver_message() free function.
 */
@Service
public class CommunicationDeliveryService {

    private final CommunicationTemplateRepository templateRepository;
    private final MailerService mailerService;
    private final WhatsAppService whatsAppService;

    public CommunicationDeliveryService(
            CommunicationTemplateRepository templateRepository,
            MailerService mailerService,
            WhatsAppService whatsAppService
    ) {
        this.templateRepository = templateRepository;
        this.mailerService = mailerService;
        this.whatsAppService = whatsAppService;
    }

    public void deliverMessage(CommunicationLog log) {
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
}
