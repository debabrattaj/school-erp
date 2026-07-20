package com.schoolerp.repository;

import com.schoolerp.entity.DashboardLayout;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DashboardLayoutRepository extends JpaRepository<DashboardLayout, Long> {
    Optional<DashboardLayout> findByUserId(Long userId);
}
