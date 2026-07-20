package com.schoolerp.service;

import com.schoolerp.central.entity.PlatformAdmin;
import com.schoolerp.central.entity.SubscriptionPlan;
import com.schoolerp.central.repository.PlatformAdminRepository;
import com.schoolerp.central.repository.SubscriptionPlanRepository;
import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.security.PasswordService;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Seeds the first platform owner account and the default subscription plans,
 * direct port of backend/app/routes/platform.py's ensure_platform_owner() and
 * ensure_default_plans(), both called once at app startup in main.py.
 */
@Service
public class PlatformSeedService {

    private record PlanSeed(String name, int priceMonthly, int priceYearly, Integer maxStudents, Integer maxUsers, String description) {
    }

    private static final List<PlanSeed> DEFAULT_PLANS = List.of(
            new PlanSeed("Basic", 2999, 29990, 200, 20, "Up to 200 students, core modules"),
            new PlanSeed("Standard", 5999, 59990, 500, 50, "Up to 500 students, all modules"),
            new PlanSeed("Premium", 9999, 99990, null, null, "Unlimited students & users, priority support")
    );

    private final PlatformAdminRepository platformAdminRepository;
    private final SubscriptionPlanRepository subscriptionPlanRepository;
    private final SchoolErpProperties properties;
    private final PasswordService passwordService;

    public PlatformSeedService(
            PlatformAdminRepository platformAdminRepository,
            SubscriptionPlanRepository subscriptionPlanRepository,
            SchoolErpProperties properties,
            PasswordService passwordService
    ) {
        this.platformAdminRepository = platformAdminRepository;
        this.subscriptionPlanRepository = subscriptionPlanRepository;
        this.properties = properties;
        this.passwordService = passwordService;
    }

    @PostConstruct
    public void ensurePlatformOwner() {
        if (platformAdminRepository.count() > 0) {
            return;
        }
        PlatformAdmin admin = new PlatformAdmin();
        admin.setName(properties.getPlatform().getOwnerName());
        admin.setEmail(properties.getPlatform().getOwnerEmail());
        admin.setPasswordHash(passwordService.hash(properties.getPlatform().getOwnerPassword()));
        platformAdminRepository.save(admin);
    }

    @PostConstruct
    public void ensureDefaultPlans() {
        if (subscriptionPlanRepository.count() > 0) {
            return;
        }
        for (PlanSeed seed : DEFAULT_PLANS) {
            SubscriptionPlan plan = new SubscriptionPlan();
            plan.setName(seed.name());
            plan.setPriceMonthly(seed.priceMonthly());
            plan.setPriceYearly(seed.priceYearly());
            plan.setMaxStudents(seed.maxStudents());
            plan.setMaxUsers(seed.maxUsers());
            plan.setDescription(seed.description());
            subscriptionPlanRepository.save(plan);
        }
    }
}
