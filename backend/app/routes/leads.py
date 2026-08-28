from fastapi import APIRouter, HTTPException, Request

from app import schemas
from app.mailer import send_email
from app.rate_limit import check_login_allowed, login_keys, record_login_failure

router = APIRouter(prefix="/leads", tags=["Leads"])

DEMO_REQUEST_TO = "info@schoolment.com"
DEMO_REQUEST_CC = "debabrattaj@gmail.com"

DEMO_REQUEST_SUCCESS_MESSAGE = (
    "Thanks! Our team will reach out within 1 business day."
)


@router.post("/", response_model=schemas.DemoRequestResponse)
def submit_demo_request(payload: schemas.DemoRequestCreate, request: Request):
    """Unauthenticated endpoint backing the "Book a demo" form on the public
    marketing site (schoolment.com). Same rate-limit + honeypot pattern as
    /admissions/public. No DB write — this is an email-only lead notice sent
    to the sales inbox, cc'd to the site owner.
    """
    keys = login_keys(
        request.client.host if request.client else None,
        payload.email,
    )
    retry_after = check_login_allowed(keys)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    record_login_failure(keys)

    # Honeypot: real users never see or fill this field. Pretend success so
    # bots don't learn to leave it blank, but skip the actual email.
    if (payload.website or "").strip():
        return schemas.DemoRequestResponse(message=DEMO_REQUEST_SUCCESS_MESSAGE)

    required = {
        "Full name": payload.name,
        "School name": payload.school,
        "Work email": payload.email,
    }
    missing = [label for label, value in required.items() if not (value or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")

    name = payload.name.strip()
    school = payload.school.strip()
    city = (payload.city or "").strip()
    student_count = (payload.student_count or "").strip()
    current_system = (payload.current_system or "").strip()
    email = payload.email.strip()
    phone = (payload.phone or "").strip()
    message = (payload.message or "").strip()
    page_url = (payload.page_url or "").strip()

    body_lines = [
        f"Name: {name}",
        f"School: {school}",
        f"Email: {email}",
        f"Phone: {phone or '-'}",
        f"Student count: {student_count or '-'}",
        f"Current system: {current_system or '-'}",
    ]
    # The demo form no longer asks for City, so this would be a permanent
    # "City: -" line. Kept read-and-render for any client that still sends
    # one (a cached page, the Zoho widget), but only when it has a value.
    if city:
        body_lines.insert(2, f"City: {city}")
    if message:
        body_lines.append(f"Message: {message}")
    if page_url:
        body_lines.append(f"Submitted from: {page_url}")
    # Not shown on the form or in the API response -- read straight off the
    # request like every other IP capture in this codebase (rate limiting,
    # login audit rows, portal action logs). Included here only so sales can
    # spot obvious bot/spam patterns; never geolocated or sent to a third
    # party. See privacy-and-security/index.html's "What we collect".
    submitter_ip = request.client.host if request.client else None
    if submitter_ip:
        body_lines.append(f"Submitted from IP: {submitter_ip}")

    send_email(
        to=DEMO_REQUEST_TO,
        cc=DEMO_REQUEST_CC,
        subject=f"New demo request — {school}",
        body="\n".join(body_lines),
    )

    return schemas.DemoRequestResponse(message=DEMO_REQUEST_SUCCESS_MESSAGE)
