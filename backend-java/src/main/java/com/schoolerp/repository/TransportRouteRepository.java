package com.schoolerp.repository;

import com.schoolerp.entity.TransportRoute;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TransportRouteRepository extends JpaRepository<TransportRoute, Long> {
    Optional<TransportRoute> findByRouteName(String routeName);
}
