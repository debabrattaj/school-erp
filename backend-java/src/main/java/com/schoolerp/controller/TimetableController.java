package com.schoolerp.controller;

import com.schoolerp.dto.timetable.TimetableEntryCreate;
import com.schoolerp.entity.SchoolClass;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.entity.Teacher;
import com.schoolerp.entity.TimetableEntry;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.SchoolClassRepository;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.repository.TeacherRepository;
import com.schoolerp.repository.TimetableEntryRepository;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.PdfService;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** Direct port of backend/app/routes/timetable.py's CRUD and PDF export endpoints. */
@RestController
@RequestMapping("/timetable")
public class TimetableController {

    private static final List<String> VALID_DAYS = List.of("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday");

    private final TimetableEntryRepository timetableEntryRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final TeacherRepository teacherRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final PermissionService permissionService;
    private final PdfService pdfService;

    public TimetableController(
            TimetableEntryRepository timetableEntryRepository,
            SchoolClassRepository schoolClassRepository,
            TeacherRepository teacherRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            PermissionService permissionService,
            PdfService pdfService
    ) {
        this.timetableEntryRepository = timetableEntryRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.teacherRepository = teacherRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.permissionService = permissionService;
        this.pdfService = pdfService;
    }

    @GetMapping("/pdf")
    public ResponseEntity<byte[]> timetablePdfExport(
            @RequestParam(name = "class_id", required = false) Long classId,
            @RequestParam(name = "teacher_id", required = false) Long teacherId,
            @RequestParam(name = "academic_year", required = false) String academicYear
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");

        if (classId == null && teacherId == null) {
            throw ApiException.badRequest("class_id or teacher_id is required");
        }

        Long finalClassId = classId;
        Long finalTeacherId = teacherId;
        List<TimetableEntry> entries = timetableEntryRepository.findAll().stream()
                .filter(e -> finalClassId == null || finalClassId.equals(e.getClassId()))
                .filter(e -> finalTeacherId == null || finalTeacherId.equals(e.getTeacherId()))
                .filter(e -> academicYear == null || academicYear.equals(e.getAcademicYear()))
                .sorted(Comparator.comparing(TimetableEntry::getPeriodNo))
                .toList();
        if (entries.isEmpty()) {
            throw ApiException.notFound("No timetable entries found");
        }

        List<SchoolSettings> allSettings = schoolSettingsRepository.findAll();
        String schoolName = !allSettings.isEmpty() && allSettings.get(0).getSchoolName() != null
                ? allSettings.get(0).getSchoolName() : "School";

        Map<Integer, List<TimetableEntry>> periodRows = new TreeMap<>();
        for (TimetableEntry entry : entries) {
            periodRows.computeIfAbsent(entry.getPeriodNo(), k -> new ArrayList<>()).add(entry);
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map.Entry<Integer, List<TimetableEntry>> group : periodRows.entrySet()) {
            Integer periodNo = group.getKey();
            List<TimetableEntry> groupEntries = group.getValue();
            TimetableEntry breakEntry = groupEntries.stream().filter(e -> !"period".equals(e.getEntryType())).findFirst().orElse(null);

            if (breakEntry != null) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("period_no", periodNo);
                row.put("is_break", true);
                String entryType = breakEntry.getEntryType();
                String titleCased = entryType == null ? "" : entryType.substring(0, 1).toUpperCase() + entryType.substring(1);
                row.put("break_label", breakEntry.getLabel() != null ? breakEntry.getLabel() : titleCased);
                row.put("start_time", breakEntry.getStartTime());
                row.put("end_time", breakEntry.getEndTime());
                rows.add(row);
                continue;
            }

            Map<String, Map<String, String>> cells = new LinkedHashMap<>();
            TimetableEntry sample = groupEntries.get(0);
            for (TimetableEntry entry : groupEntries) {
                String line1;
                String line2;
                if (classId != null) {
                    line1 = entry.getSubject() != null ? entry.getSubject() : "-";
                    line2 = entry.getTeacherNameSnapshot();
                } else {
                    String classLabel = entry.getClassNameSnapshot() != null ? entry.getClassNameSnapshot() : "";
                    if (entry.getSectionSnapshot() != null && !entry.getSectionSnapshot().isBlank()) {
                        classLabel = classLabel.isEmpty() ? entry.getSectionSnapshot() : classLabel + "-" + entry.getSectionSnapshot();
                    }
                    line1 = classLabel.isEmpty() ? "-" : classLabel;
                    line2 = entry.getSubject();
                }
                Map<String, String> cell = new LinkedHashMap<>();
                cell.put("line1", line1);
                cell.put("line2", line2);
                cells.put(entry.getDayOfWeek(), cell);
            }

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("period_no", periodNo);
            row.put("is_break", false);
            row.put("start_time", sample.getStartTime());
            row.put("end_time", sample.getEndTime());
            row.put("cells", cells);
            rows.add(row);
        }

