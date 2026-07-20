package com.schoolerp.repository;

import com.schoolerp.entity.ClassExamMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ClassExamMappingRepository extends JpaRepository<ClassExamMapping, Long> {
    Optional<ClassExamMapping> findByClassIdAndExamIdAndAcademicYear(Long classId, Long examId, String academicYear);
}
