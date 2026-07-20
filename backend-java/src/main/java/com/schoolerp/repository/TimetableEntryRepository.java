package com.schoolerp.repository;

import com.schoolerp.entity.TimetableEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TimetableEntryRepository extends JpaRepository<TimetableEntry, Long> {
    List<TimetableEntry> findByClassIdAndAcademicYearOrderByPeriodNoAsc(Long classId, String academicYear);
}
