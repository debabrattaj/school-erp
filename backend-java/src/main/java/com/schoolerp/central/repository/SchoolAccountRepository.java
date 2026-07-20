package com.schoolerp.central.repository;

import com.schoolerp.central.entity.SchoolAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SchoolAccountRepository extends JpaRepository<SchoolAccount, Long> {
    Optional<SchoolAccount> findByAccountCode(String accountCode);
}
