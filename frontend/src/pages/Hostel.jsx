import { useEffect, useMemo, useState } from "react";
import {
  Bed,
  Building2,
  Edit,
  PlusCircle,
  Trash2,
  UserCheck,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";

const emptyBlockForm = {
  block_name: "",
  hostel_type: "Boys",
  warden_name: "",
  warden_phone: "",
  is_active: true,
  remarks: "",
};

const emptyRoomForm = {
  block_id: "",
  room_no: "",
  floor: "",
  capacity: 1,
  is_active: true,
  remarks: "",
};

const emptyAllocationForm = {
  student_id: "",
  room_id: "",
  bed_no: "",
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

export default function Hostel() {
  const [activeTab, setActiveTab] = useState("blocks");
  const [blocks, setBlocks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [students, setStudents] = useState([]);

  const [blockForm, setBlockForm] = useState(emptyBlockForm);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [allocationForm, setAllocationForm] = useState(emptyAllocationForm);
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

      const [blockResponse, roomResponse, allocationResponse, studentResponse] =
        await Promise.all([
          API.get("/hostel/blocks/"),
          API.get("/hostel/rooms/"),
          API.get("/hostel/allocations/"),
          API.get("/students/"),
        ]);

      setBlocks(blockResponse.data || []);
      setRooms(roomResponse.data || []);
      setAllocations(allocationResponse.data || []);
      setStudents(studentResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load hostel data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const blockMap = useMemo(() => {
    const map = {};
    blocks.forEach((block) => {
      map[block.id] = block;
    });
    return map;
  }, [blocks]);

  const activeBlocks = blocks.filter((block) => block.is_active);
  const activeRooms = rooms.filter((room) => room.is_active);
  const activeAllocations = allocations.filter(
    (allocation) => allocation.status === "Active"
  );
  const totalBeds = rooms.reduce((sum, room) => sum + Number(room.capacity || 0), 0);
  const occupiedBeds = activeAllocations.length;

  function handleBlockChange(event) {
    const { name, value, type, checked } = event.target;
    setBlockForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleRoomChange(event) {
    const { name, value, type, checked } = event.target;
    setRoomForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleAllocationChange(event) {
    const { name, value } = event.target;
    setAllocationForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForms() {
    setBlockForm(emptyBlockForm);
    setRoomForm(emptyRoomForm);
    setAllocationForm(emptyAllocationForm);
    setEditing({ type: "", id: null });
  }

  async function saveBlock(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...blockForm,
      block_name: blockForm.block_name.trim(),
      is_active: Boolean(blockForm.is_active),
    };

    if (!payload.block_name) {
      setMessage("Hostel block name is required.");
      return;
    }

    try {
      if (editing.type === "block") {
        await API.put(`/hostel/blocks/${editing.id}`, payload);
        setMessage("Hostel block updated successfully.");
      } else {
        await API.post("/hostel/blocks/", payload);
        setMessage("Hostel block added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save hostel block."));
    }
  }

  async function saveRoom(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...roomForm,
      block_id: Number(roomForm.block_id),
      capacity: Number(roomForm.capacity),
      is_active: Boolean(roomForm.is_active),
    };

    if (!payload.block_id || !payload.room_no.trim()) {
      setMessage("Block and room number are required.");
      return;
    }

    try {
      if (editing.type === "room") {
        await API.put(`/hostel/rooms/${editing.id}`, payload);
        setMessage("Hostel room updated successfully.");
      } else {
        await API.post("/hostel/rooms/", payload);
        setMessage("Hostel room added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save hostel room."));
    }
  }

  async function saveAllocation(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...allocationForm,
      student_id: Number(allocationForm.student_id),
      room_id: Number(allocationForm.room_id),
      start_date: allocationForm.start_date || null,
      end_date: allocationForm.end_date || null,
    };

    if (!payload.student_id || !payload.room_id || !payload.bed_no.trim()) {
      setMessage("Student, room and bed number are required.");
      return;
    }

    try {
      if (editing.type === "allocation") {
        await API.put(`/hostel/allocations/${editing.id}`, payload);
        setMessage("Hostel allocation updated successfully.");
      } else {
        await API.post("/hostel/allocations/", payload);
        setMessage("Hostel allocation added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save hostel allocation."));
    }
  }

  async function handleDelete(type, id) {
    const confirmDelete = window.confirm("Are you sure you want to delete this record?");
    if (!confirmDelete) return;

    const endpointMap = {
      block: `/hostel/blocks/${id}`,
      room: `/hostel/rooms/${id}`,
      allocation: `/hostel/allocations/${id}`,
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

  function editBlock(block) {
    setActiveTab("blocks");
    setEditing({ type: "block", id: block.id });
    setBlockForm({
      block_name: block.block_name || "",
      hostel_type: block.hostel_type || "Boys",
      warden_name: block.warden_name || "",
      warden_phone: block.warden_phone || "",
      is_active: Boolean(block.is_active),
      remarks: block.remarks || "",
    });
  }

  function editRoom(room) {
    setActiveTab("rooms");
    setEditing({ type: "room", id: room.id });
    setRoomForm({
      block_id: room.block_id || "",
      room_no: room.room_no || "",
      floor: room.floor || "",
      capacity: room.capacity || 1,
      is_active: Boolean(room.is_active),
      remarks: room.remarks || "",
    });
  }

  function editAllocation(allocation) {
    setActiveTab("allocations");
    setEditing({ type: "allocation", id: allocation.id });
    setAllocationForm({
      student_id: allocation.student_id || "",
      room_id: allocation.room_id || "",
      bed_no: allocation.bed_no || "",
      start_date: allocation.start_date || "",
      end_date: allocation.end_date || "",
      status: allocation.status || "Active",
      remarks: allocation.remarks || "",
    });
  }

  const filteredBlocks = blocks.filter((block) =>
    `${block.block_name} ${block.hostel_type} ${block.warden_name}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  const filteredRooms = rooms.filter((room) =>
    `${room.block_name} ${room.room_no} ${room.floor}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  const filteredAllocations = allocations.filter((allocation) =>
    `${allocation.student_name} ${allocation.admission_no} ${allocation.block_name} ${allocation.room_no} ${allocation.bed_no}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Residential Management</p>
          <h2>Hostel</h2>
          <p>
            Manage hostel blocks, rooms, bed capacity, and student residential
            allocation.
          </p>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Building2 size={22} />
          <div>
            <span>Hostel Blocks</span>
            <strong>{blocks.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Bed size={22} />
          <div>
            <span>Total Beds</span>
            <strong>{totalBeds}</strong>
          </div>
        </div>

        <div className="summary-card">
          <UserCheck size={22} />
          <div>
            <span>Occupied Beds</span>
            <strong>{occupiedBeds}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Bed size={22} />
          <div>
            <span>Available Beds</span>
            <strong>{Math.max(totalBeds - occupiedBeds, 0)}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          <button
            type="button"
            className={activeTab === "blocks" ? "active" : ""}
            onClick={() => setActiveTab("blocks")}
          >
            Blocks
          </button>
          <button
            type="button"
            className={activeTab === "rooms" ? "active" : ""}
            onClick={() => setActiveTab("rooms")}
          >
            Rooms
          </button>
          <button
            type="button"
            className={activeTab === "allocations" ? "active" : ""}
            onClick={() => setActiveTab("allocations")}
          >
            Allocations
          </button>
        </div>
      </section>

      {activeTab === "blocks" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>{editing.type === "block" ? "Edit Hostel Block" : "Add Hostel Block"}</h3>
                <p>Create hostel buildings or wings and assign wardens.</p>
              </div>
            </div>

            <form className="classic-form" onSubmit={saveBlock}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Block Name *</label>
                  <input name="block_name" value={blockForm.block_name} onChange={handleBlockChange} placeholder="Example: Boys Hostel A" required />
                </div>

                <div className="form-field">
                  <label>Hostel Type</label>
                  <select name="hostel_type" value={blockForm.hostel_type} onChange={handleBlockChange}>
                    <option value="Boys">Boys</option>
                    <option value="Girls">Girls</option>
                    <option value="Co-ed">Co-ed</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Warden Name</label>
                  <input name="warden_name" value={blockForm.warden_name} onChange={handleBlockChange} />
                </div>

                <div className="form-field">
                  <label>Warden Phone</label>
                  <input name="warden_phone" value={blockForm.warden_phone} onChange={handleBlockChange} />
                </div>

                <div className="form-field">
                  <label>Status</label>
                  <label className="switch-row">
                    <input type="checkbox" name="is_active" checked={Boolean(blockForm.is_active)} onChange={handleBlockChange} />
                    <span>{blockForm.is_active ? "Active" : "Inactive"}</span>
                  </label>
                </div>

                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea name="remarks" value={blockForm.remarks} onChange={handleBlockChange} rows="3"></textarea>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editing.type === "block" ? "Update Block" : "Add Block"}
                </button>
                {editing.type === "block" && <button type="button" className="light-button" onClick={resetForms}>Cancel Edit</button>}
              </div>
            </form>
          </section>

          <HostelTable
            title="Hostel Blocks"
            count={filteredBlocks.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Block", "Type", "Warden", "Phone", "Status", "Actions"]}
            emptyText="No hostel blocks found."
          >
            {filteredBlocks.map((block) => (
              <tr key={block.id}>
                <td>{block.block_name}</td>
                <td>{block.hostel_type}</td>
                <td>{block.warden_name || "-"}</td>
                <td>{block.warden_phone || "-"}</td>
                <td><span className={block.is_active ? "status active" : "status danger"}>{block.is_active ? "Active" : "Inactive"}</span></td>
                <td><RowActions onEdit={() => editBlock(block)} onDelete={() => handleDelete("block", block.id)} /></td>
              </tr>
            ))}
          </HostelTable>
        </>
      )}

      {activeTab === "rooms" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>{editing.type === "room" ? "Edit Hostel Room" : "Add Hostel Room"}</h3>
                <p>Set room capacity and keep bed availability accurate.</p>
              </div>
            </div>

            <form className="classic-form" onSubmit={saveRoom}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Hostel Block *</label>
                  <select name="block_id" value={roomForm.block_id} onChange={handleRoomChange} required>
                    <option value="">Select Block</option>
                    {activeBlocks.map((block) => <option key={block.id} value={block.id}>{block.block_name}</option>)}
                  </select>
                </div>

                <div className="form-field">
                  <label>Room No *</label>
                  <input name="room_no" value={roomForm.room_no} onChange={handleRoomChange} required />
                </div>

                <div className="form-field">
                  <label>Floor</label>
                  <input name="floor" value={roomForm.floor} onChange={handleRoomChange} />
                </div>

                <div className="form-field">
                  <label>Capacity *</label>
                  <input type="number" min="1" name="capacity" value={roomForm.capacity} onChange={handleRoomChange} required />
                </div>

                <div className="form-field">
                  <label>Status</label>
                  <label className="switch-row">
                    <input type="checkbox" name="is_active" checked={Boolean(roomForm.is_active)} onChange={handleRoomChange} />
                    <span>{roomForm.is_active ? "Active" : "Inactive"}</span>
                  </label>
                </div>

                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea name="remarks" value={roomForm.remarks} onChange={handleRoomChange} rows="3"></textarea>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editing.type === "room" ? "Update Room" : "Add Room"}
                </button>
                {editing.type === "room" && <button type="button" className="light-button" onClick={resetForms}>Cancel Edit</button>}
              </div>
            </form>
          </section>

          <HostelTable
            title="Hostel Rooms"
            count={filteredRooms.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Block", "Room", "Floor", "Capacity", "Occupied", "Available", "Status", "Actions"]}
            emptyText="No hostel rooms found."
          >
            {filteredRooms.map((room) => (
              <tr key={room.id}>
                <td>{room.block_name || blockMap[room.block_id]?.block_name || "-"}</td>
                <td>{room.room_no}</td>
                <td>{room.floor || "-"}</td>
                <td>{room.capacity}</td>
                <td>{room.occupied_beds || 0}</td>
                <td>{room.available_beds || 0}</td>
                <td><span className={room.is_active ? "status active" : "status danger"}>{room.is_active ? "Active" : "Inactive"}</span></td>
                <td><RowActions onEdit={() => editRoom(room)} onDelete={() => handleDelete("room", room.id)} /></td>
              </tr>
            ))}
          </HostelTable>
        </>
      )}

      {activeTab === "allocations" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>{editing.type === "allocation" ? "Edit Bed Allocation" : "Allocate Bed"}</h3>
                <p>Assign students to active hostel rooms and bed numbers.</p>
              </div>
            </div>

            <form className="classic-form" onSubmit={saveAllocation}>
              <div className="form-grid">
                <StudentPicker
                  students={students}
                  value={allocationForm.student_id}
                  onChange={handleAllocationChange}
                />

                <div className="form-field">
                  <label>Room *</label>
                  <select name="room_id" value={allocationForm.room_id} onChange={handleAllocationChange} required>
                    <option value="">Select Room</option>
                    {activeRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.block_name || blockMap[room.block_id]?.block_name || "Block"} - Room {room.room_no} ({room.available_beds || 0} free)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Bed No *</label>
                  <input name="bed_no" value={allocationForm.bed_no} onChange={handleAllocationChange} placeholder="Example: B1" required />
                </div>

                <div className="form-field">
                  <label>Start Date</label>
                  <input type="date" name="start_date" value={allocationForm.start_date} onChange={handleAllocationChange} />
                </div>

                <div className="form-field">
                  <label>End Date</label>
                  <input type="date" name="end_date" value={allocationForm.end_date} onChange={handleAllocationChange} />
                </div>

                <div className="form-field">
                  <label>Status</label>
                  <select name="status" value={allocationForm.status} onChange={handleAllocationChange}>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea name="remarks" value={allocationForm.remarks} onChange={handleAllocationChange} rows="3"></textarea>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editing.type === "allocation" ? "Update Allocation" : "Allocate Bed"}
                </button>
                {editing.type === "allocation" && <button type="button" className="light-button" onClick={resetForms}>Cancel Edit</button>}
              </div>
            </form>
          </section>

          <HostelTable
            title="Hostel Allocations"
            count={filteredAllocations.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Student", "Block", "Room", "Bed", "Start", "End", "Status", "Actions"]}
            emptyText="No hostel allocations found."
          >
            {filteredAllocations.map((allocation) => (
              <tr key={allocation.id}>
                <td>{allocation.admission_no ? `${allocation.admission_no} - ${allocation.student_name}` : allocation.student_name}</td>
                <td>{allocation.block_name || "-"}</td>
                <td>{allocation.room_no || "-"}</td>
                <td>{allocation.bed_no}</td>
                <td>{allocation.start_date || "-"}</td>
                <td>{allocation.end_date || "-"}</td>
                <td><span className={allocation.status === "Active" ? "status active" : "status pending"}>{allocation.status}</span></td>
                <td><RowActions onEdit={() => editAllocation(allocation)} onDelete={() => handleDelete("allocation", allocation.id)} /></td>
              </tr>
            ))}
          </HostelTable>
        </>
      )}
    </div>
  );
}

function HostelTable({ title, count, searchText, setSearchText, loading, headers, emptyText, children }) {
  return (
    <ManagedRecordsTable
      count={count}
      emptyText={emptyText}
      headers={headers}
      loading={loading}
      loadingText={`Loading ${title.toLowerCase()}...`}
      searchPlaceholder="Search hostel records..."
      searchText={searchText}
      setSearchText={setSearchText}
    >
      {children}
    </ManagedRecordsTable>
  );
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
