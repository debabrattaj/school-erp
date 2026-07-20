package com.schoolerp.repository;

import com.schoolerp.entity.CounselingCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CounselingCaseRepository extends JpaRepository<CounselingCase, Long> {
    Optional<CounselingCase> findByCaseNo(String caseNo);
    Optional<CounselingCase> findTopByOrderByIdDesc();
}
