package com.schoolerp.repository;

import com.schoolerp.entity.StudentEnrollment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StudentEnrollmentRepository extends JpaRepository<StudentEnrollment, Long> {
    List<StudentEnrollment> findByAcademicYearAndEnrollmentStatus(String academicYear, String enrollmentStatus);
    List<StudentEnrollment> findByAcademicYear(String academicYear);
}
