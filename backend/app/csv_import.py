import csv
import io

from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse


def csv_template_response(columns: list[str], example_row: dict, filename: str) -> StreamingResponse:
    """A one-row example CSV for a bulk-import template download."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns)
    writer.writeheader()
    writer.writerow(example_row)
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def read_csv_upload(file: UploadFile, allowed_columns: list[str]):
    """Parses an uploaded CSV into (rows, unknown_columns).

    rows is a list of (row_index, cleaned_dict) pairs — row_index matches
    what a spreadsheet user sees (header is row 1), cleaned_dict keeps only
    allowed_columns and turns blank cells into None.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or missing a header row")

    unknown_columns = [c for c in reader.fieldnames if c not in allowed_columns]

    rows = []
    for row_index, row in enumerate(reader, start=2):
        cleaned = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k in allowed_columns}
        cleaned = {k: (v if v else None) for k, v in cleaned.items()}
        rows.append((row_index, cleaned))

    return rows, unknown_columns
