package com.schoolerp.repository;

import com.schoolerp.entity.LibraryBook;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface LibraryBookRepository extends JpaRepository<LibraryBook, Long> {
    Optional<LibraryBook> findByAccessionNo(String accessionNo);
}
