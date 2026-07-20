package com.schoolerp.service;

import com.schoolerp.config.SchoolErpProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

/**
 * Pluggable WhatsApp sender (Twilio WhatsApp API), direct port of
 * backend/app/whatsapp.py. Used for both the WhatsApp and SMS communication
 * channels. Uses the real API when configured, falls back to logging
 * otherwise, and never throws.
 */
@Service
public class WhatsAppService {

    private static final Logger log = LoggerFactory.getLogger("whatsapp");

    private final SchoolErpProperties properties;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public WhatsAppService(SchoolErpProperties properties) {
        this.properties = properties;
    }

    public boolean isConfigured() {
        var whatsapp = properties.getWhatsapp();
        return isSet(whatsapp.getTwilioAccountSid()) && isSet(whatsapp.getTwilioAuthToken()) && isSet(whatsapp.getTwilioWhatsappFrom());
    }

    /** Turn a stored phone number into a 'whatsapp:+&lt;e164&gt;' address. */
    public String normalizeWhatsappNumber(String raw) {
        String number = (raw == null ? "" : raw).strip().replace(" ", "").replace("-", "");
        if (number.startsWith("whatsapp:")) {
            return number;
        }
        if (!number.startsWith("+")) {
            String cc = properties.getWhatsapp().getDefaultCountryCode().strip();
            number = cc + number.replaceFirst("^0+", "");
        }
        return "whatsapp:" + number;
    }

    /** Returns true on success (or in log-only mode), false on failure. Never throws. */
    public boolean sendWhatsapp(String toPhone, String body) {
        String to = toPhone == null ? "" : toPhone.strip();
        if (to.isEmpty()) {
            return false;
        }

        if (!isConfigured()) {
            log.info("[whatsapp:log-mode] To={}\n{}", to, body);
            return true;
        }

        var whatsapp = properties.getWhatsapp();
        String sid = whatsapp.getTwilioAccountSid().strip();
        String token = whatsapp.getTwilioAuthToken().strip();
        String sender = whatsapp.getTwilioWhatsappFrom().strip();

        String url = "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json";
        String form = "From=" + urlEncode(sender) + "&To=" + urlEncode(normalizeWhatsappNumber(to)) + "&Body=" + urlEncode(body);
        String auth = Base64.getEncoder().encodeToString((sid + ":" + token).getBytes(StandardCharsets.UTF_8));

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Basic " + auth)
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                log.info("WhatsApp queued to {}", to);
                return true;
            }
            log.error("WhatsApp send to {} failed: HTTP {} {}", to, response.statusCode(), response.body());
            return false;
        } catch (Exception e) {
            log.error("WhatsApp send to {} failed: {}", to, e.getMessage());
            return false;
        }
    }

    private boolean isSet(String value) {
        return value != null && !value.isBlank();
    }

    private String urlEncode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
