package com.schoolerp.controller;

import com.schoolerp.dto.subject.ClassExamMappingCreate;
import com.schoolerp.dto.subject.ClassSubjectCreate;
import com.schoolerp.dto.subject.SubjectCreate;
import com.schoolerp.entity.*;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Direct port of backend/app/routes/subjects.py (subjects, class-subjects, class-exam-mappings). */
@RestController
public class SubjectController {

    private final SubjectMasterRepository subjectMasterRepository;
    private final ClassSubjectRepository classSubjectRepository;
    private final ClassExamMappingRepository classExamMappingRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final TeacherRepository teacherRepository;
    private final ExamRepository examRepository;

    public SubjectController(
            SubjectMasterRepository subjectMasterRepository,
            ClassSubjectRepository classSubjectRepository,
            ClassExamMappingRepository classExamMappingRepository,
            SchoolClassRepository schoolClassRepository,
            TeacherRepository teacherRepository,
            ExamRepository examRepository
    ) {
        this.subjectMasterRepository = subjectMasterRepository;
        this.classSubjectRepository = classSubjectRepository;
        this.classExamMappingRepository = classExamMappingRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.teacherRepository = teacherRepository;
        this.examRepository = examRepository;
    }

    // ===================== Subject Master =====================

    @GetMapping({"/subjects", "/subjects/"})
    public List<SubjectMaster> getSubjects() {
        return subjectMasterRepository.findAll().stream()
                .sorted(Comparator.comparing(SubjectMaster::getSubjectName, Comparator.nullsLast(String::compareTo)))
                .toList();
    }

    @GetMapping("/subjects/{subjectId}")
    public SubjectMaster getSubject(@PathVariable Long subjectId) {
        return subjectMasterRepository.findById(subjectId).orElseThrow(() -> ApiException.notFound("Subject not found"));
    }

    @PostMapping({"/subjects", "/subjects/"})
    public SubjectMaster createSubject(@Valid @RequestBody SubjectCreate payload) {
        subjectMasterRepository.findBySubjectCode(payload.getSubjectCode())
                .ifPresent(existing -> { throw ApiException.badRequest("Subject code already exists"); });

        SubjectMaster subject = new SubjectMaster();
        subject.setSubjectCode(payload.getSubjectCode());
        subject.setSubjectName(payload.getSubjectName());
        subject.setSubjectType(payload.getSubjectType());
        subject.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        return subjectMasterRepository.save(subject);
    }

    @PutMapping("/subjects/{subjectId}")
    public SubjectMaster updateSubject(@PathVariable Long subjectId, @Valid @RequestBody SubjectCreate payload) {
        SubjectMaster subject = subjectMasterRepository.findById(subjectId).orElseThrow(() -> ApiException.notFound("Subject not found"));

        subjectMasterRepository.findBySubjectCode(payload.getSubjectCode()).ifPresent(existing -> {
            if (!existing.getId().equals(subjectId)) {
                throw ApiException.badRequest("Subject code already exists");
            }
        });

        subject.setSubjectCode(payload.getSubjectCode());
        subject.setSubjectName(payload.getSubjectName());
        subject.setSubjectType(payload.getSubjectType());
        subject.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        return subjectMasterRepository.save(subject);
    }

    @DeleteMapping("/subjects/{subjectId}")
    public Map<String, String> deleteSubject(@PathVariable Long subjectId) {
        SubjectMaster subject = subjectMasterRepository.findById(subjectId).orElseThrow(() -> ApiException.notFound("Subject not found"));
        subjectMasterRepository.delete(subject);
        return Map.of("message", "Subject deleted successfully");
    }

    // ===================== Class Subject Mapping =====================

    @GetMapping({"/class-subjects", "/class-subjects/"})
    public List<ClassSubject> getClassSubjects(
            @RequestParam(name = "class_id", required = false) Long classId,
            @RequestParam(name = "academic_year", required = false) String academicYear,
            @RequestParam(name = "subject_id", required = false) Long subjectId,
            @RequestParam(name = "subject_name", required = false) String subjectName,
            @RequestParam(name = "teacher_id", required = false) Long teacherId,
            @RequestParam(name = "active_only", required = false, defaultValue = "false") boolean activeOnly
    ) {
        return classSubjectRepository.findAll().stream()
                .filter(cs -> classId == null || classId.equals(cs.getClassId()))
                .filter(cs -> academicYear == null || academicYear.equals(cs.getAcademicYear()))
                .filter(cs -> subjectId == null || subjectId.equals(cs.getSubjectId()))
                .filter(cs -> subjectName == null || subjectName.equals(cs.getSubjectName()))
                .filter(cs -> teacherId == null || teacherId.equals(cs.getTeacherId()))
                .filter(cs -> !activeOnly || cs.isActive())
                .sorted(Comparator.comparing(ClassSubject::getId).reversed())
                .toList();
    }

