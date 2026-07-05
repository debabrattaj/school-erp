import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Filter,
  Menu,
  MessageCircle,
  Pin,
  Search,
  SlidersHorizontal,
} from "lucide-react";

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export default function EnhancedRecordsTable({
  columns,
  data,
  emptyText = "No records found.",
  getRowClassName,
  loading,
  loadingText = "Loading records...",
  onRowClick,
  pageSizeOptions = [25, 50, 100, 200],
  rowKey = (record) => record.id,
  searchPlaceholder = "Search records...",
  searchText,
  setSearchText,
}) {
  const [activeColumnMenu, setActiveColumnMenu] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [enabledColumnFilters, setEnabledColumnFilters] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [showRowActions, setShowRowActions] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });
  const [pinnedColumnKeys, setPinnedColumnKeys] = useState([]);
  const menuRootRef = useRef(null);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(
    columns.filter((column) => column.hideable !== false).map((column) => column.key)
  );

  const hideableKeys = columns
    .filter((column) => column.hideable !== false)
    .map((column) => column.key);
  const columnsSignature = columns.map((column) => column.key).join("\u0001");

  const visibleColumns = columns.filter(
    (column) => column.hideable === false || visibleColumnKeys.includes(column.key)
  );
  const orderedVisibleColumns = [
    ...visibleColumns.filter((column) => pinnedColumnKeys.includes(column.key)),
    ...visibleColumns.filter((column) => !pinnedColumnKeys.includes(column.key)),
  ];

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!menuRootRef.current?.contains(event.target)) {
        setActiveColumnMenu(null);
        setShowColumnManager(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setVisibleColumnKeys(
      columns.filter((column) => column.hideable !== false).map((column) => column.key)
    );
    setPinnedColumnKeys([]);
    setActiveColumnMenu(null);
    setShowColumnManager(false);
    setShowFilters(false);
    setColumnFilters({});
    setEnabledColumnFilters({});
    setSortConfig({ key: "", direction: "asc" });
    setCurrentPage(1);
    setSelectedRowKeys([]);
  }, [columnsSignature]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRowKeys([]);
  }, [data.length]);

  function getColumnText(record, column) {
    if (column.value) return normalizeText(column.value(record));
    if (typeof column.render === "function") return normalizeText(column.render(record));
    return normalizeText(record[column.key]);
  }

  function updateColumnFilter(key, value) {
    setColumnFilters((current) => ({
      ...current,
      [key]: value,
    }));
    setCurrentPage(1);
  }

  function sortByColumn(key, direction) {
    setSortConfig({ key, direction });
    setActiveColumnMenu(null);
  }

  function toggleColumn(key) {
    setVisibleColumnKeys((current) =>
      current.includes(key)
        ? current.filter((columnKey) => columnKey !== key)
        : [...current, key]
    );
    setActiveColumnMenu(null);
  }

  function togglePinnedColumn(key) {
    setPinnedColumnKeys((current) =>
      current.includes(key)
        ? current.filter((columnKey) => columnKey !== key)
        : [...current, key]
    );
    setActiveColumnMenu(null);
  }

  const filteredData = useMemo(() => {
    return data.filter((record) =>
      columns.every((column) => {
        if (!enabledColumnFilters[column.key]) return true;
        const filterValue = String(columnFilters[column.key] || "").trim().toLowerCase();
        if (!filterValue) return true;
        return getColumnText(record, column).toLowerCase().includes(filterValue);
      })
    );
  }, [columnFilters, columns, data, enabledColumnFilters]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    const sortColumn = columns.find((column) => column.key === sortConfig.key);
    if (!sortColumn) return filteredData;

    return [...filteredData].sort((first, second) => {
      const firstValue = getColumnText(first, sortColumn).toLowerCase();
      const secondValue = getColumnText(second, sortColumn).toLowerCase();
      return sortConfig.direction === "asc"
        ? firstValue.localeCompare(secondValue, undefined, { numeric: true })
        : secondValue.localeCompare(firstValue, undefined, { numeric: true });
    });
  }, [columns, filteredData, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / recordsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * recordsPerPage;
  const pageEndIndex = Math.min(pageStartIndex + recordsPerPage, sortedData.length);
  const displayedData = sortedData.slice(pageStartIndex, pageEndIndex);
  const displayedRowKeys = displayedData.map((record) => String(rowKey(record)));
  const allDisplayedRowsSelected =
    displayedRowKeys.length > 0 &&
    displayedRowKeys.every((key) => selectedRowKeys.includes(key));

  function toggleRowSelection(record) {
    const key = String(rowKey(record));
    setSelectedRowKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  function toggleDisplayedRows() {
    setSelectedRowKeys((current) => {
      if (allDisplayedRowsSelected) {
        return current.filter((key) => !displayedRowKeys.includes(key));
      }

      return Array.from(new Set([...current, ...displayedRowKeys]));
    });
  }

  function toggleFilterField(key, checked) {
    setEnabledColumnFilters((current) => ({
      ...current,
      [key]: checked,
    }));
    setCurrentPage(1);
  }

  function clearColumnFilters() {
    setColumnFilters({});
    setEnabledColumnFilters({});
    setShowFilters(false);
    setCurrentPage(1);
  }

  function handleSendWhatsappMessage() {
    window.alert(
      `Send Whatsapp message selected for ${selectedRowKeys.length} record${
        selectedRowKeys.length === 1 ? "" : "s"
      }`
    );
    setShowRowActions(false);
  }

  return (
    <section className="table-panel enhanced-records-panel">
      <div className="records-toolbar">
        <div className="table-search records-search">
          <Search size={18} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="records-toolbar-controls">
          {selectedRowKeys.length > 0 && (
            <div className="records-bulk-action-wrap">
              <button
                type="button"
                className="records-bulk-action-button"
                onClick={() => setShowRowActions((current) => !current)}
              >
                Actions
                <ChevronDown size={16} />
              </button>
              {showRowActions && (
                <div className="records-bulk-action-menu">
                  <button type="button" onClick={handleSendWhatsappMessage}>
                    <MessageCircle size={16} />
                    Send Whatsapp message
                  </button>
                </div>
              )}
            </div>
          )}

          <span className="records-total-count">
            Total: <strong>{filteredData.length}</strong>
          </span>

          <label className="records-page-size-control">
            <select
              value={recordsPerPage}
              onChange={(event) => {
                setRecordsPerPage(Number(event.target.value));
                setCurrentPage(1);
              }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} Records Per Page
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>

          <span className="records-page-range">
            {sortedData.length === 0 ? 0 : pageStartIndex + 1} - {pageEndIndex}
          </span>

          <button
            type="button"
            className="records-page-arrow"
            title="Previous page"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            className="records-page-arrow"
            title="Next page"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-box">{loadingText}</div>
      ) : (
        <div className={showFilters ? "records-table-layout filters-open" : "records-table-layout"}>
          {showFilters && (
            <aside className="records-filter-sidebar">
              <div className="records-filter-section">
                <h4>Filter By Fields</h4>
                <div className="records-filter-list">
                  {columns
                    .filter((column) => column.actions !== false)
                    .map((column) => (
                      <div className="records-filter-field" key={column.key}>
                        <label className="records-filter-check">
                          <input
                            type="checkbox"
                            checked={Boolean(enabledColumnFilters[column.key])}
                            onChange={(event) =>
                              toggleFilterField(column.key, event.target.checked)
                            }
                          />
                          <span>{column.label}</span>
                        </label>
                        {enabledColumnFilters[column.key] && (
                          <div className="records-filter-controls">
                            <select value="contains" disabled>
                              <option value="contains">contains</option>
                            </select>
                            <input
                              type="text"
                              value={columnFilters[column.key] || ""}
                              placeholder={column.label}
                              onChange={(event) => updateColumnFilter(column.key, event.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
              <button type="button" className="light-button records-clear-filters" onClick={clearColumnFilters}>
                Clear Filters
              </button>
            </aside>
          )}

        <div className="table-wrapper" ref={menuRootRef}>
          <table className="classic-table enhanced-records-table">
            <thead>
              <tr>
                <th className="records-select-column">
                  <input
                    type="checkbox"
                    className="records-row-checkbox"
                    checked={allDisplayedRowsSelected}
                    disabled={displayedRowKeys.length === 0}
                    onChange={toggleDisplayedRows}
                    aria-label={
                      allDisplayedRowsSelected
                        ? "Unselect visible records"
                        : "Select visible records"
                    }
                  />
                </th>
                {orderedVisibleColumns.map((column) => (
                  <th key={column.key}>
                    <div className="records-column-head">
                      <span>{column.label}</span>
                      {column.actions !== false && (
                        <button
                          type="button"
                          className="records-column-menu-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveColumnMenu((current) =>
                              current === column.key ? null : column.key
                            );
                            setShowColumnManager(false);
                          }}
                          title={`${column.label} options`}
                        >
                          <Menu size={15} />
                        </button>
                      )}

                      {activeColumnMenu === column.key && (
                        <div className="records-column-menu">
                          <button type="button" onClick={() => sortByColumn(column.key, "asc")}>
                            <ArrowUp size={16} />
                            Asc
                          </button>
                          <button type="button" onClick={() => sortByColumn(column.key, "desc")}>
                            <ArrowDown size={16} />
                            Desc
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowFilters(true);
                              toggleFilterField(column.key, true);
                              setActiveColumnMenu(null);
                            }}
                          >
                            <Filter size={16} />
                            Filter by
                          </button>
                          {column.hideable !== false && (
                            <button type="button" onClick={() => togglePinnedColumn(column.key)}>
                              <Pin size={16} />
                              {pinnedColumnKeys.includes(column.key) ? "Unpin Column" : "Pin Column"}
                            </button>
                          )}
                          {column.hideable !== false && (
                            <button type="button" onClick={() => toggleColumn(column.key)}>
                              <EyeOff size={16} />
                              Hide Column
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                ))}
                <th className="records-header-column-manager">
                  <button
                    type="button"
                    className="records-column-menu-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowColumnManager((current) => !current);
                      setActiveColumnMenu(null);
                    }}
                    title="Manage columns"
                  >
                    <SlidersHorizontal size={15} />
                  </button>

                  {showColumnManager && (
                    <div className="records-column-menu records-manage-columns">
                      <h4>Manage Columns</h4>
                      {columns
                        .filter((columnItem) => hideableKeys.includes(columnItem.key))
                        .map((columnItem) => (
                          <label key={columnItem.key}>
                            <input
                              type="checkbox"
                              checked={visibleColumnKeys.includes(columnItem.key)}
                              onChange={() => toggleColumn(columnItem.key)}
                            />
                            <span>{columnItem.label}</span>
                          </label>
                        ))}
                    </div>
                  )}
                </th>
              </tr>
            </thead>

            <tbody>
              {displayedData.length === 0 ? (
                <tr>
                  <td colSpan={orderedVisibleColumns.length + 2} className="empty-table">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                displayedData.map((record) => (
                  <tr
                    key={rowKey(record)}
                    className={[
                      getRowClassName ? getRowClassName(record) : "",
                      selectedRowKeys.includes(String(rowKey(record))) ? "selected-row" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={onRowClick ? () => onRowClick(record) : undefined}
                  >
                    <td className="records-select-column">
                      <input
                        type="checkbox"
                        className="records-row-checkbox"
                        checked={selectedRowKeys.includes(String(rowKey(record)))}
                        onChange={() => toggleRowSelection(record)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Select record"
                      />
                    </td>
                    {orderedVisibleColumns.map((column) => (
                      <td key={column.key}>{column.render ? column.render(record) : record[column.key]}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </section>
  );
}
