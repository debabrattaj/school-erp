package com.schoolerp.tenant;

/**
 * JDBC URL helpers, equivalent to backend/app/database.py's is_sqlite /
 * engine_kwargs / build_tenant_database_url. URLs here are JDBC-style
 * (jdbc:sqlite:./file.db, jdbc:postgresql://host:port/db) rather than
 * SQLAlchemy-style, since that's the JDBC convention.
 */
public final class DatabaseUrls {

    private DatabaseUrls() {}

    public static boolean isSqlite(String url) {
        return url != null && url.startsWith("jdbc:sqlite");
    }

    public static boolean isPostgres(String url) {
        return url != null && url.startsWith("jdbc:postgresql");
    }

    public static String driverFor(String url) {
        if (isSqlite(url)) return "org.sqlite.JDBC";
        if (isPostgres(url)) return "org.postgresql.Driver";
        throw new IllegalArgumentException("Unsupported database URL: " + url);
    }

    public static String dialectFor(String url) {
        if (isSqlite(url)) return "org.hibernate.community.dialect.SQLiteDialect";
        if (isPostgres(url)) return "org.hibernate.dialect.PostgreSQLDialect";
        throw new IllegalArgumentException("Unsupported database URL: " + url);
    }

    /**
     * Generate a fresh per-tenant connection string for a new school account.
     * Mirrors the dialect of the default school database URL: SQLite gets its
     * own file, Postgres gets a same-server database named after the school.
     */
    public static String buildTenantDatabaseUrl(String defaultSchoolDatabaseUrl, String safeCode) {
        if (isSqlite(defaultSchoolDatabaseUrl)) {
            return "jdbc:sqlite:./school_erp_" + safeCode + ".db";
        }
        if (isPostgres(defaultSchoolDatabaseUrl)) {
            int lastSlash = defaultSchoolDatabaseUrl.lastIndexOf('/');
            String base = defaultSchoolDatabaseUrl.substring(0, lastSlash);
            return base + "/school_erp_" + safeCode;
        }
        throw new IllegalArgumentException("Unsupported database URL: " + defaultSchoolDatabaseUrl);
    }
}
