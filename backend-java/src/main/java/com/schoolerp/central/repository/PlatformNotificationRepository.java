package com.schoolerp.central.repository;

import com.schoolerp.central.entity.PlatformNotification;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformNotificationRepository extends JpaRepository<PlatformNotification, Long> {
}
