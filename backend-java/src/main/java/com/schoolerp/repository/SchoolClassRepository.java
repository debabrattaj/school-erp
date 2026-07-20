package com.schoolerp.repository;

import com.schoolerp.entity.SchoolClass;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SchoolClassRepository extends JpaRepository<SchoolClass, Long> {
    Optional<SchoolClass> findByClassNameAndSection(String className, String section);
    List<SchoolClass> findAllByOrderByClassNameAscSectionAsc();
    List<SchoolClass> findByClassTeacherId(Long classTeacherId);
}
