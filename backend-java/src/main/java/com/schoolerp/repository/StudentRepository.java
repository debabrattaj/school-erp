package com.schoolerp.repository;

import com.schoolerp.entity.Student;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StudentRepository extends JpaRepository<Student, Long> {
    Optional<Student> findByAdmissionNo(String admissionNo);
    List<Student> findAllByOrderByIdDesc();
    List<Student> findByClassId(Long classId);
    List<Student> findByClassNameAndSection(String className, String section);
}
