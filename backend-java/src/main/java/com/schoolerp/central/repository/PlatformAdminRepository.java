package com.schoolerp.central.repository;

import com.schoolerp.central.entity.PlatformAdmin;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlatformAdminRepository extends JpaRepository<PlatformAdmin, Long> {
    Optional<PlatformAdmin> findByEmail(String email);
}
