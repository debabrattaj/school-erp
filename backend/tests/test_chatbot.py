"""Covers both chatbot engines:
- the deterministic keyword-matching engine (active in this test env, since
  no ANTHROPIC_API_KEY is set -- ask_rule_based()), and
- the AI tool-calling engine (ai_assistant.py), exercised with fake Anthropic
  clients so no real API key or network call is needed. The critical case is
  the security boundary: every tool call is re-validated against the
  caller's own access, so even a fake "misbehaving" model can't read another
  family's student data.
"""

import uuid
from datetime import date

import pytest

from app import ai_assistant
from app.routes import chatbot


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_student(db, **overrides):
    from app.models import Student
    defaults = dict(
        first_name="Test", last_name="Student",
        admission_no=f"CHAT-{uuid.uuid4().hex[:10]}",
        class_name="ChatbotTest", section="A",
        student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_parent_with_child(db, *children):
    from app.models import ParentStudentLink, User
    from app.security import hash_password

    email = f"chatbot-parent-{uuid.uuid4().hex[:8]}@example.com"
    parent = User(name="A Parent", email=email, password_hash=hash_password("parentpass123"), role="Parent")
    db.add(parent)
    db.commit()
    for child in children:
        db.add(ParentStudentLink(user_id=parent.id, student_id=child.id, relationship="Father"))
    db.commit()
    return parent, email


def _login(client, email, password="parentpass123"):
    resp = client.post("/auth/login", json={"account_code": "default", "email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_no_key_configured_in_this_environment():
    """Documents the assumption every rule-based test below relies on: with
    no ANTHROPIC_API_KEY set, /chatbot/ask uses the deterministic engine."""
    assert chatbot._anthropic_client is None


# --------------------------------------------------------------------------
# Rule-based engine (app.routes.chatbot.ask_rule_based)
# --------------------------------------------------------------------------


def test_ask_requires_auth(client):
    resp = client.post("/chatbot/ask", json={"message": "hello"})
    assert resp.status_code == 401


def test_greeting(client, auth):
    resp = client.post("/chatbot/ask", json={"message": "hello"}, headers=auth)
    assert resp.status_code == 200
    body = resp.json()
    assert "hello" in body["reply"].lower() or "hi" in body["reply"].lower()
    assert body["suggestions"] == chatbot.QUICK_SUGGESTIONS


def test_help_and_empty_message_return_the_same_menu(client, auth):
    empty = client.post("/chatbot/ask", json={"message": ""}, headers=auth).json()
    help_ = client.post("/chatbot/ask", json={"message": "help"}, headers=auth).json()
    assert empty["reply"] == chatbot.HELP_TEXT
    assert help_["reply"] == chatbot.HELP_TEXT


def test_school_and_year_need_no_student(client, auth):
    resp = client.post("/chatbot/ask", json={"message": "what is the school phone number"}, headers=auth)
    assert resp.status_code == 200
    assert "student_id" not in resp.json()


def test_staff_asking_a_student_intent_with_no_name_is_asked_to_clarify(client, auth):
    resp = client.post("/chatbot/ask", json={"message": "attendance"}, headers=auth)
    assert resp.status_code == 200
    body = resp.json()
    assert "which student" in body["reply"].lower()


def test_staff_resolves_student_by_name_and_gets_real_attendance(client, auth, db_session):
    from app.models import Attendance

    student = _make_student(db_session, first_name="Anaya", last_name="Rao")
    db_session.add(Attendance(student_id=student.id, attendance_date=date.today(), status="Present"))
    db_session.commit()

    resp = client.post("/chatbot/ask", json={"message": "attendance of Anaya Rao"}, headers=auth)
    assert resp.status_code == 200
    body = resp.json()
    assert body["student_id"] == student.id
    assert "100.0%" in body["reply"]
    assert body["suggestions"] == chatbot.STUDENT_SUGGESTIONS


def test_parent_with_one_child_is_auto_resolved(client, db_session):
    student = _make_student(db_session, first_name="OnlyKid")
    _, email = _make_parent_with_child(db_session, student)
    parent_auth = _login(client, email)

    resp = client.post("/chatbot/ask", json={"message": "fees pending"}, headers=parent_auth)
    assert resp.status_code == 200
    assert resp.json()["student_id"] == student.id


def test_parent_with_multiple_children_is_offered_a_picker(client, db_session):
    kid1 = _make_student(db_session, first_name="Kid1")
    kid2 = _make_student(db_session, first_name="Kid2")
    _, email = _make_parent_with_child(db_session, kid1, kid2)
    parent_auth = _login(client, email)

    resp = client.post("/chatbot/ask", json={"message": "fees pending"}, headers=parent_auth)
    assert resp.status_code == 200
    body = resp.json()
    ids = {child["id"] for child in body["children"]}
    assert ids == {kid1.id, kid2.id}


def test_parent_cannot_reach_a_childs_data_by_guessing_the_id(client, db_session):
    mine = _make_student(db_session, first_name="Mine")
    theirs = _make_student(db_session, first_name="NotMine")
    _, email = _make_parent_with_child(db_session, mine)
    parent_auth = _login(client, email)

    # student_id chip-pick for a student that isn't linked to this parent
    resp = client.post(
        "/chatbot/ask",
        json={"message": "fees pending", "student_id": theirs.id},
        headers=parent_auth,
    )
    assert resp.status_code == 200
    # falls through to the single-linked-child auto-resolve, not the guessed id
    assert resp.json()["student_id"] == mine.id


# --------------------------------------------------------------------------
# AI tool executor (app.ai_assistant) -- direct unit tests, no network
# --------------------------------------------------------------------------


def test_staff_list_students_requires_a_query(db_session, auth):
    from app.models import User
    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)
    result = ai_assistant.execute_tool("list_students", {}, ctx)
    assert result["error"] == "query_required"


def test_staff_list_students_finds_a_real_student(db_session):
    from app.models import User
    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    student = _make_student(db_session, first_name="Findme", last_name="Please")
    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)

    result = ai_assistant.execute_tool("list_students", {"query": "Findme Please"}, ctx)
    assert result["found"] is True
    assert result["students"][0]["id"] == student.id


def test_parent_scoped_list_students_only_returns_their_own_children(db_session):
    mine = _make_student(db_session, first_name="Mine2")
    _make_student(db_session, first_name="NotMine2")
    parent, _ = _make_parent_with_child(db_session, mine)

    ctx = ai_assistant.ToolContext(db=db_session, user=parent, allowed_ids=[mine.id])
    result = ai_assistant.execute_tool("list_students", {}, ctx)
    assert result["found"] is True
    assert [s["id"] for s in result["students"]] == [mine.id]


def test_set_active_student_rejects_an_out_of_scope_id(db_session):
    mine = _make_student(db_session, first_name="Mine3")
    theirs = _make_student(db_session, first_name="NotMine3")
    parent, _ = _make_parent_with_child(db_session, mine)

    ctx = ai_assistant.ToolContext(db=db_session, user=parent, allowed_ids=[mine.id])
    result = ai_assistant.execute_tool("set_active_student", {"student_id": theirs.id}, ctx)
    assert result["error"] == "not_authorized"
    assert ctx.active_student is None


def test_get_tools_require_an_active_student_first(db_session):
    from app.models import User
    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)
    result = ai_assistant.execute_tool("get_attendance", {}, ctx)
    assert result["error"] == "no_active_student"


