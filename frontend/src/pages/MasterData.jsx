import { useEffect, useMemo, useState } from "react";
import {
  Edit,
  Trash2,
  PlusCircle,
  Database,
} from "lucide-react";
import API from "../api";
import ManagedRecordsTable from "../components/ManagedRecordsTable";

const emptyForm = {
  category: "",
  value: "",
  sort_order: 0,
  is_active: true,
};

export default function MasterData() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("Department");
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

  async function loadCategories() {
    const response = await API.get("/master-data/categories");
    setCategories(response.data.categories || []);
  }

  async function loadItems() {
    const response = await API.get("/master-data/");
    setItems(response.data || []);
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");
      await Promise.all([loadCategories(), loadItems()]);
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Unable to load master data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      category: selectedCategory,
    }));
  }, [selectedCategory]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = {
        category: formData.category,
        value: formData.value,
        sort_order: Number(formData.sort_order || 0),
        is_active: Boolean(formData.is_active),
      };

      if (editingId) {
        await API.put(`/master-data/${editingId}`, payload);
        setMessage("Master data updated successfully.");
      } else {
        await API.post("/master-data/", payload);
        setMessage("Master data added successfully.");
      }

      setFormData({
        ...emptyForm,
        category: selectedCategory,
      });
      setEditingId(null);
      await loadItems();
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Something went wrong.");
    }
  }

  function handleEdit(item) {
    setEditingId(item.id);

    setFormData({
      category: item.category || selectedCategory,
      value: item.value || "",
      sort_order: item.sort_order || 0,
      is_active: Boolean(item.is_active),
    });

    setSelectedCategory(item.category);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(itemId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this master data value?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/master-data/${itemId}`);
      setMessage("Master data deleted successfully.");
      await loadItems();
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Unable to delete master data.");
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData({
      ...emptyForm,
      category: selectedCategory,
    });
    setMessage("");
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCategory = item.category === selectedCategory;

      const fullText = `
        ${item.category}
        ${item.value}
        ${item.sort_order}
        ${item.is_active ? "Active" : "Inactive"}
      `.toLowerCase();

      const matchSearch = fullText.includes(searchText.toLowerCase());

      return matchCategory && matchSearch;
    });
  }, [items, selectedCategory, searchText]);

  const activeCount = filteredItems.filter((item) => item.is_active).length;
  const inactiveCount = filteredItems.filter((item) => !item.is_active).length;

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">System Configuration</p>
          <h2>Master Data</h2>
          <p>
            Configure dropdown values used across students, faculty, fees,
            attendance, exams, classes, and other ERP modules.
          </p>
        </div>

      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Database size={22} />
          <div>
            <span>Total Categories</span>
            <strong>{categories.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Database size={22} />
          <div>
            <span>Total Values</span>
            <strong>{items.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Database size={22} />
          <div>
            <span>Active in Category</span>
            <strong>{activeCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Database size={22} />
          <div>
            <span>Inactive in Category</span>
            <strong>{inactiveCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="master-data-layout">
        <aside className="master-category-panel">
          <h3>Categories</h3>

          <div className="master-category-list">
            {categories.map((category) => (
              <button
                key={category}
                className={
                  selectedCategory === category
                    ? "master-category active"
                    : "master-category"
                }
                onClick={() => {
                  setSelectedCategory(category);
                  setEditingId(null);
                  setFormData({
                    ...emptyForm,
                    category,
                  });
                }}
              >
                {category}
              </button>
            ))}
          </div>
        </aside>

        <main className="master-data-main">
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  {editingId
                    ? `Edit ${selectedCategory} Value`
                    : `Add ${selectedCategory} Value`}
                </h3>
                <p>
                  Manage values for <strong>{selectedCategory}</strong> dropdowns.
                </p>
              </div>
            </div>

            <form className="classic-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Category *</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={(e) => {
                      handleChange(e);
                      setSelectedCategory(e.target.value);
                    }}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Value *</label>
                  <input
                    type="text"
                    name="value"
                    value={formData.value}
                    onChange={handleChange}
                    required
                    placeholder={`Enter ${selectedCategory} value`}
                  />
                </div>

                <div className="form-field">
                  <label>Sort Order</label>
                  <input
                    type="number"
                    name="sort_order"
                    value={formData.sort_order}
                    onChange={handleChange}
                    min="0"
                  />
                </div>

                <div className="form-field checkbox-field">
                  <label>Active</label>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                    />
                    <span>{formData.is_active ? "Active" : "Inactive"}</span>
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editingId ? "Update Value" : "Add Value"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    className="light-button"
                    onClick={handleCancelEdit}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </section>

          <ManagedRecordsTable
            count={filteredItems.length}
            emptyText="No values found for this category."
            headers={["Value", "Sort Order", "Status", "Actions"]}
            loading={loading}
            loadingText="Loading master data..."
            searchPlaceholder="Search value..."
            searchText={searchText}
            setSearchText={setSearchText}
          >
            {filteredItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.value}</td>
                          <td>{item.sort_order}</td>
                          <td>
                            <span
                              className={
                                item.is_active ? "status active" : "status danger"
                              }
                            >
                              {item.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="edit-button"
                                onClick={() => handleEdit(item)}
                              >
                                <Edit size={15} />
                              </button>

                              <button
                                className="delete-button"
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
            ))}
          </ManagedRecordsTable>
        </main>
      </section>
    </div>
  );
}
