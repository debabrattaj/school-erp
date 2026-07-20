package com.schoolerp.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "schoolerp")
public class SchoolErpProperties {

    private Security security = new Security();
    private Cors cors = new Cors();
    private LoginThrottle loginThrottle = new LoginThrottle();
    private Reset reset = new Reset();
    private String backendBaseUrl;
    private Tenant tenant = new Tenant();
    private Mail mail = new Mail();
    private Whatsapp whatsapp = new Whatsapp();
    private Ai ai = new Ai();
    private Uploads uploads = new Uploads();
    private Backup backup = new Backup();
    private boolean seedDemoUsers = true;

    public static class Security {
        private String secretKey;
        private int accessTokenExpireMinutes = 1440;
        private int minPasswordLength = 8;

        public String getSecretKey() { return secretKey; }
        public void setSecretKey(String secretKey) { this.secretKey = secretKey; }
        public int getAccessTokenExpireMinutes() { return accessTokenExpireMinutes; }
        public void setAccessTokenExpireMinutes(int v) { this.accessTokenExpireMinutes = v; }
        public int getMinPasswordLength() { return minPasswordLength; }
        public void setMinPasswordLength(int v) { this.minPasswordLength = v; }
    }

    public static class Cors {
        private String allowedOrigins = "http://localhost:5173,http://127.0.0.1:5173";
        public String getAllowedOrigins() { return allowedOrigins; }
        public void setAllowedOrigins(String v) { this.allowedOrigins = v; }
    }

    public static class LoginThrottle {
        private int maxAttempts = 8;
        private int windowSeconds = 900;
        public int getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(int v) { this.maxAttempts = v; }
        public int getWindowSeconds() { return windowSeconds; }
        public void setWindowSeconds(int v) { this.windowSeconds = v; }
    }

    public static class Reset {
        private int tokenTtlMinutes = 30;
        private String frontendBaseUrl = "http://localhost:5173";
        private boolean debugReturnToken = false;
        public int getTokenTtlMinutes() { return tokenTtlMinutes; }
        public void setTokenTtlMinutes(int v) { this.tokenTtlMinutes = v; }
        public String getFrontendBaseUrl() { return frontendBaseUrl; }
        public void setFrontendBaseUrl(String v) { this.frontendBaseUrl = v; }
        public boolean isDebugReturnToken() { return debugReturnToken; }
        public void setDebugReturnToken(boolean v) { this.debugReturnToken = v; }
    }

    public static class Tenant {
        private String centralDatabaseUrl = "jdbc:sqlite:./school_accounts.db";
        private String defaultAccountCode = "default";
        private String defaultSchoolDatabaseUrl = "jdbc:sqlite:./school_erp.db";
        public String getCentralDatabaseUrl() { return centralDatabaseUrl; }
        public void setCentralDatabaseUrl(String v) { this.centralDatabaseUrl = v; }
        public String getDefaultAccountCode() { return defaultAccountCode; }
        public void setDefaultAccountCode(String v) { this.defaultAccountCode = v; }
        public String getDefaultSchoolDatabaseUrl() { return defaultSchoolDatabaseUrl; }
        public void setDefaultSchoolDatabaseUrl(String v) { this.defaultSchoolDatabaseUrl = v; }
    }

    public static class Mail {
        private String from = "no-reply@schoolerp.local";
        public String getFrom() { return from; }
        public void setFrom(String v) { this.from = v; }
    }

    public static class Whatsapp {
        private String twilioAccountSid;
        private String twilioAuthToken;
        private String twilioWhatsappFrom = "whatsapp:+14155238886";
        private String defaultCountryCode = "+91";
        public String getTwilioAccountSid() { return twilioAccountSid; }
        public void setTwilioAccountSid(String v) { this.twilioAccountSid = v; }
        public String getTwilioAuthToken() { return twilioAuthToken; }
        public void setTwilioAuthToken(String v) { this.twilioAuthToken = v; }
        public String getTwilioWhatsappFrom() { return twilioWhatsappFrom; }
        public void setTwilioWhatsappFrom(String v) { this.twilioWhatsappFrom = v; }
        public String getDefaultCountryCode() { return defaultCountryCode; }
        public void setDefaultCountryCode(String v) { this.defaultCountryCode = v; }
    }

    public static class Ai {
        private String anthropicApiKey;
        public String getAnthropicApiKey() { return anthropicApiKey; }
        public void setAnthropicApiKey(String v) { this.anthropicApiKey = v; }
    }

    public static class Uploads {
        private String dir = "./uploads";
        public String getDir() { return dir; }
        public void setDir(String v) { this.dir = v; }
    }

    public static class Backup {
        private String dir = "./backups";
        private int keep = 14;
        private boolean enabled = false;
        private int intervalHours = 24;
        public String getDir() { return dir; }
        public void setDir(String v) { this.dir = v; }
        public int getKeep() { return keep; }
        public void setKeep(int v) { this.keep = v; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean v) { this.enabled = v; }
        public int getIntervalHours() { return intervalHours; }
        public void setIntervalHours(int v) { this.intervalHours = v; }
    }

    public Security getSecurity() { return security; }
    public void setSecurity(Security v) { this.security = v; }
    public Cors getCors() { return cors; }
    public void setCors(Cors v) { this.cors = v; }
    public LoginThrottle getLoginThrottle() { return loginThrottle; }
    public void setLoginThrottle(LoginThrottle v) { this.loginThrottle = v; }
    public Reset getReset() { return reset; }
    public void setReset(Reset v) { this.reset = v; }
    public String getBackendBaseUrl() { return backendBaseUrl; }
    public void setBackendBaseUrl(String v) { this.backendBaseUrl = v; }
    public Tenant getTenant() { return tenant; }
    public void setTenant(Tenant v) { this.tenant = v; }
    public Mail getMail() { return mail; }
    public void setMail(Mail v) { this.mail = v; }
    public Whatsapp getWhatsapp() { return whatsapp; }
    public void setWhatsapp(Whatsapp v) { this.whatsapp = v; }
    public Ai getAi() { return ai; }
    public void setAi(Ai v) { this.ai = v; }
    public Uploads getUploads() { return uploads; }
    public void setUploads(Uploads v) { this.uploads = v; }
    public Backup getBackup() { return backup; }
    public void setBackup(Backup v) { this.backup = v; }
    public boolean isSeedDemoUsers() { return seedDemoUsers; }
    public void setSeedDemoUsers(boolean v) { this.seedDemoUsers = v; }
}
