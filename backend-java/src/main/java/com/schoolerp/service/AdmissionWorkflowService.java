package com.schoolerp.service;

import com.schoolerp.entity.AdmissionWorkflowStage;
import com.schoolerp.repository.AdmissionWorkflowStageRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/** Shared between AdmissionWorkflowStageController and AdmissionController, mirroring admission_workflow.py's ensure_default_stages(). */
@Service
public class AdmissionWorkflowService {

    private static final List<Object[]> DEFAULT_STAGES = List.of(
            new Object[]{"Inquiry", 1, false},
            new Object[]{"Contacted", 2, false},
            new Object[]{"Visit Scheduled", 3, false},
            new Object[]{"Assessment", 4, false},
            new Object[]{"Offered", 5, false},
            new Object[]{"Enrolled", 6, true},
            new Object[]{"Lost", 7, true}
    );

    private final AdmissionWorkflowStageRepository admissionWorkflowStageRepository;

    public AdmissionWorkflowService(AdmissionWorkflowStageRepository admissionWorkflowStageRepository) {
        this.admissionWorkflowStageRepository = admissionWorkflowStageRepository;
    }

    public void ensureDefaultStages() {
        if (admissionWorkflowStageRepository.count() > 0) {
            return;
        }
        for (Object[] row : DEFAULT_STAGES) {
            AdmissionWorkflowStage stage = new AdmissionWorkflowStage();
            stage.setName((String) row[0]);
            stage.setSortOrder((Integer) row[1]);
            stage.setTerminal((Boolean) row[2]);
            admissionWorkflowStageRepository.save(stage);
        }
    }
}
