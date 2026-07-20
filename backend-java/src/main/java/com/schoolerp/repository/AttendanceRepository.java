package com.schoolerp.repository;

import com.schoolerp.entity.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {
    List<Attendance> findByStudentId(Long studentId);
    List<Attendance> findByAttendanceDate(LocalDate date);
    List<Attendance> findByClassIdAndAttendanceDate(Long classId, LocalDate date);
    Optional<Attendance> findByStudentIdAndAttendanceDate(Long studentId, LocalDate date);
}
