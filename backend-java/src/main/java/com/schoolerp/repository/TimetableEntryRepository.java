package com.schoolerp.repository;

import com.schoolerp.entity.TimetableEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TimetableEntryRepository extends JpaRepository<TimetableEntry, Long> {
    List<TimetableEntry> findByClassIdAndAcademicYearOrderByPeriodNoAsc(Long classId, String academicYear);
    Optional<TimetableEntry> findByAcademicYearAndClassIdAndDayOfWeekAndPeriodNo(String academicYear, Long classId, String dayOfWeek, Integer periodNo);
}
