package com.schoolerp.tenant;

import com.schoolerp.config.SchoolErpProperties;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

@Component
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<String> {

    private final String defaultAccountCode;

    public TenantIdentifierResolver(SchoolErpProperties properties) {
        this.defaultAccountCode = properties.getTenant().getDefaultAccountCode();
    }

    @Override
    public String resolveCurrentTenantIdentifier() {
        String tenant = TenantContext.getTenant();
        return tenant != null ? tenant : defaultAccountCode;
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}