        String title;
        String subtitle;
        List<String> days;
        if (classId != null) {
            SchoolClass cls = schoolClassRepository.findById(classId).orElse(null);
            title = cls != null ? cls.getClassName() + " - " + cls.getSection() : "Class";
            subtitle = "Class Timetable";
            days = VALID_DAYS.subList(0, 6);
        } else {
            Teacher teacher = teacherRepository.findById(teacherId).orElse(null);
            title = teacher != null ? teacher.getName() : "Teacher";
            subtitle = "Teacher Timetable";
            days = entries.stream().map(TimetableEntry::getDayOfWeek)
                    .filter(d -> d != null && !"*".equals(d))
                    .distinct()
                    .sorted(Comparator.comparingInt(VALID_DAYS::indexOf))
                    .toList();
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("school_name", schoolName);
        data.put("subtitle", subtitle);
        data.put("title", title);
        data.put("academic_year", academicYear != null ? academicYear : entries.get(0).getAcademicYear());
        data.put("days", days);
        data.put("rows", rows);

        byte[] pdfBytes = pdfService.timetablePdf(data);
        String filename = "timetable_" + (classId != null ? "class_" + classId : "teacher_" + teacherId) + ".pdf";

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=" + filename)
                .body(pdfBytes);
    }

    @GetMapping({"", "/"})
    public List<TimetableEntry> listTimetable(
            @RequestParam(name = "class_id", required = false) Long classId,
            @RequestParam(name = "academic_year", required = false) String academicYear,
            @RequestParam(name = "teacher_id", required = false) Long teacherId,
            @RequestParam(name = "day_of_week", required = false) String dayOfWeek
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return timetableEntryRepository.findAll().stream()
                .filter(e -> classId == null || classId.equals(e.getClassId()))
                .filter(e -> academicYear == null || academicYear.equals(e.getAcademicYear()))
                .filter(e -> teacherId == null || teacherId.equals(e.getTeacherId()))
                .filter(e -> dayOfWeek == null || dayOfWeek.equals(e.getDayOfWeek()))
                .sorted(Comparator.comparing(TimetableEntry::getPeriodNo))
                .toList();
    }

