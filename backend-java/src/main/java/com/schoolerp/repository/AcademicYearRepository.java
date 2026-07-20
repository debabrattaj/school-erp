package com.schoolerp.repository;

import com.schoolerp.entity.AcademicYear;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AcademicYearRepository extends JpaRepository<AcademicYear, Long> {
    Optional<AcademicYear> findByName(String name);
    List<AcademicYear> findAllByOrderByNameDesc();
    Optional<AcademicYear> findFirstByIsCurrentTrue();
}
