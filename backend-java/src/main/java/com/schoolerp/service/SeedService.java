package com.schoolerp.service;

import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.entity.MasterData;
import com.schoolerp.entity.User;
import com.schoolerp.repository.MasterDataRepository;
import com.schoolerp.repository.UserRepository;
import com.schoolerp.security.PasswordService;
import com.schoolerp.tenant.TenantAccountService;
import com.schoolerp.tenant.TenantContext;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/seed.py, run once against the default tenant DB at startup. */
@Service
public class SeedService {

    private static final Logger log = LoggerFactory.getLogger(SeedService.class);

    private record DemoUser(String name, String email, String password, String role) {}

    private static final List<DemoUser> DEFAULT_USERS = List.of(
            new DemoUser("Admin User", "admin@school.com", "admin123", "Admin"),
            new DemoUser("Principal User", "principal@school.com", "principal123", "Principal"),
            new DemoUser("Accounts User", "accounts@school.com", "accounts123", "Accounts"),
            new DemoUser("Teacher User", "teacher@school.com", "teacher123", "Teacher")
    );

    private static final Map<String, List<String>> DEFAULT_MASTER_DATA = new LinkedHashMap<>();
    static {
        DEFAULT_MASTER_DATA.put("Class", List.of("Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"));
        DEFAULT_MASTER_DATA.put("Exam", List.of("Unit Test", "Mid Term Exam", "Final Term Exam", "Assessment", "Practical Exam", "Internal Assessment", "Board Exam", "Other"));
        DEFAULT_MASTER_DATA.put("Department", List.of("Primary", "Middle School", "Senior School", "Science", "Mathematics", "Languages", "Humanities", "Commerce", "Sports", "Arts"));
        DEFAULT_MASTER_DATA.put("Subject", List.of("English", "Mathematics", "Science", "Social Science", "Hindi", "Computer Science", "Physics", "Chemistry", "Biology", "Accountancy", "Economics", "Business Studies", "Physical Education", "Art", "Music", "Other"));
        DEFAULT_MASTER_DATA.put("House", List.of("Red", "Blue", "Green", "Yellow"));
        DEFAULT_MASTER_DATA.put("Section", List.of("A", "B", "C"));
        DEFAULT_MASTER_DATA.put("FeeType", List.of("Admission Fee", "Tuition Fee", "Transport Fee", "Exam Fee", "Library Fee", "Hostel Fee", "Annual Fee", "Activity Fee", "Technology Fee", "Other"));
        DEFAULT_MASTER_DATA.put("AttendanceStatus", List.of("Present", "Absent", "Late", "Half Day", "Excused"));
        DEFAULT_MASTER_DATA.put("ExamType", List.of("Unit Test", "Mid Term Exam", "Final Term Exam", "Assessment", "Practical Exam", "Internal Assessment", "Board Exam", "Other"));
        DEFAULT_MASTER_DATA.put("EmploymentType", List.of("Full Time", "Part Time", "Visiting", "Contract"));
        DEFAULT_MASTER_DATA.put("Gender", List.of("Male", "Female", "Other"));
        DEFAULT_MASTER_DATA.put("BloodGroup", List.of("A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"));
        DEFAULT_MASTER_DATA.put("Nationality", List.of("Indian", "American", "British", "Canadian", "Australian", "Nepalese", "Bangladeshi", "Sri Lankan", "Other"));
        DEFAULT_MASTER_DATA.put("TransportRoute", List.of("Route 1", "Route 2", "Route 3", "Route 4"));
        DEFAULT_MASTER_DATA.put("SalaryGrade", List.of("Trainee", "Junior Faculty", "Faculty", "Senior Faculty", "HOD", "Coordinator"));
        DEFAULT_MASTER_DATA.put("StudentStatus", List.of("Active", "Graduated", "Transferred", "Suspended", "Alumni"));
        DEFAULT_MASTER_DATA.put("ResidentialType", List.of("Day Scholar", "Hosteller"));
        DEFAULT_MASTER_DATA.put("AcademicYear", List.of("2024-25", "2025-26", "2026-27", "2027-28", "2028-29"));
    }

    private final UserRepository userRepository;
    private final MasterDataRepository masterDataRepository;
    private final PasswordService passwordService;
    private final SchoolErpProperties properties;
    // Declared as a constructor dependency purely to force Spring to finish
    // TenantAccountService's own @PostConstruct (which creates the default
    // school account) before this bean's @PostConstruct runs.
    private final TenantAccountService tenantAccountService;

    public SeedService(
            UserRepository userRepository,
            MasterDataRepository masterDataRepository,
            PasswordService passwordService,
            SchoolErpProperties properties,
            TenantAccountService tenantAccountService
    ) {
        this.userRepository = userRepository;
        this.masterDataRepository = masterDataRepository;
        this.passwordService = passwordService;
        this.properties = properties;
        this.tenantAccountService = tenantAccountService;
    }

    @PostConstruct
    public void seedAll() {
        TenantContext.setTenant(properties.getTenant().getDefaultAccountCode());
        try {
            seedDefaultUsers();
            seedMasterData();
        } finally {
            TenantContext.clear();
        }
    }

    private void seedDefaultUsers() {
        if (!properties.isSeedDemoUsers()) {
            return;
        }
        log.warn("Seeding demo users with well-known passwords (admin@school.com etc.). "
                + "Set SEED_DEMO_USERS=false in production once real admin accounts exist.");

        for (DemoUser item : DEFAULT_USERS) {
            if (userRepository.findByEmail(item.email()).isPresent()) {
                continue;
            }
            User user = new User();
            user.setName(item.name());
            user.setEmail(item.email());
            user.setPasswordHash(passwordService.hash(item.password()));
            user.setRole(item.role());
            userRepository.save(user);
        }
    }

    private void seedMasterData() {
        for (Map.Entry<String, List<String>> entry : DEFAULT_MASTER_DATA.entrySet()) {
            String category = entry.getKey();
            List<String> values = entry.getValue();
            for (int i = 0; i < values.size(); i++) {
                String value = values.get(i);
                if (masterDataRepository.findByCategoryAndValue(category, value).isPresent()) {
                    continue;
                }
                MasterData item = new MasterData();
                item.setCategory(category);
                item.setValue(value);
                item.setActive(true);
                item.setSortOrder(i + 1);
                masterDataRepository.save(item);
            }
        }
    }
}
