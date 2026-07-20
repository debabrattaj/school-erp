package com.schoolerp.repository;

import com.schoolerp.entity.MessMenu;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface MessMenuRepository extends JpaRepository<MessMenu, Long> {
    Optional<MessMenu> findByMenuDateAndMealType(LocalDate menuDate, String mealType);
}
