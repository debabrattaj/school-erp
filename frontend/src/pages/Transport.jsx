import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Bus,
  Edit,
  MapPin,
  PlusCircle,
  Trash2,
  Upload,
  UserCheck,
  Navigation,
  Radio,
  AlertTriangle,
  Play,
  Square,
  XCircle,
  Copy,
  RotateCw,
  Settings2,
  X,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import BulkImportModal from "../components/BulkImportModal";
import { getMasterValues } from "../services/masterDataService";
import { hasAccess } from "../auth";
import { todayLocalDate } from "../utils/date";

const emptyRouteForm = {
  route_name: "",
  start_point: "",
  end_point: "",
  monthly_fee: 0,
  is_active: true,
  remarks: "",
};

const emptyVehicleForm = {
  vehicle_no: "",
  route_id: "",
  vehicle_type: "Bus",
  capacity: 1,
  driver_name: "",
  driver_phone: "",
  attendant_name: "",
  is_active: true,
  remarks: "",
};

const emptyStopForm = {
  route_id: "",
  stop_name: "",
  pickup_time: "",
  drop_time: "",
  sort_order: 0,
  is_active: true,
  remarks: "",
};

const emptyAssignmentForm = {
  student_id: "",
  route_id: "",
  vehicle_id: "",
  stop_id: "",
  start_date: "",
  end_date: "",
  status: "Active",
  remarks: "",
};

const emptyTripForm = {
  vehicle_id: "",
  route_id: "",
  trip_date: "",
  direction: "Pickup",
  driver_name: "",
  driver_phone: "",
  remarks: "",
};

const emptyDeviceForm = {
  device_uid: "",
  label: "",
  vendor: "",
  model: "",
  vehicle_id: "",
  notes: "",
};

const emptyTrackingConfigForm = {
  geofence_radius_m: "",
  over_speed_kmph: "",
  stale_after_minutes: "",
  retain_locations_days: "",
};

