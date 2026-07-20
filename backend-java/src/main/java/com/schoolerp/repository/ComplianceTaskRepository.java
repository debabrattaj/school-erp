package com.schoolerp.repository;

import com.schoolerp.entity.ComplianceTask;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ComplianceTaskRepository extends JpaRepository<ComplianceTask, Long> {
    Optional<ComplianceTask> findByTaskCode(String taskCode);
    Optional<ComplianceTask> findTopByOrderByIdDesc();
}
