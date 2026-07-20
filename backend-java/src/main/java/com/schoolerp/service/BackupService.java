package com.schoolerp.service;

import com.schoolerp.central.entity.SchoolAccount;
import com.schoolerp.central.repository.SchoolAccountRepository;
import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.tenant.DatabaseUrls;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Stream;

/**
 * Database backups, direct port of backend/app/backup.py. Uses a plain file
 * copy for SQLite (Python uses sqlite3's online backup API; the tenant
 * connection pool here is already capped at a single connection per
 * database, so a file copy is an equally safe best-effort approach) and
 * pg_dump via ProcessBuilder for Postgres, matching the Python source.
 */
@Service
public class BackupService {

    private static final Logger log = LoggerFactory.getLogger(BackupService.class);
    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    private final SchoolAccountRepository schoolAccountRepository;
    private final SchoolErpProperties properties;

    public BackupService(SchoolAccountRepository schoolAccountRepository, SchoolErpProperties properties) {
        this.schoolAccountRepository = schoolAccountRepository;
        this.properties = properties;
    }

    private Map<String, String> discoverDatabases() {
        Map<String, String> databases = new LinkedHashMap<>();
        databases.put("central", properties.getTenant().getCentralDatabaseUrl());
        for (SchoolAccount account : schoolAccountRepository.findAll()) {
            if (account.getDatabaseUrl() != null && !account.getDatabaseUrl().isBlank()) {
                databases.put(account.getAccountCode(), account.getDatabaseUrl());
            }
        }
        return databases;
    }

    private String sqlitePath(String url) {
        if (url != null && DatabaseUrls.isSqlite(url)) {
            return url.substring("jdbc:sqlite:".length());
        }
        return null;
    }

    private Map<String, Object> backupOne(String name, String url, Path targetDir) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", name);
        try {
            if (DatabaseUrls.isSqlite(url)) {
                String path = sqlitePath(url);
                if (path == null || !Files.exists(Path.of(path))) {
                    result.put("ok", false);
                    result.put("error", "source file missing");
                    return result;
                }
                Path dst = targetDir.resolve(name + ".db");
                Files.copy(Path.of(path), dst, StandardCopyOption.REPLACE_EXISTING);
                result.put("ok", true);
                result.put("bytes", Files.size(dst));
                return result;
            }

            if (DatabaseUrls.isPostgres(url)) {
                Path dst = targetDir.resolve(name + ".sql");
                ProcessBuilder pb = new ProcessBuilder("pg_dump", "--dbname", url.replaceFirst("^jdbc:", ""));
                pb.redirectOutput(dst.toFile());
                pb.redirectErrorStream(false);
                Process process = pb.start();
                int exitCode = process.waitFor();
                if (exitCode != 0) {
                    String stderr = new String(process.getErrorStream().readAllBytes());
                    result.put("ok", false);
                    result.put("error", stderr.length() > 500 ? stderr.substring(0, 500) : stderr);
                    return result;
                }
                result.put("ok", true);
                result.put("bytes", Files.size(dst));
                return result;
            }

            result.put("ok", false);
            result.put("error", "unsupported backend for backup: " + url.split(":", 2)[0]);
            return result;
        } catch (Exception e) {
            result.put("ok", false);
            result.put("error", e.getMessage());
            return result;
        }
    }

    private void prune() {
        int keep = properties.getBackup().getKeep();
        Path backupDir = Path.of(properties.getBackup().getDir());
        if (keep <= 0 || !Files.isDirectory(backupDir)) {
            return;
        }
        try (Stream<Path> stream = Files.list(backupDir)) {
            List<Path> subdirs = stream.filter(Files::isDirectory).sorted().toList();
            int toRemove = subdirs.size() - keep;
            for (int i = 0; i < toRemove; i++) {
                deleteRecursively(subdirs.get(i));
            }
        } catch (IOException e) {
            log.warn("Backup pruning failed: {}", e.getMessage());
        }
    }

    private void deleteRecursively(Path dir) {
        try (Stream<Path> stream = Files.walk(dir)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.delete(p);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException ignored) {
        }
    }

    public Map<String, Object> backupAll() {
        String timestamp = LocalDateTime.now().format(TIMESTAMP_FORMAT);
        Path targetDir = Path.of(properties.getBackup().getDir(), timestamp);
        try {
            Files.createDirectories(targetDir);
        } catch (IOException e) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("timestamp", timestamp);
            body.put("dir", targetDir.toString());
            body.put("ok", false);
            body.put("databases", List.of(Map.of("name", "*", "ok", false, "error", e.getMessage())));
            return body;
        }

        List<Map<String, Object>> results = new ArrayList<>();
        for (Map.Entry<String, String> entry : discoverDatabases().entrySet()) {
            results.add(backupOne(entry.getKey(), entry.getValue(), targetDir));
        }

        prune();

        boolean ok = !results.isEmpty() && results.stream().allMatch(r -> Boolean.TRUE.equals(r.get("ok")));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", timestamp);
        body.put("dir", targetDir.toString());
        body.put("ok", ok);
        body.put("databases", results);
        return body;
    }

    public List<Map<String, Object>> listBackups() {
        Path backupDir = Path.of(properties.getBackup().getDir());
        if (!Files.isDirectory(backupDir)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        File[] entries = backupDir.toFile().listFiles();
        if (entries == null) {
            return List.of();
        }
        Arrays.sort(entries, Comparator.comparing(File::getName).reversed());
        for (File entry : entries) {
            if (!entry.isDirectory()) continue;
            File[] dbFiles = entry.listFiles((dir, name) -> name.endsWith(".db") || name.endsWith(".sql"));
            long total = 0;
            int count = dbFiles != null ? dbFiles.length : 0;
            if (dbFiles != null) {
                for (File f : dbFiles) total += f.length();
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("timestamp", entry.getName());
            row.put("databases", count);
            row.put("total_bytes", total);
            out.add(row);
        }
        return out;
    }
}
