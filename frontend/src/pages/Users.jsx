import { useEffect, useState } from "react";
import {
  Edit,
  Trash2,
  PlusCircle,
  Search,
  RefreshCcw,
  KeyRound,
  Users as UsersIcon,
} from "lucide-react";
import API from "../api";
import { getUser } from "../auth";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "",
};

export default function Users() {
  const loggedInUser = getUser();

  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [resetUserId, setResetUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);
      const response = await API.get("/users/");
      setUsers(response.data);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      if (editingId) {
        const updatePayload = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
        };

        await API.put(`/users/${editingId}`, updatePayload);
        setMessage("User updated successfully.");
      } else {
        const createPayload = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        };

        await API.post("/users/", createPayload);
        setMessage("User created successfully.");
      }

      setFormData(emptyForm);
      setEditingId(null);
      setPageMode("list");
      loadUsers();
    } catch (error) {
      console.error(error);

      if (error.response?.data?.detail) {
        setMessage(error.response.data.detail);
      } else {
        setMessage("Something went wrong.");
      }
    }
  }

  function handleEdit(user) {
    setEditingId(user.id);
    setPageMode("form");

    setFormData({
      name: user.name || "",
      email: user.email || "",
      password: "",
      role: user.role || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleDelete(userId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/users/${userId}`);
      setMessage("User deleted successfully.");
      loadUsers();
    } catch (error) {
      console.error(error);

      if (error.response?.data?.detail) {
        setMessage(error.response.data.detail);
      } else {
        setMessage("Unable to delete user.");
      }
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setMessage("");

    try {
      await API.put(`/users/${resetUserId}/reset-password`, {
        new_password: newPassword,
      });

      setMessage("Password reset successfully.");
      setResetUserId(null);
      setNewPassword("");
    } catch (error) {
      console.error(error);

      if (error.response?.data?.detail) {
        setMessage(error.response.data.detail);
      } else {
        setMessage("Unable to reset password.");
      }
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyForm);
    setMessage("");
    setPageMode("list");
  }

  function handleAddUser() {
    setEditingId(null);
    setFormData(emptyForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeResetBox() {
    setResetUserId(null);
    setNewPassword("");
  }

  const filteredUsers = users.filter((user) => {
    const fullText = `
      ${user.name}
      ${user.email}
      ${user.role}
    `.toLowerCase();

    return fullText.includes(searchText.toLowerCase());
  });

  const adminCount = users.filter((user) => user.role === "Admin").length;
  const principalCount = users.filter((user) => user.role === "Principal").length;
  const accountsCount = users.filter((user) => user.role === "Accounts").length;
  const teacherCount = users.filter((user) => user.role === "Teacher").length;

  const userForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit User" : "Add New User"}</h3>
          <p>
            {editingId
              ? "Update user details and role"
              : "Create a new ERP login user"}
          </p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="User name"
            />
          </div>

          <div className="form-field">
            <label>Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="user@school.com"
            />
          </div>

          {!editingId && (
            <div className="form-field">
              <label>Password *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength="6"
                placeholder="Minimum 6 characters"
              />
            </div>
          )}

          <div className="form-field">
            <label>Role *</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
            >
              <option value="">Select Role</option>
              <option value="Admin">Admin</option>
              <option value="Principal">Principal</option>
              <option value="Accounts">Accounts</option>
              <option value="Teacher">Teacher</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update User" : "Add User"}
          </button>

          <button
            type="button"
            className="light-button"
            onClick={handleCancelEdit}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admin Control Panel</p>
            <h2>{editingId ? "Edit User" : "Add User"}</h2>
            <p>
              {editingId
                ? "Update user details and role."
                : "Create a new ERP login user."}
            </p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={handleCancelEdit}
          >
            Back to User Records
          </button>
        </section>

        {message && <div className="message-box">{message}</div>}

        {userForm}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Admin Control Panel</p>
          <h2>User Management</h2>
          <p>
            Create school ERP users, assign roles, and reset user passwords.
          </p>
        </div>

        <div className="module-header-actions">
          <button className="secondary-button" onClick={loadUsers}>
            <RefreshCcw size={17} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={handleAddUser}>
            <PlusCircle size={18} />
            Add User
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <UsersIcon size={22} />
          <div>
            <span>Total Users</span>
            <strong>{users.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <UsersIcon size={22} />
          <div>
            <span>Admins</span>
            <strong>{adminCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <UsersIcon size={22} />
          <div>
            <span>Principals</span>
            <strong>{principalCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <UsersIcon size={22} />
          <div>
            <span>Accounts / Teachers</span>
            <strong>
              {accountsCount}/{teacherCount}
            </strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      {resetUserId && (
        <section className="form-panel password-reset-panel">
          <div className="panel-header">
            <div>
              <h3>Reset Password</h3>
              <p>Set a new password for the selected user.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={handleResetPassword}>
            <div className="form-grid">
              <div className="form-field">
                <label>New Password *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength="6"
                  placeholder="Enter new password"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-button">
                <KeyRound size={18} />
                Reset Password
              </button>

              <button
                type="button"
                className="light-button"
                onClick={closeResetBox}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>User Records</h3>
            <p>{filteredUsers.length} user record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search name, email, role..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-box">Loading users...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Current User</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-table">
                      No user records found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className="status active">{user.role}</span>
                      </td>
                      <td>
                        {loggedInUser?.id === user.id ? (
                          <span className="status pending">You</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="edit-button"
                            onClick={() => handleEdit(user)}
                          >
                            <Edit size={15} />
                          </button>

                          <button
                            className="password-button"
                            onClick={() => setResetUserId(user.id)}
                          >
                            <KeyRound size={15} />
                          </button>

                          <button
                            className="delete-button"
                            disabled={loggedInUser?.id === user.id}
                            onClick={() => handleDelete(user.id)}
                            title={
                              loggedInUser?.id === user.id
                                ? "You cannot delete your own account"
                                : "Delete user"
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
