package com.schoolerp.repository;

import com.schoolerp.entity.StudentEnrollment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StudentEnrollmentRepository extends JpaRepository<StudentEnrollment, Long> {
    List<StudentEnrollment> findByAcademicYearAndEnrollmentStatus(String academicYear, String enrollmentStatus);
    List<StudentEnrollment> findByAcademicYear(String academicYear);
    List<StudentEnrollment> findByStudentId(Long studentId);
    Optional<StudentEnrollment> findByStudentIdAndClassIdAndAcademicYear(Long studentId, Long classId, String academicYear);
    Optional<StudentEnrollment> findByStudentIdAndAcademicYearAndEnrollmentStatus(Long studentId, String academicYear, String enrollmentStatus);
}
