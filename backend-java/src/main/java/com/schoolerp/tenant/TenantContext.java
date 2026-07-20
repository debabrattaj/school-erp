package com.schoolerp.tenant;

/**
 * Per-request current tenant (school account_code). Set by JwtTenantFilter,
 * mirroring backend/app/tenant.py's get_account_code_from_request +
 * get_tenant_db request-scoped session.
 */
public final class TenantContext {
    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();

    private TenantContext() {}

    public static void setTenant(String accountCode) {
        CURRENT_TENANT.set(accountCode);
    }

    public static String getTenant() {
        return CURRENT_TENANT.get();
    }

    public static void clear() {
        CURRENT_TENANT.remove();
    }
}
