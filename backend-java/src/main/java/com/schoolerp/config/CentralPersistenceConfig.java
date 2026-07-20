package com.schoolerp.config;

import com.schoolerp.tenant.DatabaseUrls;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
        props.put("hibernate.dialect", DatabaseUrls.dialectFor(properties.getTenant().getCentralDatabaseUrl()));
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
