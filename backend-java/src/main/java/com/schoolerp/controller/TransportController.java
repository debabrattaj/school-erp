package com.schoolerp.controller;

import com.schoolerp.dto.transport.TransportAssignmentCreate;
import com.schoolerp.dto.transport.TransportRouteCreate;
import com.schoolerp.dto.transport.TransportStopCreate;
import com.schoolerp.dto.transport.TransportVehicleCreate;
import com.schoolerp.entity.*;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.*;
import com.schoolerp.security.PermissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/transport.py. */
@RestController
@RequestMapping("/transport")
public class TransportController {

    private final TransportRouteRepository routeRepository;
    private final TransportVehicleRepository vehicleRepository;
    private final TransportStopRepository stopRepository;
    private final TransportAssignmentRepository assignmentRepository;
    private final StudentRepository studentRepository;
    private final PermissionService permissionService;

    public TransportController(
            TransportRouteRepository routeRepository,
            TransportVehicleRepository vehicleRepository,
            TransportStopRepository stopRepository,
            TransportAssignmentRepository assignmentRepository,
            StudentRepository studentRepository,
            PermissionService permissionService
    ) {
        this.routeRepository = routeRepository;
        this.vehicleRepository = vehicleRepository;
        this.stopRepository = stopRepository;
        this.assignmentRepository = assignmentRepository;
        this.studentRepository = studentRepository;
        this.permissionService = permissionService;
    }

    // ===================== routes =====================

    @GetMapping("/routes/")
    public List<TransportRoute> getRoutes() {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return routeRepository.findAll().stream()
                .sorted(Comparator.comparing(TransportRoute::getId).reversed())
                .toList();
    }

    @PostMapping("/routes/")
    public TransportRoute createRoute(@Valid @RequestBody TransportRouteCreate payload) {
        permissionService.requireRoles("Admin");
        requireNoRouteNameClash(payload.getRouteName(), null);

        TransportRoute route = new TransportRoute();
        applyRoutePayload(route, payload);

        return routeRepository.save(route);
    }

    @PutMapping("/routes/{routeId}")
    public TransportRoute updateRoute(@PathVariable Long routeId, @Valid @RequestBody TransportRouteCreate payload) {
        permissionService.requireRoles("Admin");
        TransportRoute route = requireRoute(routeId);
        requireNoRouteNameClash(payload.getRouteName(), routeId);

        applyRoutePayload(route, payload);

        return routeRepository.save(route);
    }

    @DeleteMapping("/routes/{routeId}")
    public Map<String, String> deleteRoute(@PathVariable Long routeId) {
        permissionService.requireRoles("Admin");
        TransportRoute route = requireRoute(routeId);
        routeRepository.delete(route);
        return Map.of("message", "Transport route deleted successfully");
    }

    // ===================== vehicles =====================

