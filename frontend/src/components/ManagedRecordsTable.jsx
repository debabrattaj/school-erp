import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
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

function textFromNode(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join(" ");
  if (isValidElement(node)) return textFromNode(node.props.children);
  return "";
}

function getCells(row) {
  return Children.toArray(row.props.children).filter(
    (child) => isValidElement(child) && child.type === "td"
  );
}

export default function ManagedRecordsTable({
  children,
  emptyText = "No records found.",
  headers,
  loading,
  loadingText = "Loading records...",
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
  const [sortConfig, setSortConfig] = useState({ index: -1, direction: "asc" });
  const [pinnedIndexes, setPinnedIndexes] = useState([]);
  const [visibleIndexes, setVisibleIndexes] = useState(headers.map((_, index) => index));
  const menuRootRef = useRef(null);

  const rows = Children.toArray(children).filter((child) => isValidElement(child));
  const headersSignature = headers.join("\u0001");

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
    setVisibleIndexes(headers.map((_, index) => index));
    setPinnedIndexes([]);
    setActiveColumnMenu(null);
    setShowColumnManager(false);
    setShowFilters(false);
    setColumnFilters({});
    setEnabledColumnFilters({});
    setSortConfig({ index: -1, direction: "asc" });
    setCurrentPage(1);
    setSelectedRowKeys([]);
  }, [headersSignature]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRowKeys([]);
  }, [rows.length]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const cells = getCells(row);
      return headers.every((_, index) => {
        if (!enabledColumnFilters[index]) return true;
        const filterValue = String(columnFilters[index] || "").trim().toLowerCase();
        if (!filterValue) return true;
        return textFromNode(cells[index]).toLowerCase().includes(filterValue);
      });
    });
  }, [columnFilters, enabledColumnFilters, headers, rows]);

  const sortedRows = useMemo(() => {
    if (sortConfig.index < 0) return filteredRows;
    return [...filteredRows].sort((first, second) => {
      const firstText = textFromNode(getCells(first)[sortConfig.index]).toLowerCase();
      const secondText = textFromNode(getCells(second)[sortConfig.index]).toLowerCase();
      return sortConfig.direction === "asc"
        ? firstText.localeCompare(secondText, undefined, { numeric: true })
        : secondText.localeCompare(firstText, undefined, { numeric: true });
    });
  }, [filteredRows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / recordsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * recordsPerPage;
  const pageEndIndex = Math.min(pageStartIndex + recordsPerPage, sortedRows.length);
  const displayedRows = sortedRows.slice(pageStartIndex, pageEndIndex);
  const orderedVisibleIndexes = [
    ...visibleIndexes.filter((index) => pinnedIndexes.includes(index)),
    ...visibleIndexes.filter((index) => !pinnedIndexes.includes(index)),
  ];
  const displayedRowKeys = displayedRows.map((row, index) =>
    String(row.key ?? `${pageStartIndex + index}`)
  );
  const allDisplayedRowsSelected =
    displayedRowKeys.length > 0 &&
    displayedRowKeys.every((key) => selectedRowKeys.includes(key));

  function toggleColumn(index) {
    setVisibleIndexes((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index].sort((first, second) => first - second)
    );
    setActiveColumnMenu(null);
  }

  function togglePinnedColumn(index) {
    setPinnedIndexes((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index]
    );
    setActiveColumnMenu(null);
  }

  function toggleRowSelection(row, index) {
    const key = String(row.key ?? `${pageStartIndex + index}`);
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

  function toggleFilterField(index, checked) {
    setEnabledColumnFilters((current) => ({
      ...current,
      [index]: checked,
    }));
    setCurrentPage(1);
  }

  function updateColumnFilter(index, value) {
    setColumnFilters((current) => ({
      ...current,
      [index]: value,
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
            Total: <strong>{filteredRows.length}</strong>
          </span>
          <label className="records-page-size-control">
            <select
              value={recordsPerPage}
              onChange={(event) => {
                setRecordsPerPage(Number(event.target.value));
                setCurrentPage(1);
              }}
            >
              {[25, 50, 100, 200].map((option) => (
                <option key={option} value={option}>
                  {option} Records Per Page
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          <span className="records-page-range">
            {sortedRows.length === 0 ? 0 : pageStartIndex + 1} - {pageEndIndex}
          </span>
          <button
            type="button"
            className="records-page-arrow"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="records-page-arrow"
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
                  {headers.map((header, index) => (
                    <div className="records-filter-field" key={header}>
                      <label className="records-filter-check">
                        <input
                          type="checkbox"
                          checked={Boolean(enabledColumnFilters[index])}
                          onChange={(event) => toggleFilterField(index, event.target.checked)}
                        />
                        <span>{header}</span>
                      </label>
                      {enabledColumnFilters[index] && (
                        <div className="records-filter-controls">
                          <select value="contains" disabled>
                            <option value="contains">contains</option>
                          </select>
                          <input
                            type="text"
                            value={columnFilters[index] || ""}
                            placeholder={header}
                            onChange={(event) => updateColumnFilter(index, event.target.value)}
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
                {orderedVisibleIndexes.map((index) => {
                  const header = headers[index];
                  return (
                    <th key={header}>
                      <div className="records-column-head">
                        <span>{header}</span>
                        {header !== "Actions" && (
                          <>
                            <button
                              type="button"
                              className="records-column-menu-button"
                              onClick={() =>
                                setActiveColumnMenu((current) => (current === index ? null : index))
                              }
                            >
                              <Menu size={15} />
                            </button>
                            {activeColumnMenu === index && (
                              <div className="records-column-menu">
                                <button type="button" onClick={() => setSortConfig({ index, direction: "asc" })}>
                                  <ArrowUp size={16} /> Asc
                                </button>
                                <button type="button" onClick={() => setSortConfig({ index, direction: "desc" })}>
                                  <ArrowDown size={16} /> Desc
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowFilters(true);
                                    toggleFilterField(index, true);
                                    setActiveColumnMenu(null);
                                  }}
                                >
                                  <Filter size={16} />
                                  Filter by
                                </button>
                                <button type="button" onClick={() => togglePinnedColumn(index)}>
                                  <Pin size={16} /> {pinnedIndexes.includes(index) ? "Unpin Column" : "Pin Column"}
                                </button>
                                <button type="button" onClick={() => toggleColumn(index)}>
                                  <EyeOff size={16} /> Hide Column
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="records-header-column-manager">
                  <button
                    type="button"
                    className="records-column-menu-button"
                    onClick={() => {
                      setShowColumnManager((current) => !current);
                      setActiveColumnMenu(null);
                    }}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                  {showColumnManager && (
                    <div className="records-column-menu records-manage-columns">
                      <h4>Manage Columns</h4>
                      {headers.map((columnHeader, columnIndex) => (
                        <label key={columnHeader}>
                          <input
                            type="checkbox"
                            checked={visibleIndexes.includes(columnIndex)}
                            onChange={() => toggleColumn(columnIndex)}
                          />
                          <span>{columnHeader}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={orderedVisibleIndexes.length + 2} className="empty-table">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                displayedRows.map((row, rowIndex) => {
                  const cells = getCells(row);
                  const rowSelectionKey = String(row.key ?? `${pageStartIndex + rowIndex}`);
                  return (
                    <tr
                      key={row.key}
                      className={selectedRowKeys.includes(rowSelectionKey) ? "selected-row" : undefined}
                    >
                      <td className="records-select-column">
                        <input
                          type="checkbox"
                          className="records-row-checkbox"
                          checked={selectedRowKeys.includes(rowSelectionKey)}
                          onChange={() => toggleRowSelection(row, rowIndex)}
                          aria-label="Select record"
                        />
                      </td>
                      {orderedVisibleIndexes.map((index) => cells[index])}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </section>
  );
}
