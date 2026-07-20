package com.schoolerp.service;

import com.schoolerp.config.SchoolErpProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Pluggable email sender, direct port of backend/app/mailer.py. Uses real
 * SMTP when SMTP_HOST is configured; otherwise logs the message so dev and
 * the password-reset flow keep working without a mail server. Best-effort:
 * never throws to the caller.
 */
@Service
public class MailerService {

    private static final Logger log = LoggerFactory.getLogger("mailer");

    private final JavaMailSender mailSender;
    private final SchoolErpProperties properties;

    @Value("${spring.mail.host:}")
    private String smtpHost;

    public MailerService(JavaMailSender mailSender, SchoolErpProperties properties) {
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public boolean isConfigured() {
        return smtpHost != null && !smtpHost.isBlank();
    }

    /** Returns true if sent (or logged in dev mode), false on a hard failure. Never throws. */
    public boolean sendEmail(String to, String subject, String body) {
        if (!isConfigured()) {
            log.info("[email:log-mode] To={} | Subject={}\n{}", to, subject, body);
            return true;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(properties.getMail().getFrom());
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            log.info("Email sent to {} (subject={})", to, subject);
            return true;
        } catch (Exception e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage());
            return false;
        }
    }
}