    @PostMapping({"", "/"})
    public TimetableEntry createTimetableEntry(@Valid @RequestBody TimetableEntryCreate payload) {
        permissionService.requireRoles("Admin", "Principal");

        boolean isBreak = !"period".equals(payload.getEntryType() != null ? payload.getEntryType() : "period");
        if (!isBreak && !VALID_DAYS.contains(payload.getDayOfWeek())) {
            throw ApiException.badRequest("Invalid day. Allowed: " + String.join(", ", VALID_DAYS));
        }
        if (payload.getPeriodNo() < 1) {
            throw ApiException.badRequest("Period number must be 1 or greater.");
        }

        TimetableEntry entry = new TimetableEntry();
        entry.setAcademicYear(payload.getAcademicYear());
        entry.setClassId(payload.getClassId());
        entry.setClassNameSnapshot(payload.getClassNameSnapshot());
        entry.setSectionSnapshot(payload.getSectionSnapshot());
        entry.setDayOfWeek(isBreak ? "*" : payload.getDayOfWeek());
        entry.setPeriodNo(payload.getPeriodNo());
        entry.setEntryType(payload.getEntryType() != null ? payload.getEntryType() : "period");
        entry.setLabel(payload.getLabel());
        entry.setDurationMin(payload.getDurationMin());
        entry.setStartTime(payload.getStartTime());
        entry.setEndTime(payload.getEndTime());
        entry.setSubject(payload.getSubject());
        entry.setTeacherId(payload.getTeacherId());
        entry.setTeacherNameSnapshot(payload.getTeacherNameSnapshot());
        entry.setRoom(payload.getRoom());

        checkTeacherClash(entry.getTeacherId(), entry.getAcademicYear(), entry.getDayOfWeek(), entry.getPeriodNo(), entry.getEntryType(), null);
        checkSlotClash(entry.getAcademicYear(), entry.getClassId(), entry.getDayOfWeek(), entry.getPeriodNo(), null);
        fillSnapshots(entry);

        try {
            return timetableEntryRepository.save(entry);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("This class already has a period in that day/slot.");
        }
    }

    @PutMapping("/{entryId}")
    public TimetableEntry updateTimetableEntry(@PathVariable Long entryId, @RequestBody Map<String, Object> updates) {
        permissionService.requireRoles("Admin", "Principal");

        TimetableEntry entry = timetableEntryRepository.findById(entryId)
                .orElseThrow(() -> ApiException.notFound("Timetable entry not found"));

        if (updates.containsKey("day_of_week") && updates.get("day_of_week") != null) {
            String day = updates.get("day_of_week").toString();
            if (!VALID_DAYS.contains(day) && !"*".equals(day)) {
                throw ApiException.badRequest("Invalid day. Allowed: " + String.join(", ", VALID_DAYS));
            }
        }

        applyUpdate(entry, updates, "academic_year", entry::setAcademicYear);
        applyUpdateLong(entry, updates, "class_id", entry::setClassId);
        applyUpdate(entry, updates, "day_of_week", entry::setDayOfWeek);
        applyUpdateInt(entry, updates, "period_no", entry::setPeriodNo);
        applyUpdate(entry, updates, "entry_type", entry::setEntryType);
        applyUpdate(entry, updates, "label", entry::setLabel);
        applyUpdateInt(entry, updates, "duration_min", entry::setDurationMin);
        applyUpdate(entry, updates, "start_time", entry::setStartTime);
        applyUpdate(entry, updates, "end_time", entry::setEndTime);
        applyUpdate(entry, updates, "subject", entry::setSubject);
        applyUpdateLong(entry, updates, "teacher_id", entry::setTeacherId);
        applyUpdate(entry, updates, "room", entry::setRoom);

        checkTeacherClash(entry.getTeacherId(), entry.getAcademicYear(), entry.getDayOfWeek(), entry.getPeriodNo(), entry.getEntryType(), entry.getId());
        checkSlotClash(entry.getAcademicYear(), entry.getClassId(), entry.getDayOfWeek(), entry.getPeriodNo(), entry.getId());
        fillSnapshots(entry);

        try {
            return timetableEntryRepository.save(entry);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("This class already has a period in that day/slot.");
        }
    }

    @DeleteMapping("/{entryId}")
    public Map<String, String> deleteTimetableEntry(@PathVariable Long entryId) {
        permissionService.requireRoles("Admin", "Principal");
        TimetableEntry entry = timetableEntryRepository.findById(entryId)
                .orElseThrow(() -> ApiException.notFound("Timetable entry not found"));
        timetableEntryRepository.delete(entry);
        return Map.of("message", "Timetable entry deleted");
    }

