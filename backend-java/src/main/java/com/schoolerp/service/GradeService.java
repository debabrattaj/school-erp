package com.schoolerp.service;

import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.repository.SchoolSettingsRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Grade calculation shared between MarkController and CertificateController
 * (transcript generation), matching app/routes/marks.py's module-level
 * calculate_grade() function that both marks.py and certificates.py import.
 */
@Service
public class GradeService {

    private final SchoolSettingsRepository schoolSettingsRepository;

    public GradeService(SchoolSettingsRepository schoolSettingsRepository) {
        this.schoolSettingsRepository = schoolSettingsRepository;
    }

    public String calculateGrade(double marksObtained, double totalMarks) {
        double percentage = (marksObtained / totalMarks) * 100;
        SchoolSettings settings = getOrCreateSchoolSettings();
        String gradeRules = settings.getGradeRules() != null ? settings.getGradeRules()
                : "A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39";

        for (String rule : gradeRules.split(",")) {
            String[] parts = rule.split(":");
            if (parts.length != 2) continue;
            String[] range = parts[1].split("-");
            if (range.length != 2) continue;
            try {
                double min = Double.parseDouble(range[0]);
                double max = Double.parseDouble(range[1]);
                if (percentage >= min && percentage <= max) {
                    return parts[0].trim();
                }
            } catch (NumberFormatException ignored) {
                // matches Python's except ValueError: continue
            }
        }

        double passPercentage = settings.getPassPercentage() != null ? settings.getPassPercentage() : 40;
        return percentage < passPercentage ? "F" : "Pass";
    }

    public SchoolSettings getOrCreateSchoolSettings() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (!all.isEmpty()) {
            return all.get(0);
        }
        SchoolSettings settings = new SchoolSettings();
        settings.setSchoolName("International School");
        settings.setPassPercentage(40.0);
        settings.setGradeRules("A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39");
        return schoolSettingsRepository.save(settings);
    }
}
