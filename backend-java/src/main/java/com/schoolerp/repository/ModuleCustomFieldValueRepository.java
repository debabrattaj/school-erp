package com.schoolerp.repository;

import com.schoolerp.entity.ModuleCustomFieldValue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ModuleCustomFieldValueRepository extends JpaRepository<ModuleCustomFieldValue, Long> {
    List<ModuleCustomFieldValue> findByModuleNameAndRecordIdOrderByIdAsc(String moduleName, Long recordId);
    List<ModuleCustomFieldValue> findByModuleNameAndRecordId(String moduleName, Long recordId);
    Optional<ModuleCustomFieldValue> findByModuleNameAndRecordIdAndFieldKey(String moduleName, Long recordId, String fieldKey);
}
