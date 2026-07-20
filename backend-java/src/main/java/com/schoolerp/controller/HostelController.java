package com.schoolerp.controller;

import com.schoolerp.dto.hostel.HostelAllocationCreate;
import com.schoolerp.dto.hostel.HostelBlockCreate;
import com.schoolerp.dto.hostel.HostelRoomCreate;
import com.schoolerp.entity.HostelAllocation;
import com.schoolerp.entity.HostelBlock;
import com.schoolerp.entity.HostelRoom;
import com.schoolerp.entity.Student;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.HostelAllocationRepository;
import com.schoolerp.repository.HostelBlockRepository;
import com.schoolerp.repository.HostelRoomRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/hostel.py. */
@RestController
@RequestMapping("/hostel")
public class HostelController {

    private final HostelBlockRepository blockRepository;
    private final HostelRoomRepository roomRepository;
    private final HostelAllocationRepository allocationRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public HostelController(
            HostelBlockRepository blockRepository,
            HostelRoomRepository roomRepository,
            HostelAllocationRepository allocationRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.blockRepository = blockRepository;
        this.roomRepository = roomRepository;
        this.allocationRepository = allocationRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    // ===================== blocks =====================

    @GetMapping("/blocks/")
    public List<HostelBlock> getBlocks() {
        permissionService.requireRoles("Admin", "Principal");
        return blockRepository.findAll().stream()
                .sorted(Comparator.comparing(HostelBlock::getId).reversed())
                .toList();
    }

    @PostMapping("/blocks/")
    public HostelBlock createBlock(@Valid @RequestBody HostelBlockCreate payload) {
        permissionService.requireRoles("Admin");
        requireNoBlockNameClash(payload.getBlockName(), null);

        HostelBlock block = new HostelBlock();
        applyBlockPayload(block, payload);

        return blockRepository.save(block);
    }

    @PutMapping("/blocks/{blockId}")
    public HostelBlock updateBlock(@PathVariable Long blockId, @Valid @RequestBody HostelBlockCreate payload) {
        permissionService.requireRoles("Admin");
        HostelBlock block = requireBlock(blockId);
        requireNoBlockNameClash(payload.getBlockName(), blockId);

        applyBlockPayload(block, payload);

        return blockRepository.save(block);
    }

    @DeleteMapping("/blocks/{blockId}")
    public Map<String, String> deleteBlock(@PathVariable Long blockId) {
        permissionService.requireRoles("Admin");
        HostelBlock block = requireBlock(blockId);
        blockRepository.delete(block);
        return Map.of("message", "Hostel block deleted successfully");
    }

    // ===================== rooms =====================

    @GetMapping("/rooms/")
    public List<Map<String, Object>> getRooms(@RequestParam(name = "block_id", required = false) Long blockId) {
        permissionService.requireRoles("Admin", "Principal");
        return roomRepository.findAll().stream()
                .filter(r -> blockId == null || blockId.equals(r.getBlockId()))
                .sorted(Comparator.comparing(HostelRoom::getId).reversed())
                .map(this::serializeRoom)
                .toList();
    }

    @PostMapping("/rooms/")
    public Map<String, Object> createRoom(@Valid @RequestBody HostelRoomCreate payload) {
        permissionService.requireRoles("Admin");
        requireBlock(payload.getBlockId());
        if (payload.getCapacity() == null || payload.getCapacity() <= 0) {
            throw ApiException.badRequest("Room capacity must be greater than 0");
        }
        requireNoRoomClash(payload.getBlockId(), payload.getRoomNo(), null);

        HostelRoom room = new HostelRoom();
        applyRoomPayload(room, payload);

        return serializeRoom(roomRepository.save(room));
    }

    @PutMapping("/rooms/{roomId}")
    public Map<String, Object> updateRoom(@PathVariable Long roomId, @Valid @RequestBody HostelRoomCreate payload) {
        permissionService.requireRoles("Admin");
        HostelRoom room = requireRoom(roomId);
        requireBlock(payload.getBlockId());

        long occupied = allocationRepository.findByRoomIdAndStatus(roomId, "Active").size();
        if (payload.getCapacity() == null || payload.getCapacity() < occupied) {
            throw ApiException.badRequest("Room capacity cannot be less than active allocations");
        }

        requireNoRoomClash(payload.getBlockId(), payload.getRoomNo(), roomId);

        applyRoomPayload(room, payload);

        return serializeRoom(roomRepository.save(room));
    }

    @DeleteMapping("/rooms/{roomId}")
    public Map<String, String> deleteRoom(@PathVariable Long roomId) {
        permissionService.requireRoles("Admin");
        HostelRoom room = requireRoom(roomId);
        roomRepository.delete(room);
        return Map.of("message", "Hostel room deleted successfully");
    }

    // ===================== allocations =====================

    @GetMapping("/allocations/")
    public List<Map<String, Object>> getAllocations(@RequestParam(required = false) String status) {
        permissionService.requireRoles("Admin", "Principal");
        return allocationRepository.findAll().stream()
                .filter(a -> status == null || status.equals(a.getStatus()))
                .sorted(Comparator.comparing(HostelAllocation::getId).reversed())
                .map(this::serializeAllocation)
                .toList();
    }

    @PostMapping("/allocations/")
    public Map<String, Object> createAllocation(@Valid @RequestBody HostelAllocationCreate payload) {
        permissionService.requireRoles("Admin");
        requireStudent(payload.getStudentId());
        HostelRoom room = requireRoom(payload.getRoomId());

        if ("Active".equals(payload.getStatus())) {
            boolean studentHasActive = !allocationRepository.findByStudentIdAndStatus(payload.getStudentId(), "Active").isEmpty();
            if (studentHasActive) {
                throw ApiException.badRequest("Student already has an active hostel allocation");
            }
            long occupied = allocationRepository.findByRoomIdAndStatus(payload.getRoomId(), "Active").size();
            if (occupied >= room.getCapacity()) {
                throw ApiException.badRequest("Selected room is full");
            }
        }

        requireNoBedClash(payload.getRoomId(), payload.getBedNo(), payload.getStatus(), null);

        HostelAllocation allocation = new HostelAllocation();
        applyAllocationPayload(allocation, payload);

        return serializeAllocation(allocationRepository.save(allocation));
    }

    @PutMapping("/allocations/{allocationId}")
    public Map<String, Object> updateAllocation(@PathVariable Long allocationId, @Valid @RequestBody HostelAllocationCreate payload) {
        permissionService.requireRoles("Admin");
        HostelAllocation allocation = requireAllocation(allocationId);
        requireStudent(payload.getStudentId());
        HostelRoom room = requireRoom(payload.getRoomId());

        if ("Active".equals(payload.getStatus())) {
            boolean studentHasActive = allocationRepository.findByStudentIdAndStatus(payload.getStudentId(), "Active").stream()
                    .anyMatch(a -> !a.getId().equals(allocationId));
            if (studentHasActive) {
                throw ApiException.badRequest("Student already has an active hostel allocation");
            }
            long occupied = allocationRepository.findByRoomIdAndStatus(payload.getRoomId(), "Active").stream()
                    .filter(a -> !a.getId().equals(allocationId))
                    .count();
            if (occupied >= room.getCapacity()) {
                throw ApiException.badRequest("Selected room is full");
            }
        }

        requireNoBedClash(payload.getRoomId(), payload.getBedNo(), payload.getStatus(), allocationId);

        applyAllocationPayload(allocation, payload);

        return serializeAllocation(allocationRepository.save(allocation));
    }

    @DeleteMapping("/allocations/{allocationId}")
    public Map<String, String> deleteAllocation(@PathVariable Long allocationId) {
        permissionService.requireRoles("Admin");
        HostelAllocation allocation = requireAllocation(allocationId);
        allocationRepository.delete(allocation);
        return Map.of("message", "Hostel allocation deleted successfully");
    }

    // ===================== helpers =====================

    private void applyBlockPayload(HostelBlock block, HostelBlockCreate payload) {
        block.setBlockName(payload.getBlockName());
        block.setHostelType(payload.getHostelType());
        block.setWardenName(payload.getWardenName());
        block.setWardenPhone(payload.getWardenPhone());
        block.setIsActive(payload.getIsActive());
        block.setRemarks(payload.getRemarks());
    }

    private void applyRoomPayload(HostelRoom room, HostelRoomCreate payload) {
        room.setBlockId(payload.getBlockId());
        room.setRoomNo(payload.getRoomNo());
        room.setFloor(payload.getFloor());
        room.setCapacity(payload.getCapacity());
        room.setIsActive(payload.getIsActive());
        room.setRemarks(payload.getRemarks());
    }

    private void applyAllocationPayload(HostelAllocation allocation, HostelAllocationCreate payload) {
        allocation.setStudentId(payload.getStudentId());
        allocation.setRoomId(payload.getRoomId());
        allocation.setBedNo(payload.getBedNo());
        allocation.setStartDate(payload.getStartDate());
        allocation.setEndDate(payload.getEndDate());
        allocation.setStatus(payload.getStatus());
        allocation.setRemarks(payload.getRemarks());
    }

    private void requireNoBlockNameClash(String blockName, Long excludeId) {
        blockRepository.findByBlockName(blockName).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Hostel block with this name already exists");
            }
        });
    }

    private void requireNoRoomClash(Long blockId, String roomNo, Long excludeId) {
        roomRepository.findByBlockIdAndRoomNo(blockId, roomNo).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Room already exists in this hostel block");
            }
        });
    }

    private void requireNoBedClash(Long roomId, String bedNo, String status, Long excludeId) {
        allocationRepository.findByRoomIdAndBedNoAndStatus(roomId, bedNo, status).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("This bed is already allocated");
            }
        });
    }

    private void requireStudent(Long id) {
        if (id == null || !studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }

    private HostelBlock requireBlock(Long id) {
        return blockRepository.findById(id).orElseThrow(() -> ApiException.notFound("Hostel block not found"));
    }

    private HostelRoom requireRoom(Long id) {
        return roomRepository.findById(id).orElseThrow(() -> ApiException.notFound("Hostel room not found"));
    }

    private HostelAllocation requireAllocation(Long id) {
        return allocationRepository.findById(id).orElseThrow(() -> ApiException.notFound("Hostel allocation not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serializeRoom(HostelRoom room) {
        HostelBlock block = blockRepository.findById(room.getBlockId()).orElse(null);
        long occupied = allocationRepository.findByRoomIdAndStatus(room.getId(), "Active").size();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", room.getId());
        body.put("block_id", room.getBlockId());
        body.put("room_no", room.getRoomNo());
        body.put("floor", room.getFloor());
        body.put("capacity", room.getCapacity());
        body.put("is_active", room.getIsActive());
        body.put("remarks", room.getRemarks());
        body.put("block_name", block != null ? block.getBlockName() : "-");
        body.put("occupied_beds", (int) occupied);
        body.put("available_beds", Math.max((room.getCapacity() != null ? room.getCapacity() : 0) - (int) occupied, 0));
        return body;
    }

    private Map<String, Object> serializeAllocation(HostelAllocation allocation) {
        Student student = studentRepository.findById(allocation.getStudentId()).orElse(null);
        HostelRoom room = roomRepository.findById(allocation.getRoomId()).orElse(null);
        HostelBlock block = room != null ? blockRepository.findById(room.getBlockId()).orElse(null) : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", allocation.getId());
        body.put("student_id", allocation.getStudentId());
        body.put("room_id", allocation.getRoomId());
        body.put("bed_no", allocation.getBedNo());
        body.put("start_date", allocation.getStartDate());
        body.put("end_date", allocation.getEndDate());
        body.put("status", allocation.getStatus());
        body.put("remarks", allocation.getRemarks());
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("room_no", room != null ? room.getRoomNo() : "-");
        body.put("block_name", block != null ? block.getBlockName() : "-");
        return body;
    }
}
