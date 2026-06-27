import sqlite3
from pathlib import Path

DB_PATH = Path("school_erp.db")

if not DB_PATH.exists():
    raise FileNotFoundError(f"Database not found: {DB_PATH.resolve()}")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(marks)")
existing_columns = {row[1] for row in cursor.fetchall()}

columns_to_add = {
    "class_subject_id": "INTEGER",
    "subject_name": "TEXT",
    "max_marks": "FLOAT DEFAULT 100",
    "total_marks": "FLOAT DEFAULT 100",
}

for column_name, column_type in columns_to_add.items():
    if column_name not in existing_columns:
        sql = f"ALTER TABLE marks ADD COLUMN {column_name} {column_type}"
        print("Running:", sql)
        cursor.execute(sql)
    else:
        print(f"Already exists: {column_name}")

conn.commit()
conn.close()

print("Marks table migration completed successfully.")

