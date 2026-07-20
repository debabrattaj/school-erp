package com.schoolerp.dto.hostel;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class HostelRoomCreate {
    @NotNull
    private Long blockId;
    @NotBlank
    private String roomNo;
    private String floor;
    private Integer capacity = 1;
    private Boolean isActive = true;
    private String remarks;

    public Long getBlockId() { return blockId; }
    public void setBlockId(Long v) { this.blockId = v; }
    public String getRoomNo() { return roomNo; }
    public void setRoomNo(String v) { this.roomNo = v; }
    public String getFloor() { return floor; }
    public void setFloor(String v) { this.floor = v; }
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer v) { this.capacity = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }
}
