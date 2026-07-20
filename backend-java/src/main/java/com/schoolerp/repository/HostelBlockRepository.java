package com.schoolerp.repository;

import com.schoolerp.entity.HostelBlock;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface HostelBlockRepository extends JpaRepository<HostelBlock, Long> {
    Optional<HostelBlock> findByBlockName(String blockName);
}
