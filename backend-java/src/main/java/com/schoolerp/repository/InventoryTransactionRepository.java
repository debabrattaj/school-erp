package com.schoolerp.repository;

import com.schoolerp.entity.InventoryTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InventoryTransactionRepository extends JpaRepository<InventoryTransaction, Long> {
    List<InventoryTransaction> findByItemIdAndTransactionTypeAndCycleAndAcademicYearAndIssuedToStudentIdIn(
            Long itemId, String transactionType, String cycle, String academicYear, List<Long> studentIds);
}
