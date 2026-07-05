import { useEffect, useMemo, useState } from "react";
import {
  Bus,
  Edit,
  MapPin,
  PlusCircle,
  RefreshCcw,
  Trash2,
  UserCheck,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import { getMasterValues } from "../services/masterDataService";

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

        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadPageData}>
            <RefreshCcw size={17} />
            Refresh
          </button>
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
            <PanelTitle title={editing.type === "vehicle" ? "Edit Vehicle" : "Add Vehicle"} text="Add buses, vans, drivers and seat capacity." />
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
    </div>
  );
}

function PanelTitle({ title, text }) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
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
