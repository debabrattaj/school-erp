package com.schoolerp.repository;

import com.schoolerp.entity.AdmissionWorkflowStage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AdmissionWorkflowStageRepository extends JpaRepository<AdmissionWorkflowStage, Long> {
    Optional<AdmissionWorkflowStage> findByName(String name);
}
