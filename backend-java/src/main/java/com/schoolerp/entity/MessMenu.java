package com.schoolerp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "mess_menus")
public class MessMenu {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate menuDate;

    @Column(nullable = false)
    private String mealType;

    @Lob
    @Column(nullable = false)
    private String menuItems;

    private String nutritionNotes;
    private String allergenNotes;
    private Boolean isPublished = true;
    private String remarks;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public LocalDate getMenuDate() { return menuDate; }
    public void setMenuDate(LocalDate v) { this.menuDate = v; }
    public String getMealType() { return mealType; }
    public void setMealType(String v) { this.mealType = v; }
    public String getMenuItems() { return menuItems; }
    public void setMenuItems(String v) { this.menuItems = v; }
    public String getNutritionNotes() { return nutritionNotes; }
    public void setNutritionNotes(String v) { this.nutritionNotes = v; }
    public String getAllergenNotes() { return allergenNotes; }
    public void setAllergenNotes(String v) { this.allergenNotes = v; }
    public Boolean getIsPublished() { return isPublished; }
    public void setIsPublished(Boolean v) { this.isPublished = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
