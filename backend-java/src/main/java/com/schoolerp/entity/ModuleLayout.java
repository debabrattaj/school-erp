package com.schoolerp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "module_layouts")
public class ModuleLayout {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String moduleName;

    @Lob
    @Column(nullable = false)
    private String layoutJson;

    private Boolean isActive = true;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getModuleName() { return moduleName; }
    public void setModuleName(String v) { this.moduleName = v; }
    public String getLayoutJson() { return layoutJson; }
    public void setLayoutJson(String v) { this.layoutJson = v; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean v) { this.isActive = v; }
}
