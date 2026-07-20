package com.schoolerp.dto.library;

import jakarta.validation.constraints.NotBlank;

public class LibraryBookCreate {
    @NotBlank
    private String accessionNo;
    @NotBlank
    private String title;
    private String author;
    private String category;
    private String publisher;
    private String isbn;
    private Integer totalCopies = 1;
    private Integer availableCopies = 1;
    private String shelfNo;
    private String status = "Available";
    private String remarks;

    public String getAccessionNo() { return accessionNo; }
    public void setAccessionNo(String v) { this.accessionNo = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { this.title = v; }
    public String getAuthor() { return author; }
    public void setAuthor(String v) { this.author = v; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getPublisher() { return publisher; }
    public void setPublisher(String v) { this.publisher = v; }
    public String getIsbn() { return isbn; }
    public void setIsbn(String v) { this.isbn = v; }
    public Integer getTotalCopies() { return totalCopies; }
    public void setTotalCopies(Integer v) { this.totalCopies = v; }
    public Integer getAvailableCopies() { return availableCopies; }
    public void setAvailableCopies(Integer v) { this.availableCopies = v; }
    public String getShelfNo() { return shelfNo; }
    public void setShelfNo(String v) { this.shelfNo = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
