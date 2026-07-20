package com.schoolerp.repository;

import com.schoolerp.entity.ModuleLayout;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ModuleLayoutRepository extends JpaRepository<ModuleLayout, Long> {
    Optional<ModuleLayout> findByModuleNameAndIsActiveTrue(String moduleName);
    Optional<ModuleLayout> findByModuleName(String moduleName);
}