def test_get_attendance_after_set_active_student_matches_chatbot_data(db_session):
    from app.models import Attendance, User
    from app import chatbot_data

    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    student = _make_student(db_session, first_name="Attendee")
    db_session.add(Attendance(student_id=student.id, attendance_date=date.today(), status="Present"))
    db_session.commit()

    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)
    ai_assistant.execute_tool("set_active_student", {"student_id": student.id}, ctx)
    result = ai_assistant.execute_tool("get_attendance", {}, ctx)
    assert result["summary"] == chatbot_data.answer_attendance(db_session, student)


def test_school_and_year_tools_need_no_active_student(db_session):
    from app.models import User
    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)
    assert "error" not in ai_assistant.execute_tool("get_school_info", {}, ctx)
    assert "error" not in ai_assistant.execute_tool("get_academic_year", {}, ctx)


# --------------------------------------------------------------------------
# AI tool-use loop (ai_assistant.run_agent) -- fake Anthropic client
# --------------------------------------------------------------------------


class _FakeBlock:
    def __init__(self, type_, **kw):
        self.type = type_
        for key, value in kw.items():
            setattr(self, key, value)


class _FakeResponse:
    def __init__(self, stop_reason, content):
        self.stop_reason = stop_reason
        self.content = content


class _ScriptedClient:
    """Returns each response in `script` in order, one per .create() call."""

    def __init__(self, script):
        self._script = list(script)
        self.messages = self
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self._script.pop(0)


def _text_response(text):
    return _FakeResponse("end_turn", [_FakeBlock("text", text=text)])


def _tool_use_response(tool_id, name, tool_input):
    return _FakeResponse("tool_use", [_FakeBlock("tool_use", id=tool_id, name=name, input=tool_input)])


def test_run_agent_executes_a_tool_then_returns_final_text(db_session):
    from app.models import User
    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)

    client = _ScriptedClient([
        _tool_use_response("t1", "get_school_info", {}),
        _text_response("Here is the school's info."),
    ])

    reply = ai_assistant.run_agent(client, "system prompt", [{"role": "user", "content": "hi"}], ctx)
    assert reply == "Here is the school's info."
    assert ctx.tool_calls == ["get_school_info"]
    # second call replayed the tool result back to the model
    assert client.calls[1]["messages"][-1]["content"][0]["type"] == "tool_result"


def test_run_agent_stops_after_max_turns(db_session):
    from app.models import User
    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)

    endless_tool_use = _tool_use_response("t", "get_academic_year", {})
    client = _ScriptedClient([endless_tool_use] * (ai_assistant.MAX_TOOL_TURNS + 1))

    reply = ai_assistant.run_agent(client, "system prompt", [{"role": "user", "content": "hi"}], ctx)
    assert "trouble" in reply.lower()
    assert len(client.calls) == ai_assistant.MAX_TOOL_TURNS


