package com.schoolerp.repository;

import com.schoolerp.entity.AdmissionFollowUp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AdmissionFollowUpRepository extends JpaRepository<AdmissionFollowUp, Long> {
    List<AdmissionFollowUp> findByInquiryId(Long inquiryId);
}