    /** Denormalize class/teacher names so the grid renders without extra joins. */
    private void fillSnapshots(TimetableEntry entry) {
        if (entry.getClassId() != null) {
            schoolClassRepository.findById(entry.getClassId()).ifPresent(cls -> {
                entry.setClassNameSnapshot(cls.getClassName());
                entry.setSectionSnapshot(cls.getSection());
            });
        }
        if (entry.getTeacherId() != null) {
            teacherRepository.findById(entry.getTeacherId()).ifPresent(teacher -> entry.setTeacherNameSnapshot(teacher.getName()));
        } else {
            entry.setTeacherNameSnapshot(null);
        }
    }

    /** A teacher cannot be in two places in the same year/day/period. */
    private void checkTeacherClash(Long teacherId, String academicYear, String dayOfWeek, Integer periodNo, String entryType, Long excludeId) {
        if (teacherId == null || !"period".equals(entryType != null ? entryType : "period")) {
            return;
        }
        TimetableEntry clash = timetableEntryRepository.findAll().stream()
                .filter(e -> teacherId.equals(e.getTeacherId()))
                .filter(e -> Objects.equals(academicYear, e.getAcademicYear()))
                .filter(e -> Objects.equals(dayOfWeek, e.getDayOfWeek()))
                .filter(e -> Objects.equals(periodNo, e.getPeriodNo()))
                .filter(e -> excludeId == null || !excludeId.equals(e.getId()))
                .findFirst()
                .orElse(null);
        if (clash != null) {
            throw ApiException.badRequest(
                    "Teacher is already assigned to " + (clash.getClassNameSnapshot() != null ? clash.getClassNameSnapshot() : "another class")
                            + " " + (clash.getSectionSnapshot() != null ? clash.getSectionSnapshot() : "")
                            + " in period " + clash.getPeriodNo() + " on " + clash.getDayOfWeek() + "."
            );
        }
    }

    /**
     * Application-level enforcement of uq_timetable_slot (academic_year,
     * class_id, day_of_week, period_no). Hibernate's schema *update*
     * migrator (used to lazily provision tenant DBs) does not reliably emit
     * multi-column @UniqueConstraint DDL the way it does single-column
     * unique columns, so this cannot be relied on to come from the database
     * alone the way the Python/SQLAlchemy original does.
     */
    private void checkSlotClash(String academicYear, Long classId, String dayOfWeek, Integer periodNo, Long excludeId) {
        boolean clash = timetableEntryRepository.findAll().stream()
                .filter(e -> excludeId == null || !excludeId.equals(e.getId()))
                .anyMatch(e -> Objects.equals(academicYear, e.getAcademicYear())
                        && Objects.equals(classId, e.getClassId())
                        && Objects.equals(dayOfWeek, e.getDayOfWeek())
                        && Objects.equals(periodNo, e.getPeriodNo()));
        if (clash) {
            throw ApiException.badRequest("This class already has a period in that day/slot.");
        }
    }

    private void applyUpdate(TimetableEntry entry, Map<String, Object> updates, String key, java.util.function.Consumer<String> setter) {
        if (updates.containsKey(key)) {
            Object v = updates.get(key);
            setter.accept(v == null ? null : v.toString());
        }
    }

    private void applyUpdateLong(TimetableEntry entry, Map<String, Object> updates, String key, java.util.function.Consumer<Long> setter) {
        if (updates.containsKey(key)) {
            Object v = updates.get(key);
            setter.accept(v == null ? null : Long.valueOf(v.toString()));
        }
    }

    private void applyUpdateInt(TimetableEntry entry, Map<String, Object> updates, String key, java.util.function.Consumer<Integer> setter) {
        if (updates.containsKey(key)) {
            Object v = updates.get(key);
            setter.accept(v == null ? null : Integer.valueOf(v.toString()));
        }
    }
}
