package com.schoolerp.config;

import com.schoolerp.tenant.TenantConnectionProvider;
import com.schoolerp.tenant.TenantEntityScan;
import com.schoolerp.tenant.TenantIdentifierResolver;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.cfg.AvailableSettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.JpaVendorAdapter;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import java.util.HashMap;
import java.util.Map;

/**
 * The multi-tenant persistence unit: one shared EntityManagerFactory whose
 * connections are routed per-request to a different physical database
 * (Hibernate's DATABASE multi-tenancy strategy). This is the Java/Hibernate
 * equivalent of backend/app/tenant.py's per-account
 * get_school_session_factory() cache: instead of a distinct SQLAlchemy
 * sessionmaker per tenant, Hibernate resolves the JDBC connection per
 * operation via TenantConnectionProvider + TenantIdentifierResolver, keyed
 * off TenantContext (set by JwtTenantFilter per request).
 *
 * This is the @Primary persistence unit: entities under com.schoolerp.entity
 * (and their Spring Data repositories under com.schoolerp.repository) all use it.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(
        basePackages = "com.schoolerp.repository",
        entityManagerFactoryRef = "tenantEntityManagerFactory",
        transactionManagerRef = "tenantTransactionManager"
)
public class TenantPersistenceConfig {

    @Bean
    @Primary
    public LocalContainerEntityManagerFactoryBean tenantEntityManagerFactory(
            TenantConnectionProvider connectionProvider,
            TenantIdentifierResolver identifierResolver
    ) {
        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setPackagesToScan(TenantEntityScan.ENTITY_PACKAGE);
        emf.setPersistenceUnitName("tenant");

        JpaVendorAdapter vendorAdapter = new HibernateJpaVendorAdapter();
        emf.setJpaVendorAdapter(vendorAdapter);

        Map<String, Object> props = new HashMap<>();
        // Schema per tenant DB is created/updated lazily by
        // TenantDataSourceManager when a tenant DataSource is first opened,
        // so hbm2ddl is intentionally off here (there is no single fixed DB
        // for this persistence unit to manage DDL against).
        props.put(AvailableSettings.HBM2DDL_AUTO, "none");
        // Without this, unannotated columns get Hibernate's default naming
        // (raw camelCase, e.g. "academicYear") instead of snake_case
        // ("academic_year"), which silently breaks every @UniqueConstraint /
        // @Column(name=...) written assuming snake_case - normally Spring
        // Boot's Hibernate auto-configuration wires this in automatically,
        // but that's disabled here in favor of manual multi-tenant setup, so
        // it must be applied explicitly (and identically in
        // TenantDataSourceManager's schema-bootstrap SessionFactory, or the
        // DDL used to create a tenant DB won't match what this EMF expects).
        props.put(AvailableSettings.PHYSICAL_NAMING_STRATEGY, "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy");
        props.put(AvailableSettings.IMPLICIT_NAMING_STRATEGY, "org.springframework.boot.orm.jpa.hibernate.SpringImplicitNamingStrategy");
        props.put(AvailableSettings.MULTI_TENANT_CONNECTION_PROVIDER, connectionProvider);
        props.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, identifierResolver);
        // SQLite is the default tenant DB engine; Postgres tenants are also
        // supported (see DatabaseUrls) but Hibernate needs one dialect for
        // the shared persistence unit's SQL generation, so mixed SQLite +
        // Postgres tenants in the same deployment are not supported (the
        // Python original has the same limitation implicitly, since its ORM
        // dialect quirks assume one engine per deployment).
        props.put(AvailableSettings.DIALECT, "org.hibernate.community.dialect.SQLiteDialect");
        emf.setJpaPropertyMap(props);
        return emf;
    }

    @Bean
    @Primary
    public PlatformTransactionManager tenantTransactionManager(
            @org.springframework.beans.factory.annotation.Qualifier("tenantEntityManagerFactory") EntityManagerFactory emf
    ) {
        return new JpaTransactionManager(emf);
    }
}
