package com.schoolerp.dto.hostel;

import jakarta.validation.constraints.NotBlank;

public class HostelBlockCreate {
    @NotBlank
    private String blockName;
    private String hostelType = "Boys";
    private String wardenName;
    private String wardenPhone;
    private Boolean isActive = true;
    private String remarks;

    public String getBlockName() { return blockName; }
    public void setBlockName(String v) { this.blockName = v; }
    public String getHostelType() { return hostelType; }
    public void setHostelType(String v) { this.hostelType = v; }
    public String getWardenName() { return wardenName; }
    public void setWardenName(String v) { this.wardenName = v; }
    public String getWardenPhone() { return wardenPhone; }
    public void setWardenPhone(String v) { this.wardenPhone = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
