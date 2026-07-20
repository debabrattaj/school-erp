package com.schoolerp.tenant;

import com.schoolerp.central.entity.SchoolAccount;
import com.schoolerp.central.repository.SchoolAccountRepository;
import com.schoolerp.config.SchoolErpProperties;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.cfg.AvailableSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Lazily creates and caches a connection pool per tenant database, running a
 * schema update (CREATE TABLE IF NOT EXISTS equivalent) the first time a
 * given database is used. Mirrors backend/app/tenant.py's
 * get_school_session_factory (lru_cache over a sessionmaker) and
 * backend/app/database.py's ensure_database_exists / Base.metadata.create_all.
 */
@Component
public class TenantDataSourceManager {

    private static final Logger log = LoggerFactory.getLogger(TenantDataSourceManager.class);

    private final SchoolAccountRepository schoolAccountRepository;
    private final SchoolErpProperties properties;
    private final ConcurrentHashMap<String, DataSource> byDatabaseUrl = new ConcurrentHashMap<>();

    public TenantDataSourceManager(SchoolAccountRepository schoolAccountRepository, SchoolErpProperties properties) {
        this.schoolAccountRepository = schoolAccountRepository;
        this.properties = properties;
    }

    public DataSource getDataSourceForAccountCode(String accountCode) {
        SchoolAccount account = schoolAccountRepository.findByAccountCode(accountCode)
                .orElseThrow(() -> new TenantNotFoundException("School account not found"));
        if (!"Active".equals(account.getStatus())) {
            throw new TenantNotFoundException("School account not found");
        }
        return getDataSourceForUrl(account.getDatabaseUrl());
    }

    public DataSource getDataSourceForUrl(String databaseUrl) {
        return byDatabaseUrl.computeIfAbsent(databaseUrl, this::buildAndInitDataSource);
    }

    private DataSource buildAndInitDataSource(String url) {
        ensureDatabaseExists(url);
        DataSource ds = buildPool(url);
        ensureSchema(url, ds);
        return ds;
    }

    private DataSource buildPool(String url) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setDriverClassName(DatabaseUrls.driverFor(url));
        config.setPoolName("tenant-" + Integer.toHexString(url.hashCode()));
        if (DatabaseUrls.isSqlite(url)) {
            // SQLite has no real concurrent-writer story; mirror SQLAlchemy's
            // check_same_thread=False by keeping a small single-connection pool.
            config.setMaximumPoolSize(1);
        } else {
            config.setMaximumPoolSize(10);
        }
        return new HikariDataSource(config);
    }

    /** For Postgres, create the target database if missing. No-op for SQLite (auto-created on connect). */
    private void ensureDatabaseExists(String url) {
        if (!DatabaseUrls.isPostgres(url)) {
            return;
        }
        try {
            int lastSlash = url.lastIndexOf('/');
            String base = url.substring(0, lastSlash);
            String dbName = url.substring(lastSlash + 1).split("\\?")[0];
            String adminUrl = base + "/postgres";
            try (Connection conn = DriverManager.getConnection(adminUrl);
                 Statement stmt = conn.createStatement()) {
                var rs = stmt.executeQuery("SELECT 1 FROM pg_database WHERE datname = '" + dbName.replace("'", "''") + "'");
                boolean exists = rs.next();
                if (!exists) {
                    stmt.execute("CREATE DATABASE \"" + dbName.replace("\"", "\"\"") + "\"");
                }
            }
        } catch (SQLException e) {
            log.warn("Could not auto-provision database for {}: {}", url, e.getMessage());
        }
    }

    /**
     * Equivalent of SQLAlchemy's Base.metadata.create_all(bind=engine) for a
     * fresh tenant DB: bootstraps a throwaway SessionFactory with
     * hbm2ddl.auto=update, which runs Hibernate's own schema migrator, then
     * discards it immediately (actual runtime access goes through the
     * shared multi-tenant EntityManagerFactory in TenantPersistenceConfig).
     */
    private void ensureSchema(String url, DataSource dataSource) {
        StandardServiceRegistry registry = new StandardServiceRegistryBuilder()
                .applySetting(AvailableSettings.DATASOURCE, dataSource)
                .applySetting(AvailableSettings.DIALECT, DatabaseUrls.dialectFor(url))
                .applySetting(AvailableSettings.HBM2DDL_AUTO, "update")
                // See CentralPersistenceConfig for why: SQLite's JDBC driver
                // trips its own compound-SELECT term limit once there are
                // enough entities and Hibernate fetches column metadata in
                // "grouped" (single UNION query) mode.
                .applySetting("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually")
                // Must match TenantPersistenceConfig's naming strategy exactly,
                // or the DDL generated here (for a fresh tenant DB) won't match
                // what the runtime multi-tenant EntityManagerFactory expects.
                .applySetting(AvailableSettings.PHYSICAL_NAMING_STRATEGY, "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy")
                .applySetting(AvailableSettings.IMPLICIT_NAMING_STRATEGY, "org.springframework.boot.orm.jpa.hibernate.SpringImplicitNamingStrategy")
                .build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            for (Class<?> entityClass : TenantEntityScan.ENTITY_CLASSES) {
                sources.addAnnotatedClass(entityClass);
            }
            try (SessionFactory sessionFactory = sources.buildMetadata().buildSessionFactory()) {
                // Building the SessionFactory is enough to trigger the schema update.
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    @PreDestroy
    public void shutdown() {
        byDatabaseUrl.values().forEach(ds -> {
            if (ds instanceof HikariDataSource hikari) {
                hikari.close();
            }
        });
    }

    public static class TenantNotFoundException extends RuntimeException {
        public TenantNotFoundException(String message) {
            super(message);
        }
    }
}
