package com.schoolerp.controller;

import com.schoolerp.dto.library.LibraryBookCreate;
import com.schoolerp.dto.library.LibraryIssueCreate;
import com.schoolerp.entity.LibraryBook;
import com.schoolerp.entity.LibraryIssue;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.LibraryBookRepository;
import com.schoolerp.repository.LibraryIssueRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/library.py. */
@RestController
@RequestMapping("/library")
public class LibraryController {

    private final LibraryBookRepository bookRepository;
    private final LibraryIssueRepository issueRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public LibraryController(
            LibraryBookRepository bookRepository,
            LibraryIssueRepository issueRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.bookRepository = bookRepository;
        this.issueRepository = issueRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    // ===================== books =====================

    @GetMapping("/books/")
    public List<LibraryBook> getBooks() {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return bookRepository.findAll().stream()
                .sorted(Comparator.comparing(LibraryBook::getTitle))
                .toList();
    }

    @PostMapping("/books/")
    public LibraryBook createBook(@Valid @RequestBody LibraryBookCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        if ((payload.getTotalCopies() != null && payload.getTotalCopies() < 0)
                || (payload.getAvailableCopies() != null && payload.getAvailableCopies() < 0)) {
            throw ApiException.badRequest("Copies cannot be negative");
        }
        requireNoAccessionClash(payload.getAccessionNo(), null);

        LibraryBook book = new LibraryBook();
        applyBookPayload(book, payload);

        return bookRepository.save(book);
    }

    @PutMapping("/books/{bookId}")
    public LibraryBook updateBook(@PathVariable Long bookId, @Valid @RequestBody LibraryBookCreate payload) {
        permissionService.requireRoles("Admin", "Principal");
        LibraryBook book = requireBook(bookId);
        requireNoAccessionClash(payload.getAccessionNo(), bookId);

        applyBookPayload(book, payload);

        return bookRepository.save(book);
    }

    @DeleteMapping("/books/{bookId}")
    public Map<String, String> deleteBook(@PathVariable Long bookId) {
        permissionService.requireRoles("Admin");
        LibraryBook book = requireBook(bookId);
        bookRepository.delete(book);
        return Map.of("message", "Book deleted successfully");
    }

    // ===================== issues =====================

    @GetMapping("/issues/")
    public List<Map<String, Object>> getIssues(
            @RequestParam(required = false) String status,
            @RequestParam(name = "student_id", required = false) Long studentId
    ) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        return issueRepository.findAll().stream()
                .filter(i -> status == null || status.equals(i.getStatus()))
                .filter(i -> studentId == null || studentId.equals(i.getStudentId()))
                .sorted(Comparator.comparing(LibraryIssue::getId).reversed())
                .map(this::serializeIssue)
                .toList();
    }

    @PostMapping("/issues/")
    public Map<String, Object> createIssue(@Valid @RequestBody LibraryIssueCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        LibraryBook book = requireBook(payload.getBookId());
        requireStudent(payload.getStudentId());

        if ("Issued".equals(payload.getStatus()) && book.getAvailableCopies() <= 0) {
            throw ApiException.badRequest("No available copies for this book");
        }

        LibraryIssue issue = new LibraryIssue();
        applyIssuePayload(issue, payload);

        if ("Issued".equals(payload.getStatus())) {
            book.setAvailableCopies(book.getAvailableCopies() - 1);
            bookRepository.save(book);
        }

        return serializeIssue(issueRepository.save(issue));
    }

    @PutMapping("/issues/{issueId}")
    public Map<String, Object> updateIssue(@PathVariable Long issueId, @Valid @RequestBody LibraryIssueCreate payload) {
        permissionService.requireRoles("Admin", "Principal", "Teacher");
        LibraryIssue issue = requireIssue(issueId);
        LibraryBook book = requireBook(payload.getBookId());
        requireStudent(payload.getStudentId());

        if ("Issued".equals(issue.getStatus()) && !"Issued".equals(payload.getStatus())) {
            book.setAvailableCopies(book.getAvailableCopies() + 1);
        } else if (!"Issued".equals(issue.getStatus()) && "Issued".equals(payload.getStatus())) {
            if (book.getAvailableCopies() <= 0) {
                throw ApiException.badRequest("No available copies for this book");
            }
            book.setAvailableCopies(book.getAvailableCopies() - 1);
        }
        bookRepository.save(book);

        applyIssuePayload(issue, payload);

        return serializeIssue(issueRepository.save(issue));
    }

    @DeleteMapping("/issues/{issueId}")
    public Map<String, String> deleteIssue(@PathVariable Long issueId) {
        permissionService.requireRoles("Admin");
        LibraryIssue issue = requireIssue(issueId);
        LibraryBook book = bookRepository.findById(issue.getBookId()).orElse(null);
        if (book != null && "Issued".equals(issue.getStatus())) {
            book.setAvailableCopies(book.getAvailableCopies() + 1);
            bookRepository.save(book);
        }
        issueRepository.delete(issue);
        return Map.of("message", "Book issue deleted successfully");
    }

    // ===================== helpers =====================

    private void applyBookPayload(LibraryBook book, LibraryBookCreate payload) {
        book.setAccessionNo(payload.getAccessionNo());
        book.setTitle(payload.getTitle());
        book.setAuthor(payload.getAuthor());
        book.setCategory(payload.getCategory());
        book.setPublisher(payload.getPublisher());
        book.setIsbn(payload.getIsbn());
        book.setTotalCopies(payload.getTotalCopies());
        book.setAvailableCopies(payload.getAvailableCopies());
        book.setShelfNo(payload.getShelfNo());
        book.setStatus(payload.getStatus());
        book.setRemarks(payload.getRemarks());
    }

    private void applyIssuePayload(LibraryIssue issue, LibraryIssueCreate payload) {
        issue.setBookId(payload.getBookId());
        issue.setStudentId(payload.getStudentId());
        issue.setIssueDate(payload.getIssueDate());
        issue.setDueDate(payload.getDueDate());
        issue.setReturnDate(payload.getReturnDate());
        issue.setStatus(payload.getStatus());
        issue.setFineAmount(payload.getFineAmount());
        issue.setRemarks(payload.getRemarks());
    }

    private void requireNoAccessionClash(String accessionNo, Long excludeId) {
        bookRepository.findByAccessionNo(accessionNo).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Accession number already exists");
            }
        });
    }

    private void requireStudent(Long id) {
        if (id == null || !studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }

    private LibraryBook requireBook(Long id) {
        return bookRepository.findById(id).orElseThrow(() -> ApiException.notFound("Book not found"));
    }

    private LibraryIssue requireIssue(Long id) {
        return issueRepository.findById(id).orElseThrow(() -> ApiException.notFound("Book issue not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serializeIssue(LibraryIssue issue) {
        LibraryBook book = bookRepository.findById(issue.getBookId()).orElse(null);
        Student student = studentRepository.findById(issue.getStudentId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", issue.getId());
        body.put("book_id", issue.getBookId());
        body.put("student_id", issue.getStudentId());
        body.put("issue_date", issue.getIssueDate());
        body.put("due_date", issue.getDueDate());
        body.put("return_date", issue.getReturnDate());
        body.put("status", issue.getStatus());
        body.put("fine_amount", issue.getFineAmount());
        body.put("remarks", issue.getRemarks());
        body.put("book_title", book != null ? book.getTitle() : "-");
        body.put("accession_no", book != null ? book.getAccessionNo() : null);
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("class_name", student != null ? student.getClassName() : null);
        body.put("section", student != null ? student.getSection() : null);
        return body;
    }
}
