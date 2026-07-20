package com.schoolerp.repository;

import com.schoolerp.entity.Teacher;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TeacherRepository extends JpaRepository<Teacher, Long> {
    Optional<Teacher> findByEmployeeNo(String employeeNo);
    Optional<Teacher> findByEmail(String email);
    List<Teacher> findAllByOrderByIdDesc();
    Optional<Teacher> findFirstByClassIdAndIsClassTeacherTrue(Long classId);
    Optional<Teacher> findFirstByName(String name);
}
