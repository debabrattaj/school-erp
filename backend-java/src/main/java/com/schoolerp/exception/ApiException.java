package com.schoolerp.exception;

import org.springframework.http.HttpStatus;

/**
 * Thrown to produce a FastAPI-style {"detail": "..."} JSON error body, so the
 * existing frontend (which reads error.response.data.detail everywhere)
 * keeps working unmodified against this backend.
 */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String[] extraHeaderPair; // optional single header, e.g. Retry-After

    public ApiException(HttpStatus status, String detail) {
        super(detail);
        this.status = status;
        this.extraHeaderPair = null;
    }

    public ApiException(HttpStatus status, String detail, String headerName, String headerValue) {
        super(detail);
        this.status = status;
        this.extraHeaderPair = new String[]{headerName, headerValue};
    }

    public HttpStatus getStatus() { return status; }
    public String[] getExtraHeaderPair() { return extraHeaderPair; }

    public static ApiException badRequest(String detail) { return new ApiException(HttpStatus.BAD_REQUEST, detail); }
    public static ApiException unauthorized(String detail) { return new ApiException(HttpStatus.UNAUTHORIZED, detail); }
    public static ApiException forbidden(String detail) { return new ApiException(HttpStatus.FORBIDDEN, detail); }
    public static ApiException notFound(String detail) { return new ApiException(HttpStatus.NOT_FOUND, detail); }
}
