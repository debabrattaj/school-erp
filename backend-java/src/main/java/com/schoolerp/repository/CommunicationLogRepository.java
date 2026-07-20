package com.schoolerp.repository;

import com.schoolerp.entity.CommunicationLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommunicationLogRepository extends JpaRepository<CommunicationLog, Long> {
}
