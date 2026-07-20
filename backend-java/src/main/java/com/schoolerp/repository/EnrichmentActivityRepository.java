package com.schoolerp.repository;

import com.schoolerp.entity.EnrichmentActivity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EnrichmentActivityRepository extends JpaRepository<EnrichmentActivity, Long> {
    Optional<EnrichmentActivity> findByActivityCode(String activityCode);
    Optional<EnrichmentActivity> findTopByOrderByIdDesc();
}
