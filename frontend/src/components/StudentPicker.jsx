import { useEffect, useMemo, useState } from "react";

function getStudentName(student) {
  if (!student) return "-";

  const name =
    student.student_name ||
    student.name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unknown Student";

  return student.admission_no ? `${student.admission_no} - ${name}` : name;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

export default function StudentPicker({
  students,
  value,
  onChange,
  name = "student_id",
  required = true,
  label = "Student *",
}) {
  const selectedStudent = students.find((student) => String(student.id) === String(value));
  const [classFilter, setClassFilter] = useState(selectedStudent?.class_name || "");
  const [sectionFilter, setSectionFilter] = useState(selectedStudent?.section || "");

  useEffect(() => {
    if (selectedStudent) {
      setClassFilter(selectedStudent.class_name || "");
      setSectionFilter(selectedStudent.section || "");
    }
  }, [selectedStudent?.id]);

  const classOptions = useMemo(
    () => uniqueValues(students.map((student) => student.class_name)),
    [students]
  );

  const sectionOptions = useMemo(() => {
    return uniqueValues(
      students
        .filter((student) => !classFilter || student.class_name === classFilter)
        .map((student) => student.section)
    );
  }, [classFilter, students]);

  const filteredStudents = students.filter((student) => {
    const matchClass = classFilter ? student.class_name === classFilter : true;
    const matchSection = sectionFilter ? student.section === sectionFilter : true;
    return matchClass && matchSection;
  });

  function emitStudentChange(nextValue) {
    onChange({ target: { name, value: nextValue } });
  }

  function handleClassChange(event) {
    setClassFilter(event.target.value);
    setSectionFilter("");
    emitStudentChange("");
  }

  function handleSectionChange(event) {
    setSectionFilter(event.target.value);
    emitStudentChange("");
  }

  return (
    <>
      <div className="form-field">
        <label>Class</label>
        <select value={classFilter} onChange={handleClassChange}>
          <option value="">All Classes</option>
          {classOptions.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>Section</label>
        <select value={sectionFilter} onChange={handleSectionChange}>
          <option value="">All Sections</option>
          {sectionOptions.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>{label}</label>
        <select
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={students.length > 0 && filteredStudents.length === 0}
        >
          <option value="">Select Student</option>
          {filteredStudents.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentName(student)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