function vehicleStatusIcon(status) {
  const color = status === "live" ? "#16a34a" : status === "stale" ? "#f59e0b" : "#94a3b8";
  return L.divIcon({
    className: "vehicle-marker",
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

function positionStatusClass(status) {
  if (status === "live") return "status active";
  if (status === "stale") return "status warning";
  return "status danger"; // no_data
}

function tripStatusClass(status) {
  const text = String(status || "").toLowerCase();
  if (text === "running") return "status active";
  if (text === "completed") return "status pending";
  if (text === "cancelled") return "status danger";
  return "status warning"; // Scheduled
}

function alertSeverityClass(severity) {
  const text = String(severity || "").toLowerCase();
  if (text === "critical") return "status danger";
  if (text === "warning") return "status warning";
  return "status pending"; // Info
}

function formatDateTime(value) {
  if (!value) return "-";
  const iso = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function getStudentName(student) {
  if (!student) return "-";

  const name =
    student.student_name ||
    student.name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unknown Student";

  return student.admission_no ? `${student.admission_no} - ${name}` : name;
}

export default function Transport() {
  const [activeTab, setActiveTab] = useState("routes");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [stops, setStops] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [routeNameOptions, setRouteNameOptions] = useState([]);

  const [routeForm, setRouteForm] = useState(emptyRouteForm);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [stopForm, setStopForm] = useState(emptyStopForm);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [editing, setEditing] = useState({ type: "", id: null });
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const canManageTracking = hasAccess(["Admin", "Principal", "Accounts"], "manage");

  const [livePositions, setLivePositions] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const mapRef = useRef(null);

  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripDateFilter, setTripDateFilter] = useState(todayLocalDate());
  const [tripForm, setTripForm] = useState(emptyTripForm);
  const [tripStopsDrawer, setTripStopsDrawer] = useState(null);
  const [tripStops, setTripStops] = useState([]);

  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [silentDevices, setSilentDevices] = useState([]);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [revealedToken, setRevealedToken] = useState(null);
  const [trackingConfigForm, setTrackingConfigForm] = useState(emptyTrackingConfigForm);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertDateFilter, setAlertDateFilter] = useState(todayLocalDate());
  const [alertTypeFilter, setAlertTypeFilter] = useState("");
  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      const [routeResponse, vehicleResponse, stopResponse, assignmentResponse, studentResponse, routeNameResponse] =
        await Promise.all([
          API.get("/transport/routes/"),
          API.get("/transport/vehicles/"),
          API.get("/transport/stops/"),
          API.get("/transport/assignments/"),
          API.get("/students/"),
          getMasterValues("TransportRoute"),
        ]);

      setRoutes(routeResponse.data || []);
      setVehicles(vehicleResponse.data || []);
      setStops(stopResponse.data || []);
      setAssignments(assignmentResponse.data || []);
      setStudents(studentResponse.data || []);
      setRouteNameOptions(routeNameResponse || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load transport data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  async function loadLivePositions() {
    try {
      setLiveLoading(true);
      const response = await API.get("/transport-tracking/live");
      setLivePositions(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load live positions."));
    } finally {
      setLiveLoading(false);
    }
  }

  async function loadTrips() {
    try {
      setTripsLoading(true);
      const response = await API.get("/transport-tracking/trips", {
        params: { on_date: tripDateFilter || undefined },
      });
      setTrips(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load trips."));
    } finally {
      setTripsLoading(false);
    }
  }

  async function loadDevices() {
    try {
      setDevicesLoading(true);
      const [deviceResponse, silentResponse] = await Promise.all([
        API.get("/transport-tracking/devices"),
        API.get("/transport-tracking/devices/silent"),
      ]);
      setDevices(deviceResponse.data || []);
      setSilentDevices(silentResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load trackers."));
    } finally {
      setDevicesLoading(false);
    }
  }

  async function loadTrackingConfig() {
    try {
      const response = await API.get("/transport-tracking/config");
      setTrackingConfigForm({
        geofence_radius_m: String(response.data.geofence_radius_m ?? ""),
        over_speed_kmph: String(response.data.over_speed_kmph ?? ""),
        stale_after_minutes: String(response.data.stale_after_minutes ?? ""),
        retain_locations_days: String(response.data.retain_locations_days ?? ""),
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function loadAlerts() {
    try {
      setAlertsLoading(true);
      const response = await API.get("/transport-tracking/alerts", {
        params: {
          on_date: alertDateFilter || undefined,
          alert_type: alertTypeFilter || undefined,
          unacknowledged_only: unacknowledgedOnly || undefined,
        },
      });
      setAlerts(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load alerts."));
    } finally {
      setAlertsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "live") return undefined;
    loadLivePositions();
    const interval = window.setInterval(loadLivePositions, 20000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "trips") return;
    loadTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tripDateFilter]);

  useEffect(() => {
    if (activeTab !== "devices") return;
    loadDevices();
    loadTrackingConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "alerts") return;
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, alertDateFilter, alertTypeFilter, unacknowledgedOnly]);

  function handleTripChange(e) {
    const { name, value } = e.target;
    setTripForm((prev) => ({ ...prev, [name]: value }));
  }

  async function createTrip(e) {
    e.preventDefault();
    setMessage("");

    if (!tripForm.vehicle_id) {
      setMessage("Vehicle is required.");
      return;
    }

    const payload = {
      vehicle_id: Number(tripForm.vehicle_id),
      route_id: tripForm.route_id ? Number(tripForm.route_id) : null,
      trip_date: tripForm.trip_date || null,
      direction: tripForm.direction,
      driver_name: tripForm.driver_name || null,
      driver_phone: tripForm.driver_phone || null,
      remarks: tripForm.remarks || null,
    };

    try {
      await API.post("/transport-tracking/trips", payload);
      setMessage("Trip scheduled.");
      setTripForm(emptyTripForm);
      await loadTrips();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to schedule trip."));
    }
  }

  async function startTrip(trip) {
    try {
      await API.post(`/transport-tracking/trips/${trip.id}/start`);
      setMessage(`Trip started for ${trip.vehicle_no}.`);
      await loadTrips();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to start trip."));
    }
  }

  async function endTrip(trip) {
    const confirmEnd = window.confirm(`End the trip for ${trip.vehicle_no}?`);
    if (!confirmEnd) return;

    try {
      const response = await API.post(`/transport-tracking/trips/${trip.id}/end`);
      const missed = response.data?.missed_stops || [];
      setMessage(
        missed.length
          ? `Trip ended — never reached: ${missed.join(", ")}.`
          : "Trip ended."
      );
      await loadTrips();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to end trip."));
    }
  }

  async function cancelTrip(trip) {
    const confirmCancel = window.confirm(`Cancel the scheduled trip for ${trip.vehicle_no}?`);
    if (!confirmCancel) return;

    try {
      await API.post(`/transport-tracking/trips/${trip.id}/cancel`);
      setMessage("Trip cancelled.");
      await loadTrips();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to cancel trip."));
    }
  }

  async function openTripStops(trip) {
    setTripStopsDrawer(trip);
    setTripStops([]);
    try {
      const response = await API.get(`/transport-tracking/trips/${trip.id}/stops`);
      setTripStops(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load trip stops."));
    }
  }

  function handleDeviceFormChange(e) {
    const { name, value, type, checked } = e.target;
    setDeviceForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function editDevice(device) {
    setEditingDeviceId(device.id);
    setDeviceForm({
      device_uid: device.device_uid || "",
      label: device.label || "",
      vendor: device.vendor || "",
      model: device.model || "",
      vehicle_id: device.vehicle_id || "",
      notes: device.notes || "",
    });
    setRevealedToken(null);
  }

  function cancelDeviceEdit() {
    setEditingDeviceId(null);
    setDeviceForm(emptyDeviceForm);
  }

  async function saveDevice(e) {
    e.preventDefault();
    setMessage("");

    if (!editingDeviceId && !deviceForm.device_uid.trim()) {
      setMessage("A device identifier is required.");
      return;
    }

    try {
      if (editingDeviceId) {
        await API.put(`/transport-tracking/devices/${editingDeviceId}`, {
          label: deviceForm.label || null,
          vendor: deviceForm.vendor || null,
          model: deviceForm.model || null,
          vehicle_id: deviceForm.vehicle_id ? Number(deviceForm.vehicle_id) : null,
          notes: deviceForm.notes || null,
        });
        setMessage("Tracker updated.");
      } else {
        const response = await API.post("/transport-tracking/devices", {
          device_uid: deviceForm.device_uid.trim(),
          label: deviceForm.label || null,
          vendor: deviceForm.vendor || null,
          model: deviceForm.model || null,
          vehicle_id: deviceForm.vehicle_id ? Number(deviceForm.vehicle_id) : null,
          notes: deviceForm.notes || null,
        });
        setRevealedToken({ device: response.data.device_uid, token: response.data.auth_token });
        setMessage("Tracker registered.");
      }
      cancelDeviceEdit();
      await loadDevices();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save tracker."));
    }
  }

  async function rotateToken(device) {
    const confirmRotate = window.confirm(
      `Issue a new credential for "${device.label || device.device_uid}"? The old one will stop working immediately.`
    );
    if (!confirmRotate) return;

    try {
      const response = await API.post(`/transport-tracking/devices/${device.id}/rotate-token`);
      setRevealedToken({ device: response.data.device_uid, token: response.data.auth_token });
      setMessage("New credential issued.");
      await loadDevices();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to rotate credential."));
    }
  }

  async function deleteDevice(device) {
    const confirmDelete = window.confirm(`Remove the tracker "${device.label || device.device_uid}"?`);
    if (!confirmDelete) return;

    try {
      await API.delete(`/transport-tracking/devices/${device.id}`);
      setMessage("Tracker removed.");
      await loadDevices();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to remove tracker."));
    }
  }

  function handleTrackingConfigChange(e) {
    const { name, value } = e.target;
    setTrackingConfigForm((prev) => ({ ...prev, [name]: value }));
  }

  async function saveTrackingConfig(e) {
    e.preventDefault();
    setMessage("");

    try {
      await API.put("/transport-tracking/config", {
        geofence_radius_m: Number(trackingConfigForm.geofence_radius_m),
        over_speed_kmph: Number(trackingConfigForm.over_speed_kmph),
        stale_after_minutes: Number(trackingConfigForm.stale_after_minutes),
        retain_locations_days: Number(trackingConfigForm.retain_locations_days),
      });
      setMessage("Tracking settings saved.");
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save tracking settings."));
    }
  }

  async function purgeOldHistory() {
    const confirmPurge = window.confirm(
      "Delete position history older than the retention window? Trips, stop events and alerts are kept."
    );
    if (!confirmPurge) return;

    try {
      const response = await API.post("/transport-tracking/purge-history");
      setMessage(`Removed ${response.data.removed} old location point(s).`);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to purge history."));
    }
  }

  async function acknowledgeAlert(alert) {
    const note = window.prompt("Note (optional):") || undefined;

    try {
      await API.post(`/transport-tracking/alerts/${alert.id}/acknowledge`, { note });
      setMessage("Alert acknowledged.");
      await loadAlerts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to acknowledge alert."));
    }
  }

  const routeMap = useMemo(() => {
    const map = {};
    routes.forEach((route) => {
      map[route.id] = route;
    });
    return map;
  }, [routes]);

  const activeRoutes = routes.filter((route) => route.is_active);
  const activeVehicles = vehicles.filter((vehicle) => vehicle.is_active);
  const activeAssignments = assignments.filter(
    (assignment) => assignment.status === "Active"
  );
  const totalSeats = vehicles.reduce((sum, vehicle) => sum + Number(vehicle.capacity || 0), 0);
  const assignedSeats = activeAssignments.length;

  const availableStops = stops.filter((stop) =>
    assignmentForm.route_id ? String(stop.route_id) === String(assignmentForm.route_id) : true
  );
  const availableVehicles = activeVehicles.filter((vehicle) =>
    assignmentForm.route_id
      ? !vehicle.route_id || String(vehicle.route_id) === String(assignmentForm.route_id)
      : true
  );

  function resetForms() {
    setRouteForm(emptyRouteForm);
    setVehicleForm(emptyVehicleForm);
    setStopForm(emptyStopForm);
    setAssignmentForm(emptyAssignmentForm);
    setEditing({ type: "", id: null });
  }

  function handleRouteChange(event) {
    const { name, value, type, checked } = event.target;
    setRouteForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleVehicleChange(event) {
    const { name, value, type, checked } = event.target;
    setVehicleForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleStopChange(event) {
    const { name, value, type, checked } = event.target;
    setStopForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleAssignmentChange(event) {
    const { name, value } = event.target;

    setAssignmentForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "route_id" ? { vehicle_id: "", stop_id: "" } : {}),
    }));
  }

  async function saveRoute(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...routeForm,
      route_name: routeForm.route_name.trim(),
      monthly_fee: Number(routeForm.monthly_fee || 0),
      is_active: Boolean(routeForm.is_active),
    };

    if (!payload.route_name) {
      setMessage("Route name is required.");
      return;
    }

    try {
      if (editing.type === "route") {
        await API.put(`/transport/routes/${editing.id}`, payload);
        setMessage("Transport route updated successfully.");
      } else {
        await API.post("/transport/routes/", payload);
        setMessage("Transport route added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save transport route."));
    }
  }

  async function saveVehicle(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...vehicleForm,
      route_id: vehicleForm.route_id ? Number(vehicleForm.route_id) : null,
      capacity: Number(vehicleForm.capacity),
      is_active: Boolean(vehicleForm.is_active),
    };

    if (!payload.vehicle_no.trim()) {
      setMessage("Vehicle number is required.");
      return;
    }

    try {
      if (editing.type === "vehicle") {
        await API.put(`/transport/vehicles/${editing.id}`, payload);
        setMessage("Vehicle updated successfully.");
      } else {
        await API.post("/transport/vehicles/", payload);
        setMessage("Vehicle added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save vehicle."));
    }
  }

  async function saveStop(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...stopForm,
      route_id: Number(stopForm.route_id),
      sort_order: Number(stopForm.sort_order || 0),
      is_active: Boolean(stopForm.is_active),
    };

    if (!payload.route_id || !payload.stop_name.trim()) {
      setMessage("Route and pickup point are required.");
      return;
    }

    try {
      if (editing.type === "stop") {
        await API.put(`/transport/stops/${editing.id}`, payload);
        setMessage("Pickup point updated successfully.");
      } else {
        await API.post("/transport/stops/", payload);
        setMessage("Pickup point added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save pickup point."));
    }
  }

  async function saveAssignment(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...assignmentForm,
      student_id: Number(assignmentForm.student_id),
      route_id: Number(assignmentForm.route_id),
      vehicle_id: assignmentForm.vehicle_id ? Number(assignmentForm.vehicle_id) : null,
      stop_id: assignmentForm.stop_id ? Number(assignmentForm.stop_id) : null,
      start_date: assignmentForm.start_date || null,
      end_date: assignmentForm.end_date || null,
    };

    if (!payload.student_id || !payload.route_id) {
      setMessage("Student and route are required.");
      return;
    }

    try {
      if (editing.type === "assignment") {
        await API.put(`/transport/assignments/${editing.id}`, payload);
        setMessage("Transport assignment updated successfully.");
      } else {
        await API.post("/transport/assignments/", payload);
        setMessage("Transport assignment added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save transport assignment."));
    }
  }

  async function handleDelete(type, id) {
    const confirmDelete = window.confirm("Are you sure you want to delete this record?");
    if (!confirmDelete) return;

    const endpointMap = {
      route: `/transport/routes/${id}`,
      vehicle: `/transport/vehicles/${id}`,
      stop: `/transport/stops/${id}`,
      assignment: `/transport/assignments/${id}`,
    };

    try {
      await API.delete(endpointMap[type]);
      setMessage("Record deleted successfully.");
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete record."));
    }
  }

  function editRoute(route) {
    setActiveTab("routes");
    setEditing({ type: "route", id: route.id });
    setRouteForm({
      route_name: route.route_name || "",
      start_point: route.start_point || "",
      end_point: route.end_point || "",
      monthly_fee: route.monthly_fee || 0,
      is_active: Boolean(route.is_active),
      remarks: route.remarks || "",
    });
  }

  function editVehicle(vehicle) {
    setActiveTab("vehicles");
    setEditing({ type: "vehicle", id: vehicle.id });
    setVehicleForm({
      vehicle_no: vehicle.vehicle_no || "",
      route_id: vehicle.route_id || "",
      vehicle_type: vehicle.vehicle_type || "Bus",
      capacity: vehicle.capacity || 1,
      driver_name: vehicle.driver_name || "",
      driver_phone: vehicle.driver_phone || "",
      attendant_name: vehicle.attendant_name || "",
      is_active: Boolean(vehicle.is_active),
      remarks: vehicle.remarks || "",
    });
  }

  function editStop(stop) {
    setActiveTab("stops");
    setEditing({ type: "stop", id: stop.id });
    setStopForm({
      route_id: stop.route_id || "",
      stop_name: stop.stop_name || "",
      pickup_time: stop.pickup_time || "",
      drop_time: stop.drop_time || "",
      sort_order: stop.sort_order || 0,
      is_active: Boolean(stop.is_active),
      remarks: stop.remarks || "",
    });
  }

  function editAssignment(assignment) {
    setActiveTab("assignments");
    setEditing({ type: "assignment", id: assignment.id });
    setAssignmentForm({
      student_id: assignment.student_id || "",
      route_id: assignment.route_id || "",
      vehicle_id: assignment.vehicle_id || "",
      stop_id: assignment.stop_id || "",
      start_date: assignment.start_date || "",
      end_date: assignment.end_date || "",
      status: assignment.status || "Active",
      remarks: assignment.remarks || "",
    });
  }

  const filteredRoutes = routes.filter((route) =>
    `${route.route_name} ${route.start_point} ${route.end_point}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  const filteredVehicles = vehicles.filter((vehicle) =>
    `${vehicle.vehicle_no} ${vehicle.route_name} ${vehicle.driver_name} ${vehicle.driver_phone}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  const filteredStops = stops.filter((stop) =>
    `${stop.route_name} ${stop.stop_name} ${stop.pickup_time} ${stop.drop_time}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  const filteredAssignments = assignments.filter((assignment) =>
    `${assignment.student_name} ${assignment.admission_no} ${assignment.route_name} ${assignment.vehicle_no} ${assignment.stop_name}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  const vehiclesWithPosition = livePositions.filter(
    (p) => p.status !== "no_data" && p.latitude != null && p.longitude != null
  );
  const mapCenter = vehiclesWithPosition.length
    ? [
        vehiclesWithPosition.reduce((sum, p) => sum + p.latitude, 0) / vehiclesWithPosition.length,
        vehiclesWithPosition.reduce((sum, p) => sum + p.longitude, 0) / vehiclesWithPosition.length,
      ]
    : [20.5937, 78.9629];
  const mapZoom = vehiclesWithPosition.length ? 13 : 5;

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Transport Management</p>
          <h2>Transport</h2>
          <p>
            Manage routes, vehicles, pickup points, drivers, and student
            transport assignments.
          </p>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <MapPin size={22} />
          <div>
            <span>Routes</span>
            <strong>{routes.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Bus size={22} />
          <div>
            <span>Vehicles</span>
            <strong>{vehicles.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <UserCheck size={22} />
          <div>
            <span>Assigned Students</span>
            <strong>{assignedSeats}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Bus size={22} />
          <div>
            <span>Available Seats</span>
            <strong>{Math.max(totalSeats - assignedSeats, 0)}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          {[
            ["routes", "Routes"],
            ["vehicles", "Vehicles"],
            ["stops", "Pickup Points"],
            ["assignments", "Assignments"],
            ["live", "Live Map"],
            ["trips", "Trips"],
            ["devices", "Devices"],
            ["alerts", "Alerts"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "routes" && (
        <>
          <section className="form-panel">
            <PanelTitle title={editing.type === "route" ? "Edit Route" : "Add Route"} text="Create routes with start point, end point and monthly fee." />
            <form className="classic-form" onSubmit={saveRoute}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Route Name *</label>
                  <input
                    list="transport-route-names"
                    name="route_name"
                    value={routeForm.route_name}
                    onChange={handleRouteChange}
                    required
                  />
                </div>
                <datalist id="transport-route-names">
                  {routeNameOptions.map((routeName) => (
                    <option key={routeName} value={routeName} />
                  ))}
                </datalist>
                <TextField label="Start Point" name="start_point" value={routeForm.start_point} onChange={handleRouteChange} />
                <TextField label="End Point" name="end_point" value={routeForm.end_point} onChange={handleRouteChange} />
                <TextField label="Monthly Fee" type="number" name="monthly_fee" value={routeForm.monthly_fee} onChange={handleRouteChange} />
                <SwitchField checked={routeForm.is_active} onChange={handleRouteChange} name="is_active" />
                <TextareaField value={routeForm.remarks} onChange={handleRouteChange} />
              </div>
              <FormActions editing={editing.type === "route"} label="Route" resetForms={resetForms} />
            </form>
          </section>

          <TransportTable title="Transport Routes" count={filteredRoutes.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Route", "Start", "End", "Monthly Fee", "Status", "Actions"]} emptyText="No transport routes found.">
            {filteredRoutes.map((route) => (
              <tr key={route.id}>
                <td>{route.route_name}</td>
                <td>{route.start_point || "-"}</td>
                <td>{route.end_point || "-"}</td>
                <td>{route.monthly_fee || 0}</td>
                <td><Status active={route.is_active} /></td>
                <td><RowActions onEdit={() => editRoute(route)} onDelete={() => handleDelete("route", route.id)} /></td>
              </tr>
            ))}
          </TransportTable>
        </>
      )}

      {activeTab === "vehicles" && (
        <>
          <section className="form-panel">
            <PanelTitle
              title={editing.type === "vehicle" ? "Edit Vehicle" : "Add Vehicle"}
              text="Add buses, vans, drivers and seat capacity."
              actions={
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowBulkImport(true)}
                >
                  <Upload size={17} />
                  Import CSV
                </button>
              }
            />

            {showBulkImport && (
              <BulkImportModal
                title="Bulk Import Vehicles"
                description="Upload a CSV file to create multiple vehicles at once. route_name is optional and must match an existing route's name."
                templateUrl="/transport/vehicles/bulk-import-template"
                templateFilename="transport_vehicles_import_template.csv"
                importUrl="/transport/vehicles/bulk-import"
                onClose={() => setShowBulkImport(false)}
                onImported={loadPageData}
              />
            )}

            <form className="classic-form" onSubmit={saveVehicle}>
              <div className="form-grid">
                <TextField label="Vehicle No *" name="vehicle_no" value={vehicleForm.vehicle_no} onChange={handleVehicleChange} required />
                <div className="form-field">
                  <label>Route</label>
                  <select name="route_id" value={vehicleForm.route_id} onChange={handleVehicleChange}>
                    <option value="">No Route Assigned</option>
                    {activeRoutes.map((route) => <option key={route.id} value={route.id}>{route.route_name}</option>)}
                  </select>
                </div>
                <TextField label="Vehicle Type" name="vehicle_type" value={vehicleForm.vehicle_type} onChange={handleVehicleChange} />
                <TextField label="Capacity *" type="number" name="capacity" value={vehicleForm.capacity} onChange={handleVehicleChange} required />
                <TextField label="Driver Name" name="driver_name" value={vehicleForm.driver_name} onChange={handleVehicleChange} />
                <TextField label="Driver Phone" name="driver_phone" value={vehicleForm.driver_phone} onChange={handleVehicleChange} />
                <TextField label="Attendant Name" name="attendant_name" value={vehicleForm.attendant_name} onChange={handleVehicleChange} />
                <SwitchField checked={vehicleForm.is_active} onChange={handleVehicleChange} name="is_active" />
                <TextareaField value={vehicleForm.remarks} onChange={handleVehicleChange} />
              </div>
              <FormActions editing={editing.type === "vehicle"} label="Vehicle" resetForms={resetForms} />
            </form>
          </section>

          <TransportTable title="Vehicles" count={filteredVehicles.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Vehicle", "Route", "Driver", "Phone", "Capacity", "Assigned", "Available", "Status", "Actions"]} emptyText="No vehicles found.">
            {filteredVehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>{vehicle.vehicle_no}</td>
                <td>{vehicle.route_name || routeMap[vehicle.route_id]?.route_name || "-"}</td>
                <td>{vehicle.driver_name || "-"}</td>
                <td>{vehicle.driver_phone || "-"}</td>
                <td>{vehicle.capacity}</td>
                <td>{vehicle.assigned_students || 0}</td>
                <td>{vehicle.available_seats || 0}</td>
                <td><Status active={vehicle.is_active} /></td>
                <td><RowActions onEdit={() => editVehicle(vehicle)} onDelete={() => handleDelete("vehicle", vehicle.id)} /></td>
              </tr>
            ))}
          </TransportTable>
        </>
      )}

      {activeTab === "stops" && (
        <>
          <section className="form-panel">
            <PanelTitle title={editing.type === "stop" ? "Edit Pickup Point" : "Add Pickup Point"} text="Add pickup and drop timings for each route." />
            <form className="classic-form" onSubmit={saveStop}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Route *</label>
                  <select name="route_id" value={stopForm.route_id} onChange={handleStopChange} required>
                    <option value="">Select Route</option>
                    {activeRoutes.map((route) => <option key={route.id} value={route.id}>{route.route_name}</option>)}
                  </select>
                </div>
                <TextField label="Pickup Point *" name="stop_name" value={stopForm.stop_name} onChange={handleStopChange} required />
                <TextField label="Pickup Time" name="pickup_time" value={stopForm.pickup_time} onChange={handleStopChange} placeholder="07:30 AM" />
                <TextField label="Drop Time" name="drop_time" value={stopForm.drop_time} onChange={handleStopChange} placeholder="03:30 PM" />
                <TextField label="Sort Order" type="number" name="sort_order" value={stopForm.sort_order} onChange={handleStopChange} />
                <SwitchField checked={stopForm.is_active} onChange={handleStopChange} name="is_active" />
                <TextareaField value={stopForm.remarks} onChange={handleStopChange} />
              </div>
              <FormActions editing={editing.type === "stop"} label="Pickup Point" resetForms={resetForms} />
            </form>
          </section>

          <TransportTable title="Pickup Points" count={filteredStops.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Route", "Pickup Point", "Pickup", "Drop", "Order", "Status", "Actions"]} emptyText="No pickup points found.">
            {filteredStops.map((stop) => (
              <tr key={stop.id}>
                <td>{stop.route_name || routeMap[stop.route_id]?.route_name || "-"}</td>
                <td>{stop.stop_name}</td>
                <td>{stop.pickup_time || "-"}</td>
                <td>{stop.drop_time || "-"}</td>
                <td>{stop.sort_order || 0}</td>
                <td><Status active={stop.is_active} /></td>
                <td><RowActions onEdit={() => editStop(stop)} onDelete={() => handleDelete("stop", stop.id)} /></td>
              </tr>
            ))}
          </TransportTable>
        </>
      )}

      {activeTab === "assignments" && (
        <>
          <section className="form-panel">
            <PanelTitle title={editing.type === "assignment" ? "Edit Transport Assignment" : "Assign Student Transport"} text="Assign students to route, vehicle and pickup point." />
            <form className="classic-form" onSubmit={saveAssignment}>
              <div className="form-grid">
                <StudentPicker
                  students={students}
                  value={assignmentForm.student_id}
                  onChange={handleAssignmentChange}
                />
                <div className="form-field">
                  <label>Route *</label>
                  <select name="route_id" value={assignmentForm.route_id} onChange={handleAssignmentChange} required>
                    <option value="">Select Route</option>
                    {activeRoutes.map((route) => <option key={route.id} value={route.id}>{route.route_name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Vehicle</label>
                  <select name="vehicle_id" value={assignmentForm.vehicle_id} onChange={handleAssignmentChange}>
                    <option value="">Select Vehicle</option>
                    {availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_no} ({vehicle.available_seats || 0} free)</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Pickup Point</label>
                  <select name="stop_id" value={assignmentForm.stop_id} onChange={handleAssignmentChange}>
                    <option value="">Select Pickup Point</option>
                    {availableStops.map((stop) => <option key={stop.id} value={stop.id}>{stop.stop_name}</option>)}
                  </select>
                </div>
                <TextField label="Start Date" type="date" name="start_date" value={assignmentForm.start_date} onChange={handleAssignmentChange} />
                <TextField label="End Date" type="date" name="end_date" value={assignmentForm.end_date} onChange={handleAssignmentChange} />
                <div className="form-field">
                  <label>Status</label>
                  <select name="status" value={assignmentForm.status} onChange={handleAssignmentChange}>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <TextareaField value={assignmentForm.remarks} onChange={handleAssignmentChange} />
              </div>
              <FormActions editing={editing.type === "assignment"} label="Assignment" resetForms={resetForms} />
            </form>
          </section>

          <TransportTable title="Student Assignments" count={filteredAssignments.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Student", "Route", "Vehicle", "Pickup Point", "Start", "End", "Status", "Actions"]} emptyText="No transport assignments found.">
            {filteredAssignments.map((assignment) => (
              <tr key={assignment.id}>
                <td>{assignment.admission_no ? `${assignment.admission_no} - ${assignment.student_name}` : assignment.student_name}</td>
                <td>{assignment.route_name || "-"}</td>
                <td>{assignment.vehicle_no || "-"}</td>
                <td>{assignment.stop_name || "-"}</td>
                <td>{assignment.start_date || "-"}</td>
                <td>{assignment.end_date || "-"}</td>
                <td><span className={assignment.status === "Active" ? "status active" : "status pending"}>{assignment.status}</span></td>
                <td><RowActions onEdit={() => editAssignment(assignment)} onDelete={() => handleDelete("assignment", assignment.id)} /></td>
              </tr>
            ))}
          </TransportTable>
        </>
      )}

      {activeTab === "live" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Live Vehicle Positions</h3>
              <p>Refreshes automatically every 20 seconds.</p>
            </div>
            <button type="button" className="light-button" onClick={loadLivePositions} disabled={liveLoading}>
              <Navigation size={16} />
              {liveLoading ? "Refreshing..." : "Refresh Now"}
            </button>
          </div>

          <div className="transport-live-map">
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {vehiclesWithPosition.map((p) => (
                <Marker key={p.vehicle_id} position={[p.latitude, p.longitude]} icon={vehicleStatusIcon(p.status)}>
                  <Popup>
                    <strong>{p.vehicle_no}</strong><br />
                    Status: {p.status}<br />
                    Speed: {p.speed_kmph != null ? `${p.speed_kmph} km/h` : "-"}<br />
                    Updated: {p.age_minutes != null ? `${p.age_minutes} min ago` : "-"}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div className="table-wrapper" style={{ marginTop: 16 }}>
            <table className="classic-table">
              <thead>
                <tr><th>Vehicle</th><th>Status</th><th>Speed</th><th>Last Update</th></tr>
              </thead>
              <tbody>
                {liveLoading && !livePositions.length && (
                  <tr><td colSpan={4}>Loading...</td></tr>
                )}
                {livePositions.map((p) => (
                  <tr key={p.vehicle_id}>
                    <td>{p.vehicle_no}</td>
                    <td><span className={positionStatusClass(p.status)}>{String(p.status).replace("_", " ")}</span></td>
                    <td>{p.speed_kmph != null ? `${p.speed_kmph} km/h` : "-"}</td>
                    <td>
                      {p.age_minutes != null
                        ? `${p.age_minutes} min ago (${formatDateTime(p.recorded_at)})`
                        : "No data yet"}
                    </td>
                  </tr>
                ))}
                {!liveLoading && !livePositions.length && (
                  <tr><td colSpan={4}>No active vehicles.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "trips" && (
        <>
          <section className="form-panel">
            <PanelTitle title="Schedule a Trip" text="Start a pickup or drop run for a vehicle." />
            <form className="classic-form" onSubmit={createTrip}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Vehicle *</label>
                  <select name="vehicle_id" value={tripForm.vehicle_id} onChange={handleTripChange} required>
                    <option value="">Select Vehicle</option>
                    {activeVehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_no}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Route</label>
                  <select name="route_id" value={tripForm.route_id} onChange={handleTripChange}>
                    <option value="">Use vehicle's assigned route</option>
                    {activeRoutes.map((r) => <option key={r.id} value={r.id}>{r.route_name}</option>)}
                  </select>
                </div>
                <TextField label="Date" type="date" name="trip_date" value={tripForm.trip_date} onChange={handleTripChange} />
                <div className="form-field">
                  <label>Direction *</label>
                  <select name="direction" value={tripForm.direction} onChange={handleTripChange} required>
                    <option value="Pickup">Pickup</option>
                    <option value="Drop">Drop</option>
                  </select>
                </div>
                <TextField label="Driver Name" name="driver_name" value={tripForm.driver_name} onChange={handleTripChange} placeholder="Defaults to vehicle's driver" />
                <TextField label="Driver Phone" name="driver_phone" value={tripForm.driver_phone} onChange={handleTripChange} />
                <TextareaField value={tripForm.remarks} onChange={handleTripChange} />
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  Schedule Trip
                </button>
              </div>
            </form>
          </section>

          <section className="table-panel">
            <div className="panel-header">
              <div><h3>Trips</h3></div>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label>Date</label>
                <input type="date" value={tripDateFilter} onChange={(e) => setTripDateFilter(e.target.value)} />
              </div>
            </div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Vehicle</th><th>Route</th><th>Direction</th><th>Status</th>
                    <th>Driver</th><th>Started</th><th>Ended</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tripsLoading && <tr><td colSpan={8}>Loading...</td></tr>}
                  {!tripsLoading && trips.map((trip) => (
                    <tr key={trip.id}>
                      <td>{trip.vehicle_no}</td>
                      <td>{trip.route_name || "-"}</td>
                      <td>{trip.direction}</td>
                      <td><span className={tripStatusClass(trip.status)}>{trip.status}</span></td>
                      <td>{trip.driver_name || "-"}</td>
                      <td>{trip.started_at ? formatDateTime(trip.started_at) : "-"}</td>
                      <td>{trip.ended_at ? formatDateTime(trip.ended_at) : "-"}</td>
                      <td>
                        <div className="action-buttons">
                          {trip.status === "Scheduled" && (
                            <>
                              <button type="button" className="edit-button" onClick={() => startTrip(trip)} title="Start">
                                <Play size={15} />
                              </button>
                              <button type="button" className="delete-button" onClick={() => cancelTrip(trip)} title="Cancel">
                                <XCircle size={15} />
                              </button>
                            </>
                          )}
                          {trip.status === "Running" && (
                            <button type="button" className="delete-button" onClick={() => endTrip(trip)} title="End">
                              <Square size={15} />
                            </button>
                          )}
                          <button type="button" className="edit-button" onClick={() => openTripStops(trip)} title="View Stops">
                            <MapPin size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!tripsLoading && !trips.length && (
                    <tr><td colSpan={8}>No trips on this date.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "devices" && (
        <>
          <section className="form-panel">
            <PanelTitle title="Tracking Settings" text="Applies to every vehicle and tracker on this account." />
            <form className="classic-form" onSubmit={saveTrackingConfig}>
              <div className="form-grid">
                <TextField label="Geofence Radius (m)" type="number" name="geofence_radius_m" value={trackingConfigForm.geofence_radius_m} onChange={handleTrackingConfigChange} min="10" disabled={!canManageTracking} />
                <TextField label="Over-speed Threshold (km/h)" type="number" name="over_speed_kmph" value={trackingConfigForm.over_speed_kmph} onChange={handleTrackingConfigChange} min="5" disabled={!canManageTracking} />
                <TextField label="Stale After (minutes)" type="number" name="stale_after_minutes" value={trackingConfigForm.stale_after_minutes} onChange={handleTrackingConfigChange} min="1" disabled={!canManageTracking} />
                <TextField label="Retain History (days)" type="number" name="retain_locations_days" value={trackingConfigForm.retain_locations_days} onChange={handleTrackingConfigChange} min="1" disabled={!canManageTracking} />
              </div>
              {canManageTracking && (
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <Settings2 size={18} />
                    Save Settings
                  </button>
                  <button type="button" className="light-button" onClick={purgeOldHistory}>
                    Purge Old History Now
                  </button>
                </div>
              )}
            </form>
          </section>

          {silentDevices.length > 0 && (
            <section className="table-panel">
              <div className="panel-header">
                <div>
                  <h3><AlertTriangle size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />Silent Trackers</h3>
                  <p>Active but haven't reported a position recently.</p>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="classic-table">
                  <thead><tr><th>Tracker</th><th>Vehicle</th><th>Last Seen</th></tr></thead>
                  <tbody>
                    {silentDevices.map((d) => (
                      <tr key={d.id || d.device_id || d.device_uid}>
                        <td>{d.label || d.device_uid}</td>
                        <td>{d.vehicle_no || "-"}</td>
                        <td>{d.last_seen_at ? formatDateTime(d.last_seen_at) : "Never"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="form-panel">
            <PanelTitle title={editingDeviceId ? "Edit Tracker" : "Register Tracker"} text="Add a GPS device and link it to a vehicle." />

            {revealedToken && (
              <div
                className="hint-text"
                style={{
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius)",
                  padding: "12px 14px",
                  marginBottom: 14,
                }}
              >
                <strong>Credential for {revealedToken.device}</strong> — shown once, copy it now:
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <code style={{ wordBreak: "break-all" }}>{revealedToken.token}</code>
                  <button
                    type="button"
                    className="light-button"
                    onClick={() => navigator.clipboard?.writeText(revealedToken.token)}
                    title="Copy"
                  >
                    <Copy size={15} />
                  </button>
                  <button type="button" className="light-button" onClick={() => setRevealedToken(null)}>
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            <form className="classic-form" onSubmit={saveDevice}>
              <div className="form-grid">
                <TextField label="Device UID *" name="device_uid" value={deviceForm.device_uid} onChange={handleDeviceFormChange} required disabled={Boolean(editingDeviceId)} />
                <TextField label="Label" name="label" value={deviceForm.label} onChange={handleDeviceFormChange} />
                <TextField label="Vendor" name="vendor" value={deviceForm.vendor} onChange={handleDeviceFormChange} />
                <TextField label="Model" name="model" value={deviceForm.model} onChange={handleDeviceFormChange} />
                <div className="form-field">
                  <label>Linked Vehicle</label>
                  <select name="vehicle_id" value={deviceForm.vehicle_id} onChange={handleDeviceFormChange}>
                    <option value="">Not linked</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_no}</option>)}
                  </select>
                </div>
                <TextareaField value={deviceForm.notes} onChange={handleDeviceFormChange} />
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editingDeviceId ? "Update Tracker" : "Register Tracker"}
                </button>
                {editingDeviceId && (
                  <button type="button" className="light-button" onClick={cancelDeviceEdit}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <TransportTable title="Trackers" count={devices.length} searchText={searchText} setSearchText={setSearchText} loading={devicesLoading} headers={["Device UID", "Label", "Vendor/Model", "Vehicle", "Status", "Last Seen", "Actions"]} emptyText="No trackers registered yet.">
            {devices.map((d) => (
              <tr key={d.id}>
                <td>{d.device_uid}</td>
                <td>{d.label || "-"}</td>
                <td>{[d.vendor, d.model].filter(Boolean).join(" / ") || "-"}</td>
                <td>{vehicles.find((v) => v.id === d.vehicle_id)?.vehicle_no || "-"}</td>
                <td><Status active={d.is_active} /></td>
                <td>{d.last_seen_at ? formatDateTime(d.last_seen_at) : "Never"}</td>
                <td>
                  <div className="action-buttons">
                    <button type="button" className="edit-button" onClick={() => editDevice(d)} title="Edit">
                      <Edit size={15} />
                    </button>
                    <button type="button" className="edit-button" onClick={() => rotateToken(d)} title="Rotate Credential">
                      <RotateCw size={15} />
                    </button>
                    <button type="button" className="delete-button" onClick={() => deleteDevice(d)} title="Remove">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </TransportTable>
        </>
      )}

      {activeTab === "alerts" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Transport Alerts</h3>
              <p>Over-speed, missed stops, silent trackers, and late arrivals.</p>
            </div>
          </div>

          <div className="filter-row sis-filter-row">
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={alertDateFilter} onChange={(e) => setAlertDateFilter(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Type</label>
              <select value={alertTypeFilter} onChange={(e) => setAlertTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                <option value="over_speed">Over Speed</option>
                <option value="no_signal">No Signal</option>
                <option value="stop_missed">Stop Missed</option>
                <option value="late_arrival">Late Arrival</option>
              </select>
            </div>
            <label className="switch-row" style={{ alignSelf: "flex-end", marginBottom: 8 }}>
              <input type="checkbox" checked={unacknowledgedOnly} onChange={(e) => setUnacknowledgedOnly(e.target.checked)} />
              <span>Unacknowledged only</span>
            </label>
          </div>

          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Vehicle</th><th>Type</th><th>Severity</th><th>Occurred</th>
                  <th>Detail</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {alertsLoading && <tr><td colSpan={7}>Loading...</td></tr>}
                {!alertsLoading && alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{alert.vehicle_no || "-"}</td>
                    <td>{String(alert.alert_type).replace("_", " ")}</td>
                    <td><span className={alertSeverityClass(alert.severity)}>{alert.severity}</span></td>
                    <td>{formatDateTime(alert.occurred_at)}</td>
                    <td>{alert.detail || "-"}</td>
                    <td>
                      {alert.acknowledged_at ? (
                        `Ack'd by ${alert.acknowledged_by}`
                      ) : (
                        <span className="status warning">Open</span>
                      )}
                    </td>
                    <td>
                      {!alert.acknowledged_at && (
                        <button type="button" className="edit-button" onClick={() => acknowledgeAlert(alert)} title="Acknowledge">
                          <AlertTriangle size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!alertsLoading && !alerts.length && (
                  <tr><td colSpan={7}>No alerts for this date.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tripStopsDrawer && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button type="button" className="drawer-close" onClick={() => setTripStopsDrawer(null)}>
              <X size={18} />
            </button>
            <div className="student-profile-head">
              <div className="student-avatar"><MapPin size={42} /></div>
              <h3>{tripStopsDrawer.vehicle_no} — {tripStopsDrawer.direction}</h3>
              <p>{tripStopsDrawer.route_name || "No route"}</p>
            </div>
            <div className="drawer-section">
              {!tripStops.length && <p>No stops configured on this route.</p>}
              {tripStops.map((stop) => (
                <div key={stop.stop_id} style={{ marginBottom: 10 }}>
                  <strong>{stop.stop_name}</strong>
                  <p>Scheduled: {stop.scheduled_time || "-"}</p>
                  <p>
                    {stop.arrived_at
                      ? `Arrived ${formatDateTime(stop.arrived_at)}${
                          stop.delay_minutes ? ` (${stop.delay_minutes > 0 ? "+" : ""}${stop.delay_minutes} min)` : ""
                        }`
                      : "Not reached yet"}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function PanelTitle({ title, text, actions }) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {actions}
    </div>
  );
}

function TextField({ label, ...props }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input {...props} />
    </div>
  );
}

function TextareaField({ value, onChange }) {
  return (
    <div className="form-field full-width">
      <label>Remarks</label>
      <textarea name="remarks" value={value} onChange={onChange} rows="3"></textarea>
    </div>
  );
}

function SwitchField({ checked, onChange, name }) {
  return (
    <div className="form-field">
      <label>Status</label>
      <label className="switch-row">
        <input type="checkbox" name={name} checked={Boolean(checked)} onChange={onChange} />
        <span>{checked ? "Active" : "Inactive"}</span>
      </label>
    </div>
  );
}

function FormActions({ editing, label, resetForms }) {
  return (
    <div className="form-actions">
      <button type="submit" className="primary-button">
        <PlusCircle size={18} />
        {editing ? `Update ${label}` : `Add ${label}`}
      </button>
      {editing && (
        <button type="button" className="light-button" onClick={resetForms}>
          Cancel Edit
        </button>
      )}
    </div>
  );
}

function TransportTable({ title, count, searchText, setSearchText, loading, headers, emptyText, children }) {
  return (
    <ManagedRecordsTable
      count={count}
      emptyText={emptyText}
      headers={headers}
      loading={loading}
      loadingText={`Loading ${title.toLowerCase()}...`}
      searchPlaceholder="Search transport records..."
      searchText={searchText}
      setSearchText={setSearchText}
    >
      {children}
    </ManagedRecordsTable>
  );
}

function Status({ active }) {
  return <span className={active ? "status active" : "status danger"}>{active ? "Active" : "Inactive"}</span>;
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="action-buttons">
      <button type="button" className="edit-button" onClick={onEdit} title="Edit">
        <Edit size={15} />
      </button>
      <button type="button" className="delete-button" onClick={onDelete} title="Delete">
        <Trash2 size={15} />
      </button>
    </div>
  );
}
