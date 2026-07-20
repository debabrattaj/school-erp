package com.schoolerp.repository;

import com.schoolerp.entity.MarkComponentScore;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MarkComponentScoreRepository extends JpaRepository<MarkComponentScore, Long> {
    List<MarkComponentScore> findByMarkId(Long markId);
}
