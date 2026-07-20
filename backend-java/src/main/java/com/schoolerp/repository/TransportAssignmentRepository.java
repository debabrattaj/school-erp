package com.schoolerp.repository;

import com.schoolerp.entity.TransportAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TransportAssignmentRepository extends JpaRepository<TransportAssignment, Long> {
    List<TransportAssignment> findByStudentIdAndStatus(Long studentId, String status);
    List<TransportAssignment> findByVehicleIdAndStatus(Long vehicleId, String status);
}
