package com.schoolerp.dto.inventory;

import jakarta.validation.constraints.NotBlank;

public class InventoryItemCreate {
    @NotBlank
    private String itemName;
    private String itemCode;
    private String category;
    private String unit = "pcs";
    private Double quantityAvailable = 0.0;
    private Double reorderLevel = 0.0;
    private Double unitPrice = 0.0;
    private String location;
    private String status = "Active";
    private String remarks;

    public String getItemName() { return itemName; }
    public void setItemName(String v) { this.itemName = v; }
    public String getItemCode() { return itemCode; }
    public void setItemCode(String v) { this.itemCode = v; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getUnit() { return unit; }
    public void setUnit(String v) { this.unit = v; }
    public Double getQuantityAvailable() { return quantityAvailable; }
    public void setQuantityAvailable(Double v) { this.quantityAvailable = v; }
    public Double getReorderLevel() { return reorderLevel; }
    public void setReorderLevel(Double v) { this.reorderLevel = v; }
    public Double getUnitPrice() { return unitPrice; }
    public void setUnitPrice(Double v) { this.unitPrice = v; }
    public String getLocation() { return location; }
    public void setLocation(String v) { this.location = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
