package com.schoolerp.controller;

import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.exception.ApiException;
import com.schoolerp.security.PermissionService;
import com.schoolerp.tenant.TenantAccountService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Direct port of backend/app/routes/uploads.py. */
@RestController
@RequestMapping("/uploads")
public class UploadController {

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf");

    private final SchoolErpProperties properties;
    private final TenantAccountService tenantAccountService;
    private final PermissionService permissionService;

    public UploadController(
            SchoolErpProperties properties,
            TenantAccountService tenantAccountService,
            PermissionService permissionService
    ) {
        this.properties = properties;
        this.tenantAccountService = tenantAccountService;
        this.permissionService = permissionService;
    }

    @PostMapping({"", "/"})
    public Map<String, Object> uploadFile(HttpServletRequest request, @RequestParam("file") MultipartFile file) {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "";
        int dot = filename.lastIndexOf('.');
        String ext = dot >= 0 ? filename.substring(dot).toLowerCase() : "";

        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw ApiException.badRequest("Unsupported file type '" + (ext.isEmpty() ? "unknown" : ext)
                    + "'. Allowed: " + String.join(", ", ALLOWED_EXTENSIONS.stream().sorted().toList()));
        }

        long maxBytes = (long) properties.getUploads().getMaxSizeMb() * 1024 * 1024;
        if (file.getSize() > maxBytes) {
            throw ApiException.badRequest("File is too large (max " + properties.getUploads().getMaxSizeMb() + " MB).");
        }

        String accountCode = tenantAccountService.resolveAccountCode(request);
        if (accountCode == null || accountCode.isBlank()) {
            accountCode = "default";
        }
        StringBuilder safeAccount = new StringBuilder();
        for (char c : accountCode.toCharArray()) {
            if (Character.isLetterOrDigit(c) || c == '-' || c == '_') {
                safeAccount.append(c);
            }
        }
        String safeAccountCode = safeAccount.length() > 0 ? safeAccount.toString() : "default";

        try {
            Path tenantDir = Path.of(properties.getUploads().getDir(), safeAccountCode);
            Files.createDirectories(tenantDir);

            String name = UUID.randomUUID().toString().replace("-", "") + ext;
            Path target = tenantDir.resolve(name);
            file.transferTo(target);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("url", "/uploads/" + safeAccountCode + "/" + name);
            body.put("filename", filename);
            body.put("size", file.getSize());
            return body;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
