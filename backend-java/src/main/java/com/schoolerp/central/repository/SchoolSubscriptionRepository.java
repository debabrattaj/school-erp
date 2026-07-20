package com.schoolerp.central.repository;

import com.schoolerp.central.entity.SchoolSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SchoolSubscriptionRepository extends JpaRepository<SchoolSubscription, Long> {
    List<SchoolSubscription> findByAccountId(Long accountId);
}
