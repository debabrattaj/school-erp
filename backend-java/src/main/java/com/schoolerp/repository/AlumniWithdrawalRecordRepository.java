package com.schoolerp.repository;

import com.schoolerp.entity.AlumniWithdrawalRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AlumniWithdrawalRecordRepository extends JpaRepository<AlumniWithdrawalRecord, Long> {
    Optional<AlumniWithdrawalRecord> findByRecordNo(String recordNo);
    Optional<AlumniWithdrawalRecord> findTopByOrderByIdDesc();
}
