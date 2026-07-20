package com.schoolerp.repository;

import com.schoolerp.entity.ExamComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExamComponentRepository extends JpaRepository<ExamComponent, Long> {
    List<ExamComponent> findByExamIdOrderBySortOrderAsc(Long examId);
}
