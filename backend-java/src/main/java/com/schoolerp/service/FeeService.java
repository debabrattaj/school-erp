package com.schoolerp.service;

import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.repository.FeeRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import org.springframework.stereotype.Service;

import java.time.Year;
import java.util.List;

/**
 * Fee status/receipt logic shared between FeeController and
 * PortalController's UPI-confirm endpoint, matching app/routes/fees.py's
 * calculate_fee_status/generate_receipt_no/get_settings being imported by
 * both fees.py and portal.py rather than duplicated.
 */
@Service
public class FeeService {

    private final FeeRepository feeRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;

    public FeeService(FeeRepository feeRepository, SchoolSettingsRepository schoolSettingsRepository) {
        this.feeRepository = feeRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
    }

    /** Returns [dueAmount, statusCode] where statusCode: 0=Paid, 1=Partial, 2=Unpaid. */
    public double[] calculateFeeStatus(double totalAmount, double paidAmount) {
        double due = totalAmount - paidAmount;
        if (due <= 0) return new double[]{0, 0};
        if (paidAmount > 0) return new double[]{due, 1};
        return new double[]{due, 2};
    }

    public String statusLabel(double code) {
        if (code == 0) return "Paid";
        if (code == 1) return "Partial";
        return "Unpaid";
    }

    public String generateReceiptNo() {
        SchoolSettings settings = getOrCreateSettings();
        String prefix = settings.getReceiptPrefix() != null ? settings.getReceiptPrefix() : "REC";
        int year = Year.now().getValue();
        long count = feeRepository.count() + 1;
        return String.format("%s-%d-%05d", prefix, year, count);
    }

    public SchoolSettings getOrCreateSettings() {
        List<SchoolSettings> all = schoolSettingsRepository.findAll();
        if (!all.isEmpty()) {
            return all.get(0);
        }
        SchoolSettings settings = new SchoolSettings();
        settings.setSchoolName("International School");
        settings.setCurrency("INR");
        settings.setReceiptPrefix("REC");
        return schoolSettingsRepository.save(settings);
    }
}
