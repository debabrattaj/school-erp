package com.schoolerp.tenant;

import jakarta.persistence.Entity;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.beans.factory.config.BeanDefinition;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * All @Entity classes that live in a per-school tenant database (everything
 * under com.schoolerp.entity), discovered once at class-load time. Used both
 * to build the tenant JPA persistence unit and to run schema updates against
 * newly-provisioned tenant databases (see TenantDataSourceManager),
 * equivalent to SQLAlchemy's single shared Base.metadata across all tenant
 * models in backend/app/models.py.
 */
public final class TenantEntityScan {

    public static final String ENTITY_PACKAGE = "com.schoolerp.entity";

    public static final List<Class<?>> ENTITY_CLASSES = Collections.unmodifiableList(scan());

    private TenantEntityScan() {}

    private static List<Class<?>> scan() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));

        List<Class<?>> classes = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents(ENTITY_PACKAGE)) {
            try {
                classes.add(Class.forName(bd.getBeanClassName()));
            } catch (ClassNotFoundException e) {
                throw new IllegalStateException("Failed to load entity class " + bd.getBeanClassName(), e);
            }
        }
        return classes;
    }
}
