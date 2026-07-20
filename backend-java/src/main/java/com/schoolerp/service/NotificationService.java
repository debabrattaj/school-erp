package com.schoolerp.service;

import com.schoolerp.entity.CommunicationLog;
import com.schoolerp.entity.Fee;
import com.schoolerp.entity.SchoolClass;
import com.schoolerp.entity.Student;
import com.schoolerp.entity.Teacher;
import com.schoolerp.repository.CommunicationLogRepository;
import com.schoolerp.repository.SchoolClassRepository;
import com.schoolerp.repository.TeacherRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Event-driven notifications to staff, direct port of
 * backend/app/notifications.py. Notifications are written as
 * CommunicationLog rows and delivered through CommunicationDeliveryService,
 * so every message (and any delivery failure) is visible on the
 * Communications page. Helpers here must never throw — a failed
 * notification must not break the operation (e.g. student admission) that
 * triggered it.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final SchoolClassRepository schoolClassRepository;
    private final TeacherRepository teacherRepository;
    private final CommunicationLogRepository communicationLogRepository;
    private final CommunicationDeliveryService deliveryService;
    private final PaymentLinkService paymentLinkService;

    public NotificationService(
            SchoolClassRepository schoolClassRepository,
            TeacherRepository teacherRepository,
            CommunicationLogRepository communicationLogRepository,
            CommunicationDeliveryService deliveryService,
            PaymentLinkService paymentLinkService
    ) {
        this.schoolClassRepository = schoolClassRepository;
        this.teacherRepository = teacherRepository;
        this.communicationLogRepository = communicationLogRepository;
        this.deliveryService = deliveryService;
        this.paymentLinkService = paymentLinkService;
    }

    /**
     * Resolve the class teacher for a student's class, trying the strongest
     * link first: (1) a Teacher flagged is_class_teacher whose class_id
     * matches the student's class_id; (2) the same, after resolving class_id
     * from the student's class_name + section; (3) the class row's free-text
     * class_teacher name matched against the Teacher list.
     */
    public Teacher findClassTeacher(Student student) {
        Long classId = student.getClassId();
        SchoolClass schoolClass = null;

        if (classId == null && student.getClassName() != null) {
            Optional<SchoolClass> match = student.getSection() != null
                    ? schoolClassRepository.findByClassNameAndSection(student.getClassName(), student.getSection())
                    : schoolClassRepository.findAllByOrderByClassNameAscSectionAsc().stream()
                        .filter(c -> student.getClassName().equals(c.getClassName()))
                        .findFirst();
            schoolClass = match.orElse(null);
            classId = schoolClass != null ? schoolClass.getId() : null;
        }

        if (classId != null) {
            Optional<Teacher> teacher = teacherRepository.findFirstByClassIdAndIsClassTeacherTrue(classId);
            if (teacher.isPresent()) {
                return teacher.get();
            }
            if (schoolClass == null) {
                Long finalClassId = classId;
                schoolClass = schoolClassRepository.findById(finalClassId).orElse(null);
            }
        }

        if (schoolClass != null && schoolClass.getClassTeacher() != null && !schoolClass.getClassTeacher().isBlank()) {
            return teacherRepository.findFirstByName(schoolClass.getClassTeacher().strip()).orElse(null);
        }

        return null;
    }

    /**
     * Email + SMS the class teacher that a student joined their class.
     * Silently does nothing when the class has no resolvable teacher or the
     * teacher has no contact details; never throws.
     */
    public void notifyClassTeacherNewStudent(Student student) {
        try {
            Teacher teacher = findClassTeacher(student);
            boolean hasContact = teacher != null && (isSet(teacher.getEmail()) || isSet(teacher.getPhone()));
            if (!hasContact) {
                log.info("New-student notification skipped for student {}: no reachable class teacher", student.getId());
                return;
            }

            String studentName = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                    + (student.getLastName() != null ? student.getLastName() : "")).trim();
            String classLabel = String.join("-", nonBlank(student.getClassName(), student.getSection()));
            String body = "New student admitted to your class: " + studentName
                    + " (Admission No " + student.getAdmissionNo()
                    + (classLabel.isEmpty() ? "" : ", Class " + classLabel) + ").";

            List<CommunicationLog> logs = new ArrayList<>();
            if (isSet(teacher.getEmail())) {
                CommunicationLog emailLog = new CommunicationLog();
                emailLog.setChannel("Email");
                emailLog.setCategory("Student Admission");
                emailLog.setRecipientName(teacher.getName());
                emailLog.setRecipientEmail(teacher.getEmail());
                emailLog.setRecipientPhone(teacher.getPhone());
                emailLog.setMessageBody(body);
                emailLog.setRelatedModule("students");
                emailLog.setRelatedRecordId(student.getId());
                logs.add(emailLog);
            }
            if (isSet(teacher.getPhone())) {
                CommunicationLog smsLog = new CommunicationLog();
                smsLog.setChannel("SMS");
                smsLog.setCategory("Student Admission");
                smsLog.setRecipientName(teacher.getName());
                smsLog.setRecipientPhone(teacher.getPhone());
                smsLog.setRecipientEmail(teacher.getEmail());
                smsLog.setMessageBody(body);
                smsLog.setRelatedModule("students");
                smsLog.setRelatedRecordId(student.getId());
                logs.add(smsLog);
            }

            for (CommunicationLog communicationLog : logs) {
                deliveryService.deliverMessage(communicationLog);
                communicationLogRepository.save(communicationLog);
            }
        } catch (Exception e) {
            log.error("Failed to notify class teacher about student {}", student.getId(), e);
        }
    }

    /**
     * WhatsApp the guardian a UPI payment link when a fee with an
     * outstanding balance is added for their child. Silently does nothing if
     * the guardian has no phone number or the fee has no balance due; never
     * throws.
     */
    public void notifyGuardianFeeAdded(Fee fee, Student student, String schoolName) {
        try {
            double balance = (fee.getTotalAmount() != null ? fee.getTotalAmount() : 0)
                    - (fee.getPaidAmount() != null ? fee.getPaidAmount() : 0);
            if (balance <= 0 || !isSet(student.getGuardianPhone())) {
                return;
            }

            String link = paymentLinkService.buildPaymentLink(fee.getId());
            String studentName = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                    + (student.getLastName() != null ? student.getLastName() : "")).trim();
            String body = String.format(
                    "Dear Parent, a fee of Rs.%.2f (%s) has been added for %s (Admission No %s) at %s. Pay via UPI: %s",
                    balance, fee.getFeeType(), studentName, student.getAdmissionNo(), schoolName, link
            );

            CommunicationLog communicationLog = new CommunicationLog();
            communicationLog.setChannel("WhatsApp");
            communicationLog.setCategory("Fee Payment");
            communicationLog.setRecipientName(isSet(student.getGuardianName()) ? student.getGuardianName() : "Parent");
            communicationLog.setRecipientPhone(student.getGuardianPhone());
            communicationLog.setRecipientEmail(student.getGuardianEmail());
            communicationLog.setMessageBody(body);
            communicationLog.setRelatedModule("fees");
            communicationLog.setRelatedRecordId(fee.getId());

            deliveryService.deliverMessage(communicationLog);
            communicationLogRepository.save(communicationLog);
        } catch (Exception e) {
            log.error("Failed to notify guardian about fee {}", fee.getId(), e);
        }
    }

    private boolean isSet(String value) {
        return value != null && !value.isBlank();
    }

    private List<String> nonBlank(String... parts) {
        List<String> result = new ArrayList<>();
        for (String part : parts) {
            if (isSet(part)) {
                result.add(part);
            }
        }
        return result;
    }
}
