package com.schoolerp.repository;

import com.schoolerp.entity.StudentCustomFieldValue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StudentCustomFieldValueRepository extends JpaRepository<StudentCustomFieldValue, Long> {
    List<StudentCustomFieldValue> findByStudentIdOrderByIdAsc(Long studentId);
    List<StudentCustomFieldValue> findByStudentId(Long studentId);
    Optional<StudentCustomFieldValue> findByStudentIdAndFieldKey(Long studentId, String fieldKey);
}
