package com.schoolerp.tenant;

import com.schoolerp.config.SchoolErpProperties;
import org.hibernate.engine.jdbc.connections.spi.MultiTenantConnectionProvider;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * Hands Hibernate a JDBC connection to the right per-school database for the
 * current tenant identifier (account_code). Equivalent to
 * backend/app/tenant.py's get_tenant_db, which opens a session against
 * get_school_session_factory(account["database_url"]) per request.
 */
@Component
public class TenantConnectionProvider implements MultiTenantConnectionProvider<String> {

    private final TenantDataSourceManager dataSourceManager;
    private final String defaultAccountCode;

    public TenantConnectionProvider(TenantDataSourceManager dataSourceManager, SchoolErpProperties properties) {
        this.dataSourceManager = dataSourceManager;
        this.defaultAccountCode = properties.getTenant().getDefaultAccountCode();
    }

    @Override
    public Connection getAnyConnection() throws SQLException {
        return dataSourceManager.getDataSourceForAccountCode(defaultAccountCode).getConnection();
    }

    @Override
    public void releaseAnyConnection(Connection connection) throws SQLException {
        connection.close();
    }

    @Override
    public Connection getConnection(String tenantIdentifier) throws SQLException {
        return dataSourceManager.getDataSourceForAccountCode(tenantIdentifier).getConnection();
    }

    @Override
    public void releaseConnection(String tenantIdentifier, Connection connection) throws SQLException {
        connection.close();
    }

    @Override
    public boolean supportsAggressiveRelease() {
        return false;
    }

    @Override
    public boolean isUnwrappableAs(Class<?> unwrapType) {
        return false;
    }

    @Override
    public <T> T unwrap(Class<T> unwrapType) {
        return null;
    }
}
