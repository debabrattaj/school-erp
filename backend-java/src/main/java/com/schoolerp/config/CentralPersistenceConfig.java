package com.schoolerp.config;

import com.schoolerp.tenant.DatabaseUrls;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.annotation.PersistenceExceptionTranslationPostProcessor;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.JpaVendorAdapter;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * Fixed, single-tenant persistence unit for the central registry DB
 * (SchoolAccount / SchoolFeature / PasswordResetToken / PlatformAdmin / ...).
 * Mirrors backend/app/tenant.py's central_engine + CentralSessionLocal.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(
        basePackages = "com.schoolerp.central.repository",
        entityManagerFactoryRef = "centralEntityManagerFactory",
        transactionManagerRef = "centralTransactionManager"
)
public class CentralPersistenceConfig {

    /**
     * Translates Hibernate's raw ConstraintViolationException into Spring's
     * DataIntegrityViolationException on @Repository beans, so
     * catch (DataIntegrityViolationException) in controllers actually
     * catches something. Spring Boot normally registers this
     * automatically via PersistenceExceptionTranslationAutoConfiguration,
     * but that's implicitly disabled by excluding HibernateJpaAutoConfiguration
     * for the manual multi-tenant setup, so it must be declared explicitly.
     */
    @Bean
    public static PersistenceExceptionTranslationPostProcessor persistenceExceptionTranslationPostProcessor() {
        return new PersistenceExceptionTranslationPostProcessor();
    }

    @Bean
    public DataSource centralDataSource(SchoolErpProperties properties) {
        String url = properties.getTenant().getCentralDatabaseUrl();
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setDriverClassName(DatabaseUrls.driverFor(url));
        config.setPoolName("central");
        if (DatabaseUrls.isSqlite(url)) {
            config.setMaximumPoolSize(1);
        }
        return new HikariDataSource(config);
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean centralEntityManagerFactory(
            @Qualifier("centralDataSource") DataSource dataSource,
            SchoolErpProperties properties
    ) {
        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setDataSource(dataSource);
        emf.setPackagesToScan("com.schoolerp.central.entity");
        emf.setPersistenceUnitName("central");

        JpaVendorAdapter vendorAdapter = new HibernateJpaVendorAdapter();
        emf.setJpaVendorAdapter(vendorAdapter);

        Map<String, Object> props = new HashMap<>();
        props.put("hibernate.hbm2ddl.auto", "update");
        // SQLite's JDBC driver builds a single UNION query across every table
        // when Hibernate's schema migrator fetches column metadata in "grouped"
        // mode (the default); with enough tables that trips SQLite's compound
        // SELECT term limit ("too many terms in compound SELECT"). Forcing
        // per-table ("individually") queries avoids it.
        props.put("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually");
        props.put("hibernate.dialect", DatabaseUrls.dialectFor(properties.getTenant().getCentralDatabaseUrl()));
        // See TenantPersistenceConfig for why this is required (Spring Boot's
        // Hibernate auto-configuration is disabled, so its snake_case naming
        // strategy must be wired in manually).
        props.put("hibernate.physical_naming_strategy", "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy");
        props.put("hibernate.implicit_naming_strategy", "org.springframework.boot.orm.jpa.hibernate.SpringImplicitNamingStrategy");
        emf.setJpaPropertyMap(props);
        return emf;
    }

    @Bean
    public PlatformTransactionManager centralTransactionManager(
            @Qualifier("centralEntityManagerFactory") EntityManagerFactory emf
    ) {
        return new JpaTransactionManager(emf);
    }
}
