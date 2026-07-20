package com.schoolerp.repository;

import com.schoolerp.entity.LibraryIssue;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LibraryIssueRepository extends JpaRepository<LibraryIssue, Long> {
}
