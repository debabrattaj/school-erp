package com.schoolerp.exception;

import com.schoolerp.tenant.TenantDataSourceManager;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.jpa.JpaSystemException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** Maps every error to FastAPI's {"detail": "..."} response shape. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> handleApiException(ApiException ex) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(ex.getStatus());
        if (ex.getExtraHeaderPair() != null) {
            builder.header(ex.getExtraHeaderPair()[0], ex.getExtraHeaderPair()[1]);
        }
        return builder.body(Map.of("detail", ex.getMessage()));
    }

    @ExceptionHandler(TenantDataSourceManager.TenantNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleTenantNotFound(TenantDataSourceManager.TenantNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("detail", "You do not have permission to access this resource"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(FieldError::getDefaultMessage)
                .orElse("Validation failed");
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("detail", message));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, String>> handleConstraintViolation(ConstraintViolationException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("detail", ex.getMessage()));
    }

    /**
     * Safety net: SQLite's JDBC driver doesn't return a recognizable
     * SQLState, so Hibernate can't reliably classify a unique-constraint
     * violation as DataIntegrityViolationException the way it would for
     * Postgres - it surfaces as a generic JpaSystemException instead. Every
     * known duplicate case has an explicit pre-check in its controller (see
     * the "duplicate" comment convention), so this should be unreachable in
     * practice; it exists only to avoid ever leaking a bare 500 for a
     * constraint violation we didn't anticipate.
     */
    @ExceptionHandler({DataIntegrityViolationException.class, JpaSystemException.class})
    public ResponseEntity<Map<String, String>> handleDataIntegrity(Exception ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("detail", "This conflicts with an existing record."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneric(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("detail", "Internal server error"));
    }
}