    @GetMapping("/vehicles/")
    public List<Map<String, Object>> getVehicles(@RequestParam(name = "route_id", required = false) Long routeId) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return vehicleRepository.findAll().stream()
                .filter(v -> routeId == null || routeId.equals(v.getRouteId()))
                .sorted(Comparator.comparing(TransportVehicle::getId).reversed())
                .map(this::serializeVehicle)
                .toList();
    }

    @PostMapping("/vehicles/")
    public Map<String, Object> createVehicle(@Valid @RequestBody TransportVehicleCreate payload) {
        permissionService.requireRoles("Admin");
        if (payload.getRouteId() != null) {
            requireRoute(payload.getRouteId());
        }
        if (payload.getCapacity() == null || payload.getCapacity() <= 0) {
            throw ApiException.badRequest("Vehicle capacity must be greater than 0");
        }
        requireNoVehicleNoClash(payload.getVehicleNo(), null);

        TransportVehicle vehicle = new TransportVehicle();
        applyVehiclePayload(vehicle, payload);

        return serializeVehicle(vehicleRepository.save(vehicle));
    }

    @PutMapping("/vehicles/{vehicleId}")
    public Map<String, Object> updateVehicle(@PathVariable Long vehicleId, @Valid @RequestBody TransportVehicleCreate payload) {
        permissionService.requireRoles("Admin");
        TransportVehicle vehicle = requireVehicle(vehicleId);
        if (payload.getRouteId() != null) {
            requireRoute(payload.getRouteId());
        }

        long assigned = assignmentRepository.findByVehicleIdAndStatus(vehicleId, "Active").size();
        if (payload.getCapacity() == null || payload.getCapacity() < assigned) {
            throw ApiException.badRequest("Vehicle capacity cannot be less than active assignments");
        }

        requireNoVehicleNoClash(payload.getVehicleNo(), vehicleId);

        applyVehiclePayload(vehicle, payload);

        return serializeVehicle(vehicleRepository.save(vehicle));
    }

    @DeleteMapping("/vehicles/{vehicleId}")
    public Map<String, String> deleteVehicle(@PathVariable Long vehicleId) {
        permissionService.requireRoles("Admin");
        TransportVehicle vehicle = requireVehicle(vehicleId);
        vehicleRepository.delete(vehicle);
        return Map.of("message", "Vehicle deleted successfully");
    }

    // ===================== stops =====================

    @GetMapping("/stops/")
    public List<Map<String, Object>> getStops(@RequestParam(name = "route_id", required = false) Long routeId) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return stopRepository.findAll().stream()
                .filter(s -> routeId == null || routeId.equals(s.getRouteId()))
                .sorted(Comparator.comparing(TransportStop::getSortOrder)
                        .thenComparing(Comparator.comparing(TransportStop::getId).reversed()))
                .map(this::serializeStop)
                .toList();
    }

    @PostMapping("/stops/")
    public Map<String, Object> createStop(@Valid @RequestBody TransportStopCreate payload) {
        permissionService.requireRoles("Admin");
        requireRoute(payload.getRouteId());
        requireNoStopNameClash(payload.getRouteId(), payload.getStopName(), null);

        TransportStop stop = new TransportStop();
        applyStopPayload(stop, payload);

        return serializeStop(stopRepository.save(stop));
    }

    @PutMapping("/stops/{stopId}")
    public Map<String, Object> updateStop(@PathVariable Long stopId, @Valid @RequestBody TransportStopCreate payload) {
        permissionService.requireRoles("Admin");
        TransportStop stop = requireStop(stopId);
        requireRoute(payload.getRouteId());
        requireNoStopNameClash(payload.getRouteId(), payload.getStopName(), stopId);

        applyStopPayload(stop, payload);

        return serializeStop(stopRepository.save(stop));
    }

    @DeleteMapping("/stops/{stopId}")
    public Map<String, String> deleteStop(@PathVariable Long stopId) {
        permissionService.requireRoles("Admin");
        TransportStop stop = requireStop(stopId);
        stopRepository.delete(stop);
        return Map.of("message", "Pickup point deleted successfully");
    }

    // ===================== assignments =====================

    @GetMapping("/assignments/")
    public List<Map<String, Object>> getAssignments(@RequestParam(required = false) String status) {
        permissionService.requireRoles("Admin", "Principal", "Accounts");
        return assignmentRepository.findAll().stream()
                .filter(a -> status == null || status.equals(a.getStatus()))
                .sorted(Comparator.comparing(TransportAssignment::getId).reversed())
                .map(this::serializeAssignment)
                .toList();
    }

    @PostMapping("/assignments/")
    public Map<String, Object> createAssignment(@Valid @RequestBody TransportAssignmentCreate payload) {
        permissionService.requireRoles("Admin");
        validateAssignmentPayload(payload, null);

        TransportAssignment assignment = new TransportAssignment();
        applyAssignmentPayload(assignment, payload);

        return serializeAssignment(assignmentRepository.save(assignment));
    }

    @PutMapping("/assignments/{assignmentId}")
    public Map<String, Object> updateAssignment(@PathVariable Long assignmentId, @Valid @RequestBody TransportAssignmentCreate payload) {
        permissionService.requireRoles("Admin");
        TransportAssignment assignment = requireAssignment(assignmentId);
        validateAssignmentPayload(payload, assignmentId);

        applyAssignmentPayload(assignment, payload);

        return serializeAssignment(assignmentRepository.save(assignment));
    }

    @DeleteMapping("/assignments/{assignmentId}")
    public Map<String, String> deleteAssignment(@PathVariable Long assignmentId) {
        permissionService.requireRoles("Admin");
        TransportAssignment assignment = requireAssignment(assignmentId);
        assignmentRepository.delete(assignment);
        return Map.of("message", "Transport assignment deleted successfully");
    }

    // ===================== helpers =====================

    private void validateAssignmentPayload(TransportAssignmentCreate payload, Long assignmentId) {
        requireStudent(payload.getStudentId());
        requireRoute(payload.getRouteId());

        TransportVehicle vehicle = null;
        if (payload.getVehicleId() != null) {
            vehicle = requireVehicle(payload.getVehicleId());
            if (vehicle.getRouteId() != null && !vehicle.getRouteId().equals(payload.getRouteId())) {
                throw ApiException.badRequest("Selected vehicle is assigned to a different route");
            }
        }

        if (payload.getStopId() != null) {
            TransportStop stop = requireStop(payload.getStopId());
            if (!stop.getRouteId().equals(payload.getRouteId())) {
                throw ApiException.badRequest("Selected pickup point does not belong to this route");
            }
        }

        if ("Active".equals(payload.getStatus())) {
            boolean studentHasActive = assignmentRepository.findByStudentIdAndStatus(payload.getStudentId(), "Active").stream()
                    .anyMatch(a -> assignmentId == null || !a.getId().equals(assignmentId));
            if (studentHasActive) {
                throw ApiException.badRequest("Student already has an active transport assignment");
            }

            if (vehicle != null) {
                long assigned = assignmentRepository.findByVehicleIdAndStatus(vehicle.getId(), "Active").stream()
                        .filter(a -> assignmentId == null || !a.getId().equals(assignmentId))
                        .count();
                if (assigned >= vehicle.getCapacity()) {
                    throw ApiException.badRequest("Selected vehicle is full");
                }
            }
        }
    }

    private void applyRoutePayload(TransportRoute route, TransportRouteCreate payload) {
        route.setRouteName(payload.getRouteName());
        route.setStartPoint(payload.getStartPoint());
        route.setEndPoint(payload.getEndPoint());
        route.setMonthlyFee(payload.getMonthlyFee());
        route.setIsActive(payload.getIsActive());
        route.setRemarks(payload.getRemarks());
    }

    private void applyVehiclePayload(TransportVehicle vehicle, TransportVehicleCreate payload) {
        vehicle.setVehicleNo(payload.getVehicleNo());
        vehicle.setRouteId(payload.getRouteId());
        vehicle.setVehicleType(payload.getVehicleType());
        vehicle.setCapacity(payload.getCapacity());
        vehicle.setDriverName(payload.getDriverName());
        vehicle.setDriverPhone(payload.getDriverPhone());
        vehicle.setAttendantName(payload.getAttendantName());
        vehicle.setIsActive(payload.getIsActive());
        vehicle.setRemarks(payload.getRemarks());
    }

    private void applyStopPayload(TransportStop stop, TransportStopCreate payload) {
        stop.setRouteId(payload.getRouteId());
        stop.setStopName(payload.getStopName());
        stop.setPickupTime(payload.getPickupTime());
        stop.setDropTime(payload.getDropTime());
        stop.setSortOrder(payload.getSortOrder());
        stop.setIsActive(payload.getIsActive());
        stop.setRemarks(payload.getRemarks());
    }

    private void applyAssignmentPayload(TransportAssignment assignment, TransportAssignmentCreate payload) {
        assignment.setStudentId(payload.getStudentId());
        assignment.setRouteId(payload.getRouteId());
        assignment.setVehicleId(payload.getVehicleId());
        assignment.setStopId(payload.getStopId());
        assignment.setStartDate(payload.getStartDate());
        assignment.setEndDate(payload.getEndDate());
        assignment.setStatus(payload.getStatus());
        assignment.setRemarks(payload.getRemarks());
    }

    private void requireNoRouteNameClash(String routeName, Long excludeId) {
        routeRepository.findByRouteName(routeName).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Transport route with this name already exists");
            }
        });
    }

    private void requireNoVehicleNoClash(String vehicleNo, Long excludeId) {
        vehicleRepository.findByVehicleNo(vehicleNo).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Vehicle with this number already exists");
            }
        });
    }

    private void requireNoStopNameClash(Long routeId, String stopName, Long excludeId) {
        stopRepository.findByRouteIdAndStopName(routeId, stopName).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw ApiException.badRequest("Pickup point already exists on this route");
            }
        });
    }

    private void requireStudent(Long id) {
        if (id == null || !studentRepository.existsById(id)) {
            throw ApiException.notFound("Student not found");
        }
    }

    private TransportRoute requireRoute(Long id) {
        return routeRepository.findById(id).orElseThrow(() -> ApiException.notFound("Transport route not found"));
    }

    private TransportVehicle requireVehicle(Long id) {
        return vehicleRepository.findById(id).orElseThrow(() -> ApiException.notFound("Vehicle not found"));
    }

    private TransportStop requireStop(Long id) {
        return stopRepository.findById(id).orElseThrow(() -> ApiException.notFound("Pickup point not found"));
    }

    private TransportAssignment requireAssignment(Long id) {
        return assignmentRepository.findById(id).orElseThrow(() -> ApiException.notFound("Transport assignment not found"));
    }

    private String studentName(Student student) {
        String name = ((student.getFirstName() != null ? student.getFirstName() : "") + " "
                + (student.getLastName() != null ? student.getLastName() : "")).trim();
        return name.isEmpty() ? "Student ID: " + student.getId() : name;
    }

    private Map<String, Object> serializeVehicle(TransportVehicle vehicle) {
        TransportRoute route = vehicle.getRouteId() != null
                ? routeRepository.findById(vehicle.getRouteId()).orElse(null)
                : null;
        long assigned = assignmentRepository.findByVehicleIdAndStatus(vehicle.getId(), "Active").size();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", vehicle.getId());
        body.put("vehicle_no", vehicle.getVehicleNo());
        body.put("route_id", vehicle.getRouteId());
        body.put("vehicle_type", vehicle.getVehicleType());
        body.put("capacity", vehicle.getCapacity());
        body.put("driver_name", vehicle.getDriverName());
        body.put("driver_phone", vehicle.getDriverPhone());
        body.put("attendant_name", vehicle.getAttendantName());
        body.put("is_active", vehicle.getIsActive());
        body.put("remarks", vehicle.getRemarks());
        body.put("route_name", route != null ? route.getRouteName() : "-");
        body.put("assigned_students", (int) assigned);
        body.put("available_seats", Math.max((vehicle.getCapacity() != null ? vehicle.getCapacity() : 0) - (int) assigned, 0));
        return body;
    }

    private Map<String, Object> serializeStop(TransportStop stop) {
        TransportRoute route = routeRepository.findById(stop.getRouteId()).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", stop.getId());
        body.put("route_id", stop.getRouteId());
        body.put("stop_name", stop.getStopName());
        body.put("pickup_time", stop.getPickupTime());
        body.put("drop_time", stop.getDropTime());
        body.put("sort_order", stop.getSortOrder());
        body.put("is_active", stop.getIsActive());
        body.put("remarks", stop.getRemarks());
        body.put("route_name", route != null ? route.getRouteName() : "-");
        return body;
    }

    private Map<String, Object> serializeAssignment(TransportAssignment assignment) {
        Student student = studentRepository.findById(assignment.getStudentId()).orElse(null);
        TransportRoute route = routeRepository.findById(assignment.getRouteId()).orElse(null);
        TransportVehicle vehicle = assignment.getVehicleId() != null
                ? vehicleRepository.findById(assignment.getVehicleId()).orElse(null)
                : null;
        TransportStop stop = assignment.getStopId() != null
                ? stopRepository.findById(assignment.getStopId()).orElse(null)
                : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", assignment.getId());
        body.put("student_id", assignment.getStudentId());
        body.put("route_id", assignment.getRouteId());
        body.put("vehicle_id", assignment.getVehicleId());
        body.put("stop_id", assignment.getStopId());
        body.put("start_date", assignment.getStartDate());
        body.put("end_date", assignment.getEndDate());
        body.put("status", assignment.getStatus());
        body.put("remarks", assignment.getRemarks());
        body.put("student_name", student != null ? studentName(student) : "-");
        body.put("admission_no", student != null ? student.getAdmissionNo() : null);
        body.put("route_name", route != null ? route.getRouteName() : "-");
        body.put("vehicle_no", vehicle != null ? vehicle.getVehicleNo() : "-");
        body.put("stop_name", stop != null ? stop.getStopName() : "-");
        return body;
    }
}
