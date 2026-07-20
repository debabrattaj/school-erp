package com.schoolerp.repository;

import com.schoolerp.entity.SubjectMaster;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SubjectMasterRepository extends JpaRepository<SubjectMaster, Long> {
    Optional<SubjectMaster> findBySubjectCode(String subjectCode);
    Optional<SubjectMaster> findBySubjectName(String subjectName);
}
