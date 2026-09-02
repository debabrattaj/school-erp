"""SCORM runtime: the player page, the content files, and the commit endpoint.

Why the player lives on the API rather than in the React app: a SCO finds
the LMS by walking up from its own window to `window.parent.API` (SCORM 1.2)
or `window.parent.API_1484_11` (2004). The same-origin policy blocks that
lookup across origins, and the admin app and this API are on different
origins in every deployment this project has. So the page that defines the
API object is served from here, next to the extracted content, and the
portal simply opens it.

Authentication is by short-lived launch token rather than the usual bearer
header: an <iframe> and the subresource requests inside it (images, CSS, the
SCO's own scripts) cannot carry an Authorization header. The token is minted
by the portal for one student and one package, and every runtime call
carries it.
"""

import html
import json
import mimetypes
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import scorm_storage, schemas
from app.database import get_db
from app.listing import apply_listing
from app.models import CourseLesson, ScormAttempt, ScormPackage, Student, Teacher, User
from app.security import ALGORITHM, SECRET_KEY, require_roles
from app.tenant import get_account_code_from_request, require_feature

router = APIRouter(prefix="/scorm", tags=["SCORM"])

MANAGERS = ["Admin", "Principal", "Teacher"]

# Long enough for a lesson, short enough that a leaked URL is not a standing
# grant. The runtime refuses to save once it expires, and the portal mints a
# new one on the next launch.
LAUNCH_TOKEN_MINUTES = int(os.getenv("SCORM_LAUNCH_TOKEN_MINUTES", "180"))

COMPLETED_STATUSES = ("completed", "passed")
VALID_STATUSES = (
    "not attempted", "browsed", "incomplete", "completed", "passed", "failed",
)