    @GetMapping("/class-subjects/{classSubjectId}")
    public ClassSubject getClassSubject(@PathVariable Long classSubjectId) {
        return classSubjectRepository.findById(classSubjectId)
                .orElseThrow(() -> ApiException.notFound("Class subject mapping not found"));
    }

    @PostMapping({"/class-subjects", "/class-subjects/"})
    public ClassSubject createClassSubject(@Valid @RequestBody ClassSubjectCreate payload) {
        requireClassExists(payload.getClassId());
        if (payload.getTeacherId() != null) {
            requireTeacherExists(payload.getTeacherId());
        }

        ClassSubject mapping = new ClassSubject();
        mapping.setClassId(payload.getClassId());
        mapping.setSubjectId(payload.getSubjectId());
        mapping.setTeacherId(payload.getTeacherId());
        mapping.setWeeklyPeriods(payload.getWeeklyPeriods());
        mapping.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        applyNormalizedSubjectName(mapping, payload);
        requireNoClassSubjectClash(mapping, null);

        try {
            return classSubjectRepository.save(mapping);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("This subject is already mapped to this class");
        }
    }

    @PutMapping("/class-subjects/{classSubjectId}")
    public ClassSubject updateClassSubject(@PathVariable Long classSubjectId, @Valid @RequestBody ClassSubjectCreate payload) {
        ClassSubject mapping = classSubjectRepository.findById(classSubjectId)
                .orElseThrow(() -> ApiException.notFound("Class subject mapping not found"));

        requireClassExists(payload.getClassId());
        if (payload.getTeacherId() != null) {
            requireTeacherExists(payload.getTeacherId());
        }

        mapping.setClassId(payload.getClassId());
        mapping.setSubjectId(payload.getSubjectId());
        mapping.setTeacherId(payload.getTeacherId());
        mapping.setWeeklyPeriods(payload.getWeeklyPeriods());
        mapping.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        applyNormalizedSubjectName(mapping, payload);
        requireNoClassSubjectClash(mapping, classSubjectId);

        try {
            return classSubjectRepository.save(mapping);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("This subject is already mapped to this class");
        }
    }

    /**
     * Application-level enforcement of ClassSubject's (class_id, academic_year,
     * subject_name) uniqueness. Hibernate's schema *update* migrator (used to
     * lazily provision tenant DBs) does not reliably emit multi-column
     * @UniqueConstraint DDL the way it does single-column unique columns, so
     * this cannot be relied on to come from the database alone the way the
     * Python/SQLAlchemy original does.
     */
    private void requireNoClassSubjectClash(ClassSubject mapping, Long excludeId) {
        boolean clash = classSubjectRepository.findAll().stream()
                .filter(cs -> excludeId == null || !cs.getId().equals(excludeId))
                .anyMatch(cs -> Objects.equals(cs.getClassId(), mapping.getClassId())
                        && Objects.equals(cs.getAcademicYear(), mapping.getAcademicYear())
                        && Objects.equals(cs.getSubjectName(), mapping.getSubjectName()));
        if (clash) {
            throw ApiException.badRequest("This subject is already mapped to this class");
        }
    }

    @DeleteMapping("/class-subjects/{classSubjectId}")
    public Map<String, String> deleteClassSubject(@PathVariable Long classSubjectId) {
        ClassSubject mapping = classSubjectRepository.findById(classSubjectId)
                .orElseThrow(() -> ApiException.notFound("Class subject mapping not found"));
        classSubjectRepository.delete(mapping);
        return Map.of("message", "Class subject mapping deleted successfully");
    }

    private void applyNormalizedSubjectName(ClassSubject mapping, ClassSubjectCreate payload) {
        String subjectName = payload.getSubjectName();
        if (payload.getSubjectId() != null) {
            SubjectMaster subject = subjectMasterRepository.findById(payload.getSubjectId())
                    .orElseThrow(() -> ApiException.notFound("Subject not found"));
            subjectName = subject.getSubjectName();
        }
        if (subjectName == null || subjectName.isBlank()) {
            throw ApiException.badRequest("Subject is required");
        }
        mapping.setSubjectName(subjectName.trim());
        String academicYear = payload.getAcademicYear();
        mapping.setAcademicYear((academicYear == null || academicYear.isBlank() ? "2026-27" : academicYear).trim());
    }

