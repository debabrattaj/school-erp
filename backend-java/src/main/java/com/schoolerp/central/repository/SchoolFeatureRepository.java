package com.schoolerp.central.repository;

import com.schoolerp.central.entity.SchoolFeature;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SchoolFeatureRepository extends JpaRepository<SchoolFeature, Long> {
    List<SchoolFeature> findByAccountId(Long accountId);
    Optional<SchoolFeature> findByAccountIdAndFeatureKey(Long accountId, String featureKey);
}
