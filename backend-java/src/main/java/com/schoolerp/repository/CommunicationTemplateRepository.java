package com.schoolerp.repository;

import com.schoolerp.entity.CommunicationTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CommunicationTemplateRepository extends JpaRepository<CommunicationTemplate, Long> {
    Optional<CommunicationTemplate> findByTemplateName(String templateName);
}
