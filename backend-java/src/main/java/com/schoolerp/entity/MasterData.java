package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "master_data")
public class MasterData {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String value;

    private boolean isActive = true;
    private Integer sortOrder = 0;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCategory() { return category; }
    public void setCategory(String v) { this.category = v; }
    public String getValue() { return value; }
    public void setValue(String v) { this.value = v; }
    @com.fasterxml.jackson.annotation.JsonProperty("is_active")
    public boolean isActive() { return isActive; }
    public void setActive(boolean v) { this.isActive = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { this.sortOrder = v; }
}
