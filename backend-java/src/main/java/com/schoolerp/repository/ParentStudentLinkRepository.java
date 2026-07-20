package com.schoolerp.repository;

import com.schoolerp.entity.ParentStudentLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ParentStudentLinkRepository extends JpaRepository<ParentStudentLink, Long> {
    List<ParentStudentLink> findByUserId(Long userId);
    Optional<ParentStudentLink> findByUserIdAndStudentId(Long userId, Long studentId);
    long countByUserId(Long userId);
}
