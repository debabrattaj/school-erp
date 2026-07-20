package com.schoolerp.repository;

import com.schoolerp.entity.Mark;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MarkRepository extends JpaRepository<Mark, Long> {
    List<Mark> findByStudentId(Long studentId);
    List<Mark> findByExamId(Long examId);
    Optional<Mark> findByStudentIdAndExamIdAndClassSubjectId(Long studentId, Long examId, Long classSubjectId);
}
