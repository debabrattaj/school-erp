package com.schoolerp.repository;

import com.schoolerp.entity.MasterData;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MasterDataRepository extends JpaRepository<MasterData, Long> {
    List<MasterData> findByCategoryOrderBySortOrderAsc(String category);
    Optional<MasterData> findByCategoryAndValue(String category, String value);
}
