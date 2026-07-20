package com.schoolerp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Datasources and JPA are wired manually (see config.CentralPersistenceConfig
 * and config.TenantPersistenceConfig) because this app runs two independent
 * persistence units: a fixed central registry DB and a Hibernate
 * DATABASE-strategy multi-tenant DB (one physical database per school),
 * mirroring backend/app/database.py + tenant.py in the Python original.
 */
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class})
@ConfigurationPropertiesScan
@EnableScheduling
public class SchoolErpApplication {
    public static void main(String[] args) {
        SpringApplication.run(SchoolErpApplication.class, args);
    }
}