def test_run_agent_full_flow_returns_real_data(db_session):
    from app.models import Attendance, User
    admin = db_session.query(User).filter(User.email == "admin@school.com").first()
    student = _make_student(db_session, first_name="Loopy")
    db_session.add(Attendance(student_id=student.id, attendance_date=date.today(), status="Present"))
    db_session.commit()

    ctx = ai_assistant.ToolContext(db=db_session, user=admin, allowed_ids=None)
    client = _ScriptedClient([
        _tool_use_response("t1", "list_students", {"query": "Loopy"}),
        _tool_use_response("t2", "set_active_student", {"student_id": student.id}),
        _tool_use_response("t3", "get_attendance", {}),
        _text_response("Loopy has perfect attendance!"),
    ])

    reply = ai_assistant.run_agent(client, "system prompt", [{"role": "user", "content": "how is loopy doing"}], ctx)
    assert reply == "Loopy has perfect attendance!"
    assert ctx.active_student.id == student.id
    assert ctx.tool_calls == ["list_students", "set_active_student", "get_attendance"]


# --------------------------------------------------------------------------
# AI engine through the real /chatbot/ask endpoint (client monkeypatched in)
# --------------------------------------------------------------------------


def test_ai_endpoint_end_to_end_with_fake_client(client, auth, db_session, monkeypatch):
    from app.models import Attendance

    student = _make_student(db_session, first_name="Endtoend")
    db_session.add(Attendance(student_id=student.id, attendance_date=date.today(), status="Present"))
    db_session.commit()

    fake_client = _ScriptedClient([
        _tool_use_response("t1", "list_students", {"query": "Endtoend"}),
        _tool_use_response("t2", "set_active_student", {"student_id": student.id}),
        _tool_use_response("t3", "get_attendance", {}),
        _text_response("Endtoend is attending well."),
    ])
    monkeypatch.setattr(chatbot, "_anthropic_client", fake_client)

    resp = client.post("/chatbot/ask", json={"message": "how is endtoend doing", "history": []}, headers=auth)
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == "Endtoend is attending well."
    assert body["student_id"] == student.id
    assert body["suggestions"] == chatbot.STUDENT_SUGGESTIONS


def test_ai_endpoint_blocks_a_tool_call_for_an_unlinked_student(client, db_session, monkeypatch):
    """Even if the model calls set_active_student with a student id outside
    the caller's access, the tool executor -- not the model -- is what
    decides access. This is the security property the whole design rests
    on: nothing upstream of execute_tool has to be trusted."""
    mine = _make_student(db_session, first_name="MineOnly")
    theirs = _make_student(db_session, first_name="NotMineEither")
    _, email = _make_parent_with_child(db_session, mine)
    parent_auth = _login(client, email)

    fake_client = _ScriptedClient([
        _tool_use_response("t1", "set_active_student", {"student_id": theirs.id}),
        _text_response("(final reply after the tool call)"),
    ])
    monkeypatch.setattr(chatbot, "_anthropic_client", fake_client)

    resp = client.post("/chatbot/ask", json={"message": "tell me about that other kid", "history": []}, headers=parent_auth)
    assert resp.status_code == 200
    # the tool result fed back to the model must contain the rejection, not
    # a green light -- and the endpoint must not report the unlinked
    # student as the active one.
    tool_result = fake_client.calls[1]["messages"][-1]["content"][0]["content"]
    assert "not_authorized" in tool_result
    assert "student_id" not in resp.json()


def test_ai_endpoint_falls_back_to_rule_based_when_the_api_call_fails(client, auth, monkeypatch):
    class _BrokenMessages:
        @staticmethod
        def create(**kwargs):
            raise RuntimeError("simulated API failure")

    class _BrokenClient:
        messages = _BrokenMessages()

    monkeypatch.setattr(chatbot, "_anthropic_client", _BrokenClient())

    resp = client.post("/chatbot/ask", json={"message": "help", "history": []}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["reply"] == chatbot.HELP_TEXT


def test_ai_endpoint_replays_conversation_history_to_the_model(client, auth, monkeypatch):
    fake_client = _ScriptedClient([_text_response("Sure, following up on that.")])
    monkeypatch.setattr(chatbot, "_anthropic_client", fake_client)

    resp = client.post(
        "/chatbot/ask",
        json={
            "message": "what about last week",
            "history": [
                {"role": "user", "text": "how is my child's attendance"},
                {"role": "assistant", "text": "They have 90% attendance overall."},
            ],
        },
        headers=auth,
    )
    assert resp.status_code == 200
    sent_messages = fake_client.calls[0]["messages"]
    assert sent_messages[0] == {"role": "user", "content": "how is my child's attendance"}
    assert sent_messages[1] == {"role": "assistant", "content": "They have 90% attendance overall."}
    assert sent_messages[2] == {"role": "user", "content": "what about last week"}
