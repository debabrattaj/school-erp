package com.schoolerp.controller;

import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.security.PermissionService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/settings.py. */
@RestController
@RequestMapping("/settings")
public class SettingsController {

    private final SchoolSettingsRepository schoolSettingsRepository;
    private final PermissionService permissionService;

    public SettingsController(SchoolSettingsRepository schoolSettingsRepository, PermissionService permissionService) {
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.permissionService = permissionService;
    }

    @GetMapping({"", "/"})
    public SchoolSettings getSettings() {
        permissionService.requireRoles("Admin", "Principal", "Accounts", "Teacher");
        return getOrCreateSettings();
    }

    @PutMapping({"", "/"})
    public SchoolSettings updateSettings(@RequestBody Map<String, Object> updateData) {
        permissionService.requireRoles("Admin");

        SchoolSettings settings = getOrCreateSettings();
        applyUpdates(settings, updateData);
        return schoolSettingsRepository.save(settings);
    }

    private SchoolSettings getOrCreateSettings() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (!all.isEmpty()) {
            return all.get(0);
        }

        SchoolSettings settings = new SchoolSettings();
        settings.setSchoolName("KIIT International School");
        settings.setTagline("Nurturing Global Citizens");
        settings.setInstitutionType("International School");
        settings.setBoardAffiliation("CBSE / Cambridge");
        settings.setSchoolCode("KIITIS-BBSR");
        settings.setWebsite("https://kiitis.ac.in");
        settings.setCampusName("Main Campus");
        settings.setCampusCity("Bhubaneswar");
        settings.setCampusState("Odisha");
        settings.setCampusCountry("India");
        settings.setAddress("Bhubaneswar, Odisha");
        settings.setPhone("");
        settings.setEmail("");
        settings.setPrincipalName("");
        settings.setAcademicYear("2026 - 2027");
        settings.setDefaultSections("A,B,C");
        settings.setHouses("Red,Blue,Green,Yellow");
        settings.setWorkingDays("Monday-Saturday");
        settings.setCurrency("INR");
        settings.setReceiptPrefix("KIITIS-REC");
        settings.setPassPercentage(40.0);
        settings.setGradeRules("A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39");
        return schoolSettingsRepository.save(settings);
    }

    private void applyUpdates(SchoolSettings settings, Map<String, Object> data) {
        if (data.containsKey("school_name")) settings.setSchoolName(str(data.get("school_name")));
        if (data.containsKey("tagline")) settings.setTagline(str(data.get("tagline")));
        if (data.containsKey("institution_type")) settings.setInstitutionType(str(data.get("institution_type")));
        if (data.containsKey("board_affiliation")) settings.setBoardAffiliation(str(data.get("board_affiliation")));
        if (data.containsKey("school_code")) settings.setSchoolCode(str(data.get("school_code")));
        if (data.containsKey("website")) settings.setWebsite(str(data.get("website")));
        if (data.containsKey("logo_url")) settings.setLogoUrl(str(data.get("logo_url")));
        if (data.containsKey("campus_name")) settings.setCampusName(str(data.get("campus_name")));
        if (data.containsKey("campus_city")) settings.setCampusCity(str(data.get("campus_city")));
        if (data.containsKey("campus_state")) settings.setCampusState(str(data.get("campus_state")));
        if (data.containsKey("campus_country")) settings.setCampusCountry(str(data.get("campus_country")));
        if (data.containsKey("address")) settings.setAddress(str(data.get("address")));
        if (data.containsKey("phone")) settings.setPhone(str(data.get("phone")));
        if (data.containsKey("email")) settings.setEmail(str(data.get("email")));
        if (data.containsKey("principal_name")) settings.setPrincipalName(str(data.get("principal_name")));
        if (data.containsKey("academic_year")) settings.setAcademicYear(str(data.get("academic_year")));
        if (data.containsKey("default_sections")) settings.setDefaultSections(str(data.get("default_sections")));
        if (data.containsKey("houses")) settings.setHouses(str(data.get("houses")));
        if (data.containsKey("working_days")) settings.setWorkingDays(str(data.get("working_days")));
        if (data.containsKey("currency")) settings.setCurrency(str(data.get("currency")));
        if (data.containsKey("receipt_prefix")) settings.setReceiptPrefix(str(data.get("receipt_prefix")));
        if (data.containsKey("upi_id")) settings.setUpiId(str(data.get("upi_id")));
        if (data.containsKey("late_fee_rule")) settings.setLateFeeRule(str(data.get("late_fee_rule")));
        if (data.containsKey("pass_percentage")) {
            Object v = data.get("pass_percentage");
            settings.setPassPercentage(v == null ? null : Double.valueOf(v.toString()));
        }
        if (data.containsKey("grade_rules")) settings.setGradeRules(str(data.get("grade_rules")));
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
    }
}
