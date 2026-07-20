package com.schoolerp.repository;

import com.schoolerp.entity.ClassSubject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ClassSubjectRepository extends JpaRepository<ClassSubject, Long> {
    List<ClassSubject> findByClassId(Long classId);
    List<ClassSubject> findByClassIdAndAcademicYear(Long classId, String academicYear);
    Optional<ClassSubject> findByClassIdAndAcademicYearAndSubjectName(Long classId, String academicYear, String subjectName);
}
