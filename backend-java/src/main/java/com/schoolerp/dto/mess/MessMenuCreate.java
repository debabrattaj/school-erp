package com.schoolerp.dto.mess;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class MessMenuCreate {
    @NotNull
    private LocalDate menuDate;
    @NotBlank
    private String mealType;
    @NotBlank
    private String menuItems;
    private String nutritionNotes;
    private String allergenNotes;
    private Boolean isPublished = true;
    private String remarks;

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
}
