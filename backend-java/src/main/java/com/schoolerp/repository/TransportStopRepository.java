package com.schoolerp.repository;

import com.schoolerp.entity.TransportStop;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TransportStopRepository extends JpaRepository<TransportStop, Long> {
    Optional<TransportStop> findByRouteIdAndStopName(Long routeId, String stopName);
}