def create_launch_token(student_id: int, package_id: int, account_code: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=LAUNCH_TOKEN_MINUTES)
    return jwt.encode(
        {
            "scope": "scorm-launch",
            "student_id": student_id,
            "package_id": package_id,
            "account": account_code,
            "exp": expire,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _decode_launch_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="This launch link has expired.")
    # A normal login token must not double as a launch token: it would let
    # any signed-in user drive another student's attempt.
    if payload.get("scope") != "scorm-launch":
        raise HTTPException(status_code=401, detail="Invalid launch token.")
    return payload


def _parse_cmi_time(value: str) -> int:
    """SCORM session_time to whole seconds.

    1.2 sends HHHH:MM:SS.SS; 2004 sends an ISO-8601 duration (PT1H2M3S).
    Anything unparseable counts as zero rather than raising -- a malformed
    duration from one content package must not cost the learner their score.
    """
    if not value:
        return 0
    value = value.strip()
    try:
        if value.upper().startswith("P"):
            body = value[1:].upper()
            time_part = body.split("T", 1)[1] if "T" in body else ""
            seconds = 0.0
            number = ""
            for char in time_part:
                if char.isdigit() or char == ".":
                    number += char
                    continue
                if not number:
                    continue
                amount = float(number)
                number = ""
                if char == "H":
                    seconds += amount * 3600
                elif char == "M":
                    seconds += amount * 60
                elif char == "S":
                    seconds += amount
            return int(seconds)

        parts = value.split(":")
        if len(parts) != 3:
            return 0
        hours, minutes, secs = parts
        return int(int(hours) * 3600 + int(minutes) * 60 + float(secs))
    except (TypeError, ValueError):
        return 0


def _normalise_status(raw: str, package: ScormPackage, score) -> str:
    """Fold both versions' vocabularies onto SCORM 1.2's lesson_status.

    2004 splits "did they finish" (completion_status) from "did they pass"
    (success_status); 1.2 has one field for both. Storing one column means
    reporting does not have to know which version a package was authored in.
    """
    status = (raw or "").strip().lower()
    if status in VALID_STATUSES:
        resolved = status
    elif status == "not_attempted":
        resolved = "not attempted"
    elif status == "unknown":
        resolved = "incomplete"
    else:
        resolved = "incomplete"

    # A package with a mastery score that reports completion without a
    # verdict gets one worked out here, which is what 1.2 expects of an LMS.
    if resolved == "completed" and package.mastery_score is not None and score is not None:
        resolved = "passed" if score >= package.mastery_score else "failed"
    return resolved


def _attempt_state(attempt: ScormAttempt) -> dict:
    return {
        "lesson_status": attempt.lesson_status,
        "lesson_location": attempt.lesson_location or "",
        "suspend_data": attempt.suspend_data or "",
        "score_raw": attempt.score_raw,
        "score_min": attempt.score_min,
        "score_max": attempt.score_max,
        "total_time_seconds": attempt.total_time_seconds or 0,
    }


def get_or_create_attempt(db: Session, package: ScormPackage, student: Student) -> ScormAttempt:
    attempt = (
        db.query(ScormAttempt)
        .filter(
            ScormAttempt.package_id == package.id,
            ScormAttempt.student_id == student.id,
        )
        .first()
    )
    if attempt:
        return attempt

    attempt = ScormAttempt(
        package_id=package.id,
        student_id=student.id,
        student_name_snapshot=f"{student.first_name} {student.last_name or ''}".strip(),
        lesson_status="not attempted",
        started_at=datetime.utcnow(),
        last_accessed_at=datetime.utcnow(),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


class ScormCommitRequest(BaseModel):
    lesson_status: str | None = None
    lesson_location: str | None = None
    suspend_data: str | None = None
    score_raw: float | None = None
    score_min: float | None = None
    score_max: float | None = None
    session_time: str | None = None
    # True on LMSFinish/Terminate: the run is over, so the session counter
    # ticks. A plain LMSCommit mid-lesson must not inflate it.
    finished: bool = False


def _load_for_token(db: Session, request: Request, token: str):
    payload = _decode_launch_token(token)

    # The token names its tenant, and the request resolves its own. A token
    # minted for one school must not drive a package in another, even if the
    # ids happen to line up.
    account_code = get_account_code_from_request(request) or "default"
    if payload.get("account") != account_code:
        raise HTTPException(status_code=401, detail="Invalid launch token.")

    package = (
        db.query(ScormPackage).filter(ScormPackage.id == payload["package_id"]).first()
    )
    if not package:
        raise HTTPException(status_code=404, detail="Course content not found")

    student = db.query(Student).filter(Student.id == payload["student_id"]).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return package, student, account_code


@router.get("/play", response_class=HTMLResponse, dependencies=[Depends(require_feature("scorm"))])
def scorm_player(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    """The page that is the LMS, as far as the content is concerned."""
    package, student, account_code = _load_for_token(db, request, token)
    attempt = get_or_create_attempt(db, package, student)

    content_url = f"../scorm/content/{package.storage_key}/{package.launch_url}"
    state = json.dumps(_attempt_state(attempt))
    learner_name = json.dumps(
        f"{student.last_name or ''}, {student.first_name}".strip(", ")
    )

    # The runtime is inlined rather than served as a static asset so the
    # player is one request with no cache to invalidate when it changes.
    page = _PLAYER_HTML.format(
        title=html.escape(package.title),
        scorm_version=package.scorm_version,
        content_url=html.escape(content_url, quote=True),
        state_json=state,
        learner_id=student.id,
        learner_name=learner_name,
        token=html.escape(token, quote=True),
    )
    return HTMLResponse(page)


@router.post("/commit", dependencies=[Depends(require_feature("scorm"))])
def scorm_commit(
    request: Request,
    token: str,
    payload: ScormCommitRequest,
    db: Session = Depends(get_db),
):
    """Persist what the content reported. Called on LMSCommit and LMSFinish."""
    package, student, _ = _load_for_token(db, request, token)
    attempt = get_or_create_attempt(db, package, student)

    if payload.score_raw is not None:
        attempt.score_raw = payload.score_raw
    if payload.score_min is not None:
        attempt.score_min = payload.score_min
    if payload.score_max is not None:
        attempt.score_max = payload.score_max
    if payload.lesson_location is not None:
        attempt.lesson_location = payload.lesson_location
    if payload.suspend_data is not None:
        attempt.suspend_data = payload.suspend_data

    if payload.lesson_status:
        attempt.lesson_status = _normalise_status(
            payload.lesson_status, package, attempt.score_raw
        )

    session_seconds = _parse_cmi_time(payload.session_time or "")
    if session_seconds:
        attempt.total_time_seconds = (attempt.total_time_seconds or 0) + session_seconds

    if payload.finished:
        attempt.session_count = (attempt.session_count or 0) + 1

    # Stamped once, the first time it is finished: a learner who reopens a
    # completed package should not have their completion date move.
    if attempt.lesson_status in COMPLETED_STATUSES and not attempt.completed_at:
        attempt.completed_at = datetime.utcnow()

    attempt.last_accessed_at = datetime.utcnow()
    db.commit()
    db.refresh(attempt)

    # Course progress is derived from attempts, so a SCORM lesson inside a
    # course ticks over the moment the content says it is done.
    from app.routes import courses as course_routes

    course_routes.sync_scorm_lesson_progress(db, package.id, student.id)

    return {"saved": True, **_attempt_state(attempt)}


@router.get("/content/{storage_key}/{file_path:path}", dependencies=[Depends(require_feature("scorm"))])
def scorm_content(
    request: Request,
    storage_key: str,
    file_path: str,
    db: Session = Depends(get_db),
):
    """Serve one file from an extracted package.

    Not a StaticFiles mount: this checks the storage_key belongs to a package
    in *this* tenant's database before serving, so one school cannot read
    another's content by holding a key. Path traversal is refused in
    scorm_storage.content_path.
    """
    package = (
        db.query(ScormPackage).filter(ScormPackage.storage_key == storage_key).first()
    )
    if not package:
        raise HTTPException(status_code=404, detail="Course content not found")

    account_code = get_account_code_from_request(request) or "default"
    absolute = scorm_storage.content_path(account_code, storage_key, file_path)
    if not absolute:
        raise HTTPException(status_code=404, detail="File not found")

    media_type, _ = mimetypes.guess_type(absolute)
    return FileResponse(absolute, media_type=media_type or "application/octet-stream")


# The SCORM 1.2 and 2004 APIs, thin on purpose: values are held in memory and
# flushed to /scorm/commit on LMSCommit, LMSFinish, and page unload. Content
# calls LMSSetValue far too often for a request per call to be sane.
_PLAYER_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #0f172a; color: #e2e8f0;
    font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }}
  header {{ display: flex; align-items: center; gap: 12px; padding: 10px 16px; }}
  header h1 {{ font-size: 15px; margin: 0; font-weight: 600; }}
  #status {{ margin-left: auto; font-size: 12px; opacity: .75; }}
  iframe {{ display: block; width: 100%; height: calc(100% - 44px); border: 0; background: #fff; }}
</style>
</head>
<body>
<header>
  <h1>{title}</h1>
  <span id="status">Loading…</span>
</header>
<iframe id="sco" src="{content_url}" title="{title}"
        allow="autoplay; fullscreen; microphone; camera"></iframe>
<script>
(function () {{
  var TOKEN = "{token}";
  var VERSION = "{scorm_version}";
  var state = {state_json};
  var learnerId = "{learner_id}";
  var learnerName = {learner_name};

  var statusEl = document.getElementById("status");
  function note(text) {{ statusEl.textContent = text; }}

  // Written by the content, read by us on flush.
  var data = {{
    "cmi.core.lesson_status": state.lesson_status === "not attempted" ? "incomplete" : state.lesson_status,
    "cmi.core.lesson_location": state.lesson_location,
    "cmi.suspend_data": state.suspend_data,
    "cmi.core.score.raw": state.score_raw == null ? "" : String(state.score_raw),
    "cmi.core.score.min": state.score_min == null ? "" : String(state.score_min),
    "cmi.core.score.max": state.score_max == null ? "" : String(state.score_max),
    "cmi.core.session_time": "",
    "cmi.core.student_id": learnerId,
    "cmi.core.student_name": learnerName,
    "cmi.core.entry": state.lesson_status === "not attempted" ? "ab-initio" : "resume",
    "cmi.core.credit": "credit",
    "cmi.core.lesson_mode": "normal"
  }};

  // 2004 names the same things differently. Reads and writes are mapped onto
  // the 1.2 keys above so only one shape is ever sent to the server.
  var MAP_2004 = {{
    "cmi.completion_status": "cmi.core.lesson_status",
    "cmi.success_status": "cmi.core.lesson_status",
    "cmi.location": "cmi.core.lesson_location",
    "cmi.score.raw": "cmi.core.score.raw",
    "cmi.score.min": "cmi.core.score.min",
    "cmi.score.max": "cmi.core.score.max",
    "cmi.session_time": "cmi.core.session_time",
    "cmi.learner_id": "cmi.core.student_id",
    "cmi.learner_name": "cmi.core.student_name",
    "cmi.entry": "cmi.core.entry",
    "cmi.credit": "cmi.core.credit",
    "cmi.mode": "cmi.core.lesson_mode"
  }};

  function key(name) {{ return MAP_2004[name] || name; }}

  var lastError = "0";
  var startedAt = Date.now();
  var finished = false;

  function elapsedCmiTime() {{
    var total = Math.floor((Date.now() - startedAt) / 1000);
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    function pad(n) {{ return (n < 10 ? "0" : "") + n; }}
    return pad(h) + ":" + pad(m) + ":" + pad(s);
  }}

  function flush(isFinish) {{
    var body = {{
      lesson_status: data["cmi.core.lesson_status"],
      lesson_location: data["cmi.core.lesson_location"],
      suspend_data: data["cmi.suspend_data"],
      score_raw: data["cmi.core.score.raw"] === "" ? null : parseFloat(data["cmi.core.score.raw"]),
      score_min: data["cmi.core.score.min"] === "" ? null : parseFloat(data["cmi.core.score.min"]),
      score_max: data["cmi.core.score.max"] === "" ? null : parseFloat(data["cmi.core.score.max"]),
      session_time: data["cmi.core.session_time"] || elapsedCmiTime(),
      finished: !!isFinish
    }};
    var url = "../scorm/commit?token=" + encodeURIComponent(TOKEN);

    // On unload only sendBeacon survives the page going away; fetch is
    // cancelled mid-flight and the last few minutes of work are lost.
    if (isFinish && navigator.sendBeacon) {{
      var blob = new Blob([JSON.stringify(body)], {{ type: "application/json" }});
      if (navigator.sendBeacon(url, blob)) {{ note("Saved"); return true; }}
    }}
    try {{
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, !isFinish);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onload = function () {{ note(xhr.status < 300 ? "Saved" : "Not saved"); }};
      xhr.send(JSON.stringify(body));
      return true;
    }} catch (e) {{
      note("Not saved");
      return false;
    }}
  }}

  var API = {{
    LMSInitialize: function () {{ startedAt = Date.now(); lastError = "0"; note("Connected"); return "true"; }},
    LMSFinish: function () {{
      if (!finished) {{ finished = true; data["cmi.core.session_time"] = elapsedCmiTime(); flush(true); }}
      return "true";
    }},
    LMSGetValue: function (name) {{
      lastError = "0";
      var value = data[key(name)];
      return value == null ? "" : String(value);
    }},
    LMSSetValue: function (name, value) {{
      lastError = "0";
      var target = key(name);
      // 2004 splits pass/fail from done/not-done across two elements; 1.2
      // has one. "unknown" from either must not wipe a real verdict.
      if (String(value).toLowerCase() === "unknown") return "true";
      data[target] = value;
      note("Unsaved changes");
      return "true";
    }},
    LMSCommit: function () {{ flush(false); return "true"; }},
    LMSGetLastError: function () {{ return lastError; }},
    LMSGetErrorString: function () {{ return lastError === "0" ? "No error" : "Error"; }},
    LMSGetDiagnostic: function () {{ return ""; }}
  }};

  // 2004 renames every method; the behaviour is identical.
  var API_1484_11 = {{
    Initialize: API.LMSInitialize, Terminate: API.LMSFinish,
    GetValue: API.LMSGetValue, SetValue: API.LMSSetValue,
    Commit: API.LMSCommit, GetLastError: API.LMSGetLastError,
    GetErrorString: API.LMSGetErrorString, GetDiagnostic: API.LMSGetDiagnostic
  }};

  // Both are exposed whatever the manifest said: authoring tools mislabel
  // their own output often enough that refusing the other one strands
  // content that would otherwise run perfectly.
  window.API = API;
  window.API_1484_11 = API_1484_11;

  window.addEventListener("beforeunload", function () {{
    if (!finished) {{ finished = true; data["cmi.core.session_time"] = elapsedCmiTime(); flush(true); }}
  }});

  note(VERSION === "2004" ? "SCORM 2004 ready" : "SCORM 1.2 ready");
}})();
</script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Package management (staff)
# ---------------------------------------------------------------------------


def _package_response(db: Session, package: ScormPackage) -> schemas.ScormPackageResponse:
    payload = schemas.ScormPackageResponse.model_validate(package)
    attempts = (
        db.query(ScormAttempt).filter(ScormAttempt.package_id == package.id).all()
    )
    payload.attempt_count = len(attempts)
    payload.completed_count = sum(
        1 for a in attempts if a.lesson_status in COMPLETED_STATUSES
    )
    return payload


@router.get(
    "/packages",
    response_model=list[schemas.ScormPackageResponse],
    dependencies=[Depends(require_feature("scorm"))],
)
def list_packages(
    class_name: str | None = None,
    section: str | None = None,
    subject: str | None = None,
    status: str | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(ScormPackage)
    if class_name:
        query = query.filter(ScormPackage.class_name == class_name)
    if section:
        query = query.filter(ScormPackage.section == section)
    if subject:
        query = query.filter(ScormPackage.subject == subject)
    if status:
        query = query.filter(ScormPackage.status == status)

    packages = apply_listing(
        query, ScormPackage,
        search=search, search_fields=("title", "description", "subject", "class_name"),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[ScormPackage.created_at.desc(), ScormPackage.id.desc()],
    ).all()
    return [_package_response(db, package) for package in packages]


@router.post(
    "/packages",
    response_model=schemas.ScormPackageResponse,
    dependencies=[Depends(require_feature("scorm"))],
)
async def upload_package(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    class_name: str = Form(...),
    section: str | None = Form(None),
    subject: str | None = Form(None),
    academic_year: str | None = Form(None),
    description: str | None = Form(None),
    teacher_id: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Upload and unpack a SCORM zip.

    Multipart rather than JSON because the package is the payload; the
    metadata rides alongside it so a teacher does not have to create a row
    and then upload into it.
    """
    if not title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if not class_name.strip():
        raise HTTPException(status_code=400, detail="Class is required")

    filename = (file.filename or "").lower()
    if not filename.endswith(".zip"):
        raise HTTPException(
            status_code=400, detail="A SCORM package is a .zip file."
        )

    contents = await file.read()
    account_code = get_account_code_from_request(request) or "default"
    try:
        manifest = scorm_storage.store_package(account_code, contents)
    except scorm_storage.ScormError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    package = ScormPackage(
        title=title.strip(),
        description=description,
        class_name=class_name.strip(),
        section=(section or "").strip() or None,
        subject=(subject or "").strip() or None,
        academic_year=(academic_year or "").strip() or None,
        scorm_version=manifest["scorm_version"],
        manifest_identifier=manifest["identifier"],
        launch_url=manifest["launch_url"],
        storage_key=manifest["storage_key"],
        package_bytes=manifest["package_bytes"],
        mastery_score=manifest["mastery_score"],
        teacher_id=teacher_id,
        created_by=current_user.name,
    )
    if teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
        package.teacher_name_snapshot = teacher.name if teacher else None

    db.add(package)
    db.commit()
    db.refresh(package)
    return _package_response(db, package)


def _get_package_or_404(db: Session, package_id: int) -> ScormPackage:
    package = db.query(ScormPackage).filter(ScormPackage.id == package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return package


@router.get(
    "/packages/{package_id}",
    response_model=schemas.ScormPackageResponse,
    dependencies=[Depends(require_feature("scorm"))],
)
def get_package(
    package_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return _package_response(db, _get_package_or_404(db, package_id))


@router.put(
    "/packages/{package_id}",
    response_model=schemas.ScormPackageResponse,
    dependencies=[Depends(require_feature("scorm"))],
)
def update_package(
    package_id: int,
    payload: schemas.ScormPackageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    package = _get_package_or_404(db, package_id)
    update_data = payload.model_dump(exclude_unset=True)

    status = update_data.get("status")
    if status is not None and status not in ("Draft", "Published", "Archived"):
        raise HTTPException(
            status_code=400, detail="Status must be Draft, Published or Archived."
        )

    was_published = package.status == "Published"
    for key, value in update_data.items():
        setattr(package, key, value)
    if "teacher_id" in update_data:
        teacher = (
            db.query(Teacher).filter(Teacher.id == package.teacher_id).first()
            if package.teacher_id else None
        )
        package.teacher_name_snapshot = teacher.name if teacher else None
    if package.status == "Published" and not was_published and not package.published_at:
        package.published_at = datetime.utcnow()

    db.commit()
    db.refresh(package)
    return _package_response(db, package)


@router.delete("/packages/{package_id}", dependencies=[Depends(require_feature("scorm"))])
def delete_package(
    package_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    package = _get_package_or_404(db, package_id)

    in_use = (
        db.query(CourseLesson)
        .filter(CourseLesson.scorm_package_id == package_id)
        .count()
    )
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f"This package is used by {in_use} course lesson(s). Remove those first.",
        )

    account_code = get_account_code_from_request(request) or "default"
    storage_key = package.storage_key

    db.delete(package)
    db.commit()
    # Files go only after the row does: an orphaned directory wastes disk, an
    # orphaned row serves 404s to learners mid-course.
    scorm_storage.delete_package(account_code, storage_key)
    return {"message": "Package deleted successfully"}


@router.get("/packages/{package_id}/progress", dependencies=[Depends(require_feature("scorm"))])
def package_progress(
    package_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Who has run this package, how far, and for how long."""
    package = _get_package_or_404(db, package_id)

    students = (
        db.query(Student)
        .filter(
            Student.class_name == package.class_name,
            (Student.student_status == "Active") | (Student.student_status.is_(None)),
        )
    )
    if package.section:
        students = students.filter(Student.section == package.section)
    roster = students.order_by(Student.roll_no, Student.id).all()

    attempts = {
        attempt.student_id: attempt
        for attempt in db.query(ScormAttempt)
        .filter(ScormAttempt.package_id == package_id)
        .all()
    }

    rows = []
    for student in roster:
        attempt = attempts.get(student.id)
        rows.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.last_name or ''}".strip(),
            "admission_no": student.admission_no,
            "lesson_status": attempt.lesson_status if attempt else "not attempted",
            "score_raw": attempt.score_raw if attempt else None,
            "total_time_seconds": attempt.total_time_seconds if attempt else 0,
            "session_count": attempt.session_count if attempt else 0,
            "last_accessed_at": attempt.last_accessed_at if attempt else None,
            "completed_at": attempt.completed_at if attempt else None,
        })

    return {
        "package": _package_response(db, package),
        "total_students": len(roster),
        "completed_count": sum(
            1 for row in rows if row["lesson_status"] in COMPLETED_STATUSES
        ),
        "rows": rows,
    }
