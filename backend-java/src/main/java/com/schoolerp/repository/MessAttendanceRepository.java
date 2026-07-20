package com.schoolerp.repository;

import com.schoolerp.entity.MessAttendance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface MessAttendanceRepository extends JpaRepository<MessAttendance, Long> {
    Optional<MessAttendance> findByStudentIdAndMealDateAndMealType(Long studentId, LocalDate mealDate, String mealType);
}