    // ===================== Class Exam Mapping =====================

    @GetMapping({"/class-exam-mappings", "/class-exam-mappings/"})
    public List<ClassExamMapping> getClassExamMappings(
            @RequestParam(name = "class_id", required = false) Long classId,
            @RequestParam(name = "exam_id", required = false) Long examId,
            @RequestParam(name = "academic_year", required = false) String academicYear,
            @RequestParam(name = "active_only", required = false, defaultValue = "false") boolean activeOnly
    ) {
        return classExamMappingRepository.findAll().stream()
                .filter(m -> classId == null || classId.equals(m.getClassId()))
                .filter(m -> examId == null || examId.equals(m.getExamId()))
                .filter(m -> academicYear == null || academicYear.equals(m.getAcademicYear()))
                .filter(m -> !activeOnly || m.isActive())
                .sorted(Comparator.comparing(ClassExamMapping::getId).reversed())
                .toList();
    }

    @PostMapping({"/class-exam-mappings", "/class-exam-mappings/"})
    public ClassExamMapping createClassExamMapping(@Valid @RequestBody ClassExamMappingCreate payload) {
        requireClassExists(payload.getClassId());
        requireExamExists(payload.getExamId());

        ClassExamMapping mapping = new ClassExamMapping();
        mapping.setClassId(payload.getClassId());
        mapping.setExamId(payload.getExamId());
        mapping.setAcademicYear(payload.getAcademicYear());
        mapping.setExamDate(payload.getExamDate());
        mapping.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        mapping.setRemarks(payload.getRemarks());
        requireNoClassExamClash(mapping, null);

        try {
            return classExamMappingRepository.save(mapping);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("This exam is already mapped to this class for this academic year");
        }
    }

    @PutMapping("/class-exam-mappings/{mappingId}")
    public ClassExamMapping updateClassExamMapping(@PathVariable Long mappingId, @Valid @RequestBody ClassExamMappingCreate payload) {
        ClassExamMapping mapping = classExamMappingRepository.findById(mappingId)
                .orElseThrow(() -> ApiException.notFound("Class exam mapping not found"));

        requireClassExists(payload.getClassId());
        requireExamExists(payload.getExamId());

        mapping.setClassId(payload.getClassId());
        mapping.setExamId(payload.getExamId());
        mapping.setAcademicYear(payload.getAcademicYear());
        mapping.setExamDate(payload.getExamDate());
        mapping.setActive(Boolean.TRUE.equals(payload.getIsActive()));
        mapping.setRemarks(payload.getRemarks());
        requireNoClassExamClash(mapping, mappingId);

        try {
            return classExamMappingRepository.save(mapping);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("This exam is already mapped to this class for this academic year");
        }
    }

    /** Application-level enforcement, see requireNoClassSubjectClash for why. */
    private void requireNoClassExamClash(ClassExamMapping mapping, Long excludeId) {
        boolean clash = classExamMappingRepository.findAll().stream()
                .filter(m -> excludeId == null || !m.getId().equals(excludeId))
                .anyMatch(m -> Objects.equals(m.getClassId(), mapping.getClassId())
                        && Objects.equals(m.getExamId(), mapping.getExamId())
                        && Objects.equals(m.getAcademicYear(), mapping.getAcademicYear()));
        if (clash) {
            throw ApiException.badRequest("This exam is already mapped to this class for this academic year");
        }
    }

    @DeleteMapping("/class-exam-mappings/{mappingId}")
    public Map<String, String> deleteClassExamMapping(@PathVariable Long mappingId) {
        ClassExamMapping mapping = classExamMappingRepository.findById(mappingId)
                .orElseThrow(() -> ApiException.notFound("Class exam mapping not found"));
        classExamMappingRepository.delete(mapping);
        return Map.of("message", "Class exam mapping deleted successfully");
    }

    private void requireClassExists(Long classId) {
        if (!schoolClassRepository.existsById(classId)) {
            throw ApiException.notFound("Class not found");
        }
    }

    private void requireTeacherExists(Long teacherId) {
        if (!teacherRepository.existsById(teacherId)) {
            throw ApiException.notFound("Teacher not found");
        }
    }

    private void requireExamExists(Long examId) {
        if (!examRepository.existsById(examId)) {
            throw ApiException.notFound("Exam not found");
        }
    }
}
