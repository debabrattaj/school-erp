package com.schoolerp.repository;

import com.schoolerp.entity.AdmissionInquiry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AdmissionInquiryRepository extends JpaRepository<AdmissionInquiry, Long> {
    Optional<AdmissionInquiry> findByInquiryNo(String inquiryNo);
    Optional<AdmissionInquiry> findTopByOrderByIdDesc();
}
