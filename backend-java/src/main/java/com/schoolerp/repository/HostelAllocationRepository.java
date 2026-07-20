package com.schoolerp.repository;

import com.schoolerp.entity.HostelAllocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HostelAllocationRepository extends JpaRepository<HostelAllocation, Long> {
    List<HostelAllocation> findByRoomIdAndStatus(Long roomId, String status);
    List<HostelAllocation> findByStudentIdAndStatus(Long studentId, String status);
    Optional<HostelAllocation> findByRoomIdAndBedNoAndStatus(Long roomId, String bedNo, String status);
}
