package com.schoolerp.repository;

import com.schoolerp.entity.StudentServiceTicket;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StudentServiceTicketRepository extends JpaRepository<StudentServiceTicket, Long> {
    Optional<StudentServiceTicket> findByTicketNo(String ticketNo);
    Optional<StudentServiceTicket> findTopByOrderByIdDesc();
}
