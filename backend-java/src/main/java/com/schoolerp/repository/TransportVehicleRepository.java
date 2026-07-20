package com.schoolerp.repository;

import com.schoolerp.entity.TransportVehicle;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TransportVehicleRepository extends JpaRepository<TransportVehicle, Long> {
    Optional<TransportVehicle> findByVehicleNo(String vehicleNo);
}
