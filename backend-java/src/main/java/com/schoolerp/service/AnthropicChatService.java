package com.schoolerp.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.List;
import java.util.Map;

/**
 * AI fallback for the chatbot's intent classifier, direct port of the
 * Claude call in backend/app/routes/chatbot.py's llm_classify_or_reply.
 * Only reached when the keyword matcher scores every intent at 0. Carries
 * nothing but the user's raw message text - never given student records,
 * tool access, or database access - so it can't be used to bypass the
 * per-role/per-parent scoping enforced by resolve_student(). Returns
 * (null, null) when no API key is configured or the call fails, matching
 * the Python source's "fall back to the static help menu" behavior.
 */
@Service
public class AnthropicChatService {

    private static final Logger log = LoggerFactory.getLogger(AnthropicChatService.class);
    private static final String SYSTEM_PROMPT = """
            You are the fallback classifier for a school ERP chatbot. A keyword \
            matcher already tried and failed to understand the user's message. \
            Decide: does it match one of the intents below? If so, return that \
            intent and leave reply empty. If not - small talk, a general question, \
            or anything these intents don't cover - return intent "none" and write \
            a short (1-2 sentence), friendly reply yourself.

            Intents:
            - greeting: hello/hi/etc.
            - help: asking what the assistant can do
            - attendance: attendance percentage or present/absent/late counts
            - fees: fee dues, payments, balance
            - marks: exam results, grades, percentage
            - summary: which class/section/roll number a student is in
            - history: past academic years, promotion outcomes
            - timetable: today's class schedule
            - exams_upcoming: date of the next exam
            - class_teacher: who the class teacher is
            - transport: bus route or pickup point
            - library: books currently issued
            - year: the current academic year
            - school: the school's name, address, phone, principal

            You have NOT been given any student records, grades, fees, or other \
            personal data in this conversation - never invent or imply specific \
            data (names, numbers, dates) in your reply. If the user seems to want \
            data you don't have, tell them to rephrase using the words above.

            Respond with ONLY a JSON object of the form {"intent": "...", "reply": "..."} \
            and no other text. "intent" must be one of the intents above or "none".""";

    private final SchoolErpProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public AnthropicChatService(SchoolErpProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        String key = properties.getAi().getAnthropicApiKey();
        return key != null && !key.isBlank();
    }

    public record ClassificationResult(String intent, String reply) {
    }

    /** Returns (null intent, null reply) if unconfigured or the call fails. */
    public ClassificationResult classifyOrReply(String message, List<String> validIntents) {
        if (!isConfigured()) {
            return new ClassificationResult(null, null);
        }
        try {
            Map<String, Object> body = Map.of(
                    "model", "claude-opus-4-8",
                    "max_tokens", 300,
                    "system", SYSTEM_PROMPT,
                    "messages", List.of(Map.of("role", "user", "content", message))
            );
            String json = objectMapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.anthropic.com/v1/messages"))
                    .timeout(Duration.ofSeconds(15))
                    .header("x-api-key", properties.getAi().getAnthropicApiKey())
                    .header("anthropic-version", "2023-06-01")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("Anthropic chatbot fallback failed: HTTP {} {}", response.statusCode(), response.body());
                return new ClassificationResult(null, null);
            }

            JsonNode root = objectMapper.readTree(response.body());
            String text = "";
            for (JsonNode block : root.path("content")) {
                if ("text".equals(block.path("type").asText())) {
                    text = block.path("text").asText("");
                    break;
                }
            }

            JsonNode parsed = objectMapper.readTree(text);
            String intent = parsed.path("intent").asText(null);
            String reply = parsed.path("reply").asText(null);

            if (intent == null || !validIntents.contains(intent)) {
                intent = null;
            }
            if (reply != null && reply.isBlank()) {
                reply = null;
            }
            return new ClassificationResult(intent, reply);
        } catch (Exception e) {
            log.warn("Anthropic chatbot fallback failed: {}", e.getMessage());
            return new ClassificationResult(null, null);
        }
    }
}
