#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
Massinissa School Software — Group (Class) Old Lessons Date Editor (Termux / CLI)
=============================================================================
Interactive & CLI tool to inspect a group's (Class) lessons and edit their
dates/times, batch-align old lesson dates, shift lesson dates, or add/remove
lessons directly from an Android phone (Termux) or PC terminal.

All existing student attendance records (Present / Absent / Excused) remain
100% intact and attached to the lesson when its date is updated.

Requirements in Termux:
  pkg install python
  pip install pg8000

Usage Examples:
  # 1. Interactive mode (search group by name, teacher, or branch):
  python manage_group_lessons.py

  # 2. Open a specific group directly by Class ID or search term:
  python manage_group_lessons.py 122
  python manage_group_lessons.py "بن يحي"
"""

import sys
import os
import re
import json
import argparse
from datetime import datetime, timedelta
from urllib.parse import urlparse

# Ensure UTF-8 output encoding for Arabic text
if hasattr(sys.stdout, "buffer"):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    import io
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import pg8000.native
    from pg8000.native import State, literal, InterfaceError
    HAS_PG8000 = True
except ImportError:
    HAS_PG8000 = False

# School timezone is UTC+1 (Africa/Algiers, constant without DST).
# Database timestamps are stored in UTC; local time = UTC + 1 hour.
ALGIERS_OFFSET = timedelta(hours=1)

DAY_NAMES_EN_AR = {
    0: "Mon / الإثنين",
    1: "Tue / الثلاثاء",
    2: "Wed / الأربعاء",
    3: "Thu / الخميس",
    4: "Fri / الجمعة",
    5: "Sat / السبت",
    6: "Sun / الأحد",
}


def load_env_database_url():
    """Load DATABASE_URL from environment or local .env file. Automatically strips -pooler."""
    if os.environ.get("DIRECT_URL"):
        return os.environ.get("DIRECT_URL")
    if os.environ.get("DATABASE_URL"):
        url = os.environ.get("DATABASE_URL")
        return url.replace("-pooler.", ".")

    candidates = [
        ".env",
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                env_dict = {}
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("DIRECT_URL="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            env_dict["DIRECT_URL"] = val
                        elif line.startswith("DATABASE_URL="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            env_dict["DATABASE_URL"] = val
                if "DIRECT_URL" in env_dict:
                    return env_dict["DIRECT_URL"]
                if "DATABASE_URL" in env_dict:
                    return env_dict["DATABASE_URL"].replace("-pooler.", ".")
            except Exception:
                pass
    return None


def inline_sql_params(query, params):
    """Safely interpolate :param placeholders using pg8000.native.literal for Simple Query Protocol."""
    if not params:
        return query
    in_quote_escape = False
    output_query = []
    state = State.OUT
    prev_c = None
    curr_param = ""
    for i, c in enumerate(query):
        next_c = query[i + 1] if i + 1 < len(query) else None
        if state == State.OUT:
            if c == "'":
                output_query.append(c)
                state = State.IN_ES if prev_c == "E" else State.IN_SQ
            elif c == '"':
                output_query.append(c)
                state = State.IN_QI
            elif c == "-":
                output_query.append(c)
                if prev_c == "-":
                    state = State.IN_CO
            elif c == "$":
                output_query.append(c)
                if prev_c == "$":
                    state = State.IN_DQ
            elif c == ":" and (next_c is None or next_c not in ":=") and prev_c != ":":
                state = State.IN_PN
                curr_param = ""
            else:
                output_query.append(c)
        elif state == State.IN_SQ:
            if c == "'":
                if in_quote_escape:
                    in_quote_escape = False
                elif next_c == "'":
                    in_quote_escape = True
                else:
                    state = State.OUT
            output_query.append(c)
        elif state == State.IN_QI:
            if c == '"':
                state = State.OUT
            output_query.append(c)
        elif state == State.IN_ES:
            if c == "'" and prev_c != "\\":
                state = State.OUT
            output_query.append(c)
        elif state == State.IN_PN:
            curr_param += c
            if next_c is None or (not next_c.isalnum() and next_c != "_"):
                state = State.OUT
                if curr_param not in params:
                    raise InterfaceError(f"Missing parameter: {curr_param}")
                output_query.append(literal(params[curr_param]))
        elif state == State.IN_CO:
            output_query.append(c)
            if c == "\n":
                state = State.OUT
        elif state == State.IN_DQ:
            output_query.append(c)
            if c == "$" and prev_c == "$":
                state = State.OUT
        prev_c = c
    return "".join(output_query)


def get_db_connection(db_url):
    """Create a database connection to PostgreSQL using Simple Query Protocol."""
    if not db_url:
        raise ValueError(
            "DATABASE_URL not found! Set DATABASE_URL environment variable or place .env in the folder."
        )

    if "-pooler." in db_url:
        db_url = db_url.replace("-pooler.", ".")

    if not HAS_PG8000:
        raise RuntimeError(
            "pg8000 driver not found!\nPlease run: python -m pip install pg8000"
        )

    parsed = urlparse(db_url)
    user = parsed.username
    password = parsed.password
    host = parsed.hostname
    port = parsed.port or 5432
    database = parsed.path.lstrip("/")

    class SafePg8000Connection(pg8000.native.Connection):
        """Executes queries via Simple Query Protocol to eliminate unnamed portal collisions."""
        def run(self, sql, stream=None, types=None, **params):
            final_sql = inline_sql_params(sql, params) if params else sql
            self._context = self.execute_simple(final_sql)
            return self._context.rows

    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = SafePg8000Connection(
        user=user,
        password=password,
        host=host,
        port=port,
        database=database,
        ssl_context=ctx,
    )
    return conn


# ── Helpers ──────────────────────────────────────────────────────────

def normalize_arabic(text):
    """Normalize Arabic characters for fuzzy matching."""
    if not text:
        return ""
    text = str(text).strip()
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = re.sub(r"[ة]", "ه", text)
    text = re.sub(r"[ى]", "ي", text)
    text = re.sub(r"[\u064B-\u065F]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def parse_db_utc_datetime(val):
    """Convert DB timestamp value (naive UTC or aware) into naive UTC datetime."""
    if isinstance(val, datetime):
        if val.tzinfo is not None:
            return val.astimezone(tz=None).replace(tzinfo=None)
        return val
    s = str(val).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(s[:26], fmt)
        except ValueError:
            pass
    return datetime.fromisoformat(s.replace("Z", ""))


def utc_to_algiers(utc_dt):
    """Convert naive UTC datetime from DB to local Algeria time (UTC+1)."""
    return parse_db_utc_datetime(utc_dt) + ALGIERS_OFFSET


def algiers_to_utc(local_dt):
    """Convert naive Algeria local datetime (UTC+1) to naive UTC datetime for DB storage."""
    return local_dt - ALGIERS_OFFSET


def format_lesson_dt(utc_start, utc_end):
    """Format lesson start/end into readable Algeria local date, weekday, and time range."""
    loc_start = utc_to_algiers(utc_start)
    loc_end = utc_to_algiers(utc_end)
    date_str = loc_start.strftime("%Y-%m-%d")
    day_str = DAY_NAMES_EN_AR.get(loc_start.weekday(), "")
    time_str = f"{loc_start.strftime('%H:%M')} -> {loc_end.strftime('%H:%M')}"
    return date_str, day_str, time_str, loc_start, loc_end


def build_new_utc_times(old_utc_start, old_utc_end, new_date_str, new_start_time_str=None, new_end_time_str=None):
    """
    Calculate new UTC startsAt and endsAt given a new YYYY-MM-DD (in Algeria local time)
    and optional HH:MM start/end times. Preserves original local time and duration if omitted.
    """
    loc_start = utc_to_algiers(old_utc_start)
    loc_end = utc_to_algiers(old_utc_end)
    duration = loc_end - loc_start
    if duration.total_seconds() <= 0:
        duration = timedelta(hours=1, minutes=30)

    parts = [int(p) for p in new_date_str.strip().split("-")]
    if len(parts) != 3:
        raise ValueError("Date must be in YYYY-MM-DD format.")
    year, month, day = parts

    if new_start_time_str:
        sh, sm = [int(x) for x in new_start_time_str.strip().split(":")]
    else:
        sh, sm = loc_start.hour, loc_start.minute

    new_loc_start = datetime(year, month, day, sh, sm, 0)

    if new_end_time_str:
        eh, em = [int(x) for x in new_end_time_str.strip().split(":")]
        new_loc_end = datetime(year, month, day, eh, em, 0)
        if new_loc_end <= new_loc_start:
            new_loc_end = new_loc_start + duration
    else:
        new_loc_end = new_loc_start + duration

    return algiers_to_utc(new_loc_start), algiers_to_utc(new_loc_end)


# ── Database Queries ─────────────────────────────────────────────────

def search_classes(conn, query_str=None):
    """Search classes (groups) by ID, class name, teacher name, or branch name."""
    rows = conn.run(
        """SELECT c.id, c.name, COALESCE(t.name, 'No Teacher'), b.name as branch_name,
                  c."isFormation", c."isCompleted",
                  (SELECT COUNT(*) FROM "Lesson" l WHERE l."classId" = c.id) as lessons_count,
                  (SELECT COUNT(*) FROM "Enrollment" e WHERE e."classId" = c.id AND e.status = 'ACTIVE') as students_count
           FROM "Class" c
           LEFT JOIN "Teacher" t ON t.id = c."teacherId"
           LEFT JOIN "Branch" b ON b.id = c."branchId"
           ORDER BY c."isCompleted" ASC, c.id DESC"""
    )

    all_classes = []
    for r in rows:
        all_classes.append({
            "id": r[0],
            "name": r[1],
            "teacher_name": r[2],
            "branch_name": r[3] or "Unknown",
            "isFormation": bool(r[4]),
            "isCompleted": bool(r[5]),
            "lessons_count": int(r[6] or 0),
            "students_count": int(r[7] or 0),
        })

    if not query_str:
        return all_classes

    q = str(query_str).strip()
    if q.isdigit():
        cid = int(q)
        exact = [c for c in all_classes if c["id"] == cid]
        if exact:
            return exact

    norm_q = normalize_arabic(q)
    matches = []
    for c in all_classes:
        haystack = normalize_arabic(f"{c['id']} {c['name']} {c['teacher_name']} {c['branch_name']}")
        if norm_q in haystack:
            matches.append(c)
    return matches


def get_class_details_and_lessons(conn, class_id):
    """Fetch full class record and all its lessons ordered chronologically."""
    c_rows = conn.run(
        """SELECT c.id, c.name, c."teacherId", COALESCE(t.name, 'No Teacher'),
                  c."branchId", b.name as branch_name, c."isFormation", c."isCompleted",
                  (SELECT COUNT(*) FROM "Enrollment" e WHERE e."classId" = c.id AND e.status = 'ACTIVE') as students_count
           FROM "Class" c
           LEFT JOIN "Teacher" t ON t.id = c."teacherId"
           LEFT JOIN "Branch" b ON b.id = c."branchId"
           WHERE c.id = :cid""",
        cid=class_id,
    )
    if not c_rows:
        return None

    r = c_rows[0]
    group = {
        "id": r[0],
        "name": r[1],
        "teacherId": r[2],
        "teacher_name": r[3],
        "branchId": r[4],
        "branch_name": r[5] or "Unknown",
        "isFormation": bool(r[6]),
        "isCompleted": bool(r[7]),
        "students_count": int(r[8] or 0),
    }

    l_rows = conn.run(
        """SELECT l.id, l."startsAt", l."endsAt", l."classroomId", COALESCE(cr.name, 'Room'),
                  l."teacherId", COALESCE(t.name, 'Teacher'),
                  l."isExtra", l."isCatchUp", l."isFree", l."isTeacherAbsent",
                  (SELECT COUNT(*) FROM "Attendance" a WHERE a."lessonId" = l.id AND a.status IN ('PRESENT', 'LATE')) as present_cnt,
                  (SELECT COUNT(*) FROM "Attendance" a WHERE a."lessonId" = l.id AND a.status = 'ABSENT') as absent_cnt,
                  (SELECT COUNT(*) FROM "Attendance" a WHERE a."lessonId" = l.id AND a.status NOT IN ('PRESENT', 'LATE', 'ABSENT')) as excused_cnt
           FROM "Lesson" l
           LEFT JOIN "Classroom" cr ON cr.id = l."classroomId"
           LEFT JOIN "Teacher" t ON t.id = l."teacherId"
           WHERE l."classId" = :cid
           ORDER BY l."startsAt" ASC, l.id ASC""",
        cid=class_id,
    )

    lessons = []
    for lr in l_rows:
        date_str, day_str, time_str, loc_start, loc_end = format_lesson_dt(lr[1], lr[2])
        flags = []
        if lr[7]:
            flags.append("EXTRA")
        if lr[8]:
            flags.append("CATCH-UP")
        if lr[9]:
            flags.append("FREE")
        if lr[10]:
            flags.append("TEACHER-ABSENT")
        if not flags:
            flags.append("NORMAL")

        lessons.append({
            "id": lr[0],
            "startsAt": lr[1],
            "endsAt": lr[2],
            "classroomId": lr[3],
            "classroom_name": lr[4],
            "teacherId": lr[5],
            "teacher_name": lr[6],
            "isExtra": bool(lr[7]),
            "isCatchUp": bool(lr[8]),
            "isFree": bool(lr[9]),
            "isTeacherAbsent": bool(lr[10]),
            "present_cnt": int(lr[11] or 0),
            "absent_cnt": int(lr[12] or 0),
            "excused_cnt": int(lr[13] or 0),
            "date_str": date_str,
            "day_str": day_str,
            "time_str": time_str,
            "loc_start": loc_start,
            "loc_end": loc_end,
            "flags_str": ", ".join(flags),
        })

    group["lessons"] = lessons
    return group


def update_lesson_datetime_in_db(conn, group, lesson, new_utc_start, new_utc_end):
    """Atomically update a lesson's startsAt and endsAt, sync Announcement, and write AuditLog."""
    old_date_str = lesson["date_str"]
    old_time_str = lesson["time_str"]
    new_date_str, new_day_str, new_time_str, _, _ = format_lesson_dt(new_utc_start, new_utc_end)

    conn.run("BEGIN")
    try:
        conn.run(
            'UPDATE "Lesson" SET "startsAt" = :s, "endsAt" = :e WHERE id = :lid',
            s=new_utc_start, e=new_utc_end, lid=lesson["id"],
        )

        # Update linked announcement expiration if present
        conn.run(
            'UPDATE "Announcement" SET "expiresAt" = :e WHERE "lessonId" = :lid',
            e=new_utc_end, lid=lesson["id"],
        )

        # Write AuditLog
        details = json.dumps({
            "classId": group["id"],
            "className": group["name"],
            "lessonId": lesson["id"],
            "oldDate": f"{old_date_str} ({old_time_str})",
            "newDate": f"{new_date_str} ({new_time_str})",
        }, ensure_ascii=False)

        conn.run(
            """INSERT INTO "AuditLog" ("entityType", "entityId", action, "branchId", "userId", "userName", "oldValue", "newValue", details, timestamp)
               VALUES ('Lesson', :lid, 'UPDATE_LESSON_DATE_TERMUX', :bid, 'termux_admin', 'Termux CLI', :oldv, :newv, :dtl, NOW())""",
            lid=str(lesson["id"]),
            bid=group["branchId"],
            oldv=f"{old_date_str} {old_time_str}",
            newv=f"{new_date_str} {new_time_str}",
            dtl=details,
        )
        conn.run("COMMIT")
        return new_date_str, new_day_str, new_time_str
    except Exception as e:
        conn.run("ROLLBACK")
        raise e


# ── Display & Interactive Actions ────────────────────────────────────

def display_group_dashboard(group):
    """Print group header and numbered table of all lessons."""
    g_type = "FORMATION / دورة تكوينية" if group["isFormation"] else "REGULAR GROUP / فوج عادي"
    status_str = "COMPLETED" if group["isCompleted"] else "ACTIVE"
    print("\n" + "═" * 68)
    print(f"  🏫 GROUP #{group['id']}: {group['name']}")
    print(f"  👨‍🏫 Teacher: {group['teacher_name']} | 📍 Branch: {group['branch_name']}")
    print(f"  🏷️  Type: {g_type} ({status_str}) | 👥 Active Students: {group['students_count']}")
    print("═" * 68)

    lessons = group["lessons"]
    print(f"\n📅 LESSONS HISTORY ({len(lessons)} total, ordered oldest -> newest):")
    if not lessons:
        print("  (No lessons recorded for this group yet)")
    else:
        for i, l in enumerate(lessons, 1):
            att_summary = f"P:{l['present_cnt']} A:{l['absent_cnt']} E:{l['excused_cnt']}"
            print(
                f"  [{i:2d}] {l['date_str']} ({l['day_str']}) | {l['time_str']} "
                f"| {l['flags_str']} | Att({att_summary}) [ID:{l['id']}]"
            )
    print("-" * 68)


def print_lessons_list(lessons, header=None):
    """Print numbered list of all recorded lessons for easy selection."""
    if header:
        print(f"\n{header}")
    for i, l in enumerate(lessons, 1):
        att_summary = f"P:{l['present_cnt']} A:{l['absent_cnt']} E:{l['excused_cnt']}"
        print(
            f"  [{i:2d}] {l['date_str']} ({l['day_str']}) | {l['time_str']} "
            f"| {l['flags_str']} | Att({att_summary}) [ID:{l['id']}]"
        )


def handle_edit_single_lesson(conn, group):
    """Edit the date (and optional start/end time) of a single lesson."""
    lessons = group["lessons"]
    if not lessons:
        print("\nNo lessons to edit.")
        return

    print_lessons_list(lessons, "📋 ALL RECORDED LESSONS FOR THIS GROUP:")
    pick = input(f"\nSelect lesson number (1-{len(lessons)}) or [0] to cancel: ").strip()
    if not pick or pick == "0":
        return

    try:
        idx = int(pick) - 1
        if idx < 0 or idx >= len(lessons):
            print("❌ Invalid lesson number.")
            return
        lesson = lessons[idx]
    except ValueError:
        print("❌ Invalid input.")
        return

    print(f"\nSelected Lesson [{idx + 1}] (ID: {lesson['id']}):")
    print(f"  Current Date: {lesson['date_str']} ({lesson['day_str']})")
    print(f"  Current Time: {lesson['time_str']} ({lesson['classroom_name']})")
    print(f"  Attendances:  {lesson['present_cnt']} Present, {lesson['absent_cnt']} Absent, {lesson['excused_cnt']} Excused")

    new_date_str = input(f"\nEnter NEW Date (YYYY-MM-DD) [default keep {lesson['date_str']}]: ").strip()
    if not new_date_str:
        new_date_str = lesson["date_str"]

    cur_start_hm = lesson["loc_start"].strftime("%H:%M")
    cur_end_hm = lesson["loc_end"].strftime("%H:%M")

    new_start_hm = input(f"Enter NEW Start Time (HH:MM) [Enter to keep {cur_start_hm}]: ").strip()
    new_end_hm = ""
    if new_start_hm:
        new_end_hm = input(f"Enter NEW End Time (HH:MM) [Enter to keep duration / {cur_end_hm}]: ").strip()

    try:
        new_utc_start, new_utc_end = build_new_utc_times(
            lesson["startsAt"],
            lesson["endsAt"],
            new_date_str,
            new_start_hm or None,
            new_end_hm or None,
        )
    except Exception as e:
        print(f"❌ Invalid date/time format: {e}")
        return

    preview_date, preview_day, preview_time, _, _ = format_lesson_dt(new_utc_start, new_utc_end)
    print("\n📋 PREVIEW CHANGE:")
    print(f"  BEFORE: {lesson['date_str']} ({lesson['day_str']}) | {lesson['time_str']}")
    print(f"  AFTER:  {preview_date} ({preview_day}) | {preview_time}")

    confirm = input("\nApply this change? [y/N]: ").strip().lower()
    if confirm not in ("y", "yes"):
        print("Cancelled.")
        return

    try:
        updated_date, updated_day, updated_time = update_lesson_datetime_in_db(
            conn, group, lesson, new_utc_start, new_utc_end
        )
        print(f"\n✅ Lesson [ID:{lesson['id']}] updated to {updated_date} ({updated_day}) | {updated_time}!")
    except Exception as e:
        print(f"\n❌ Failed to update lesson: {e}")


def handle_batch_edit_dates(conn, group):
    """Step through multiple lessons in sequence to quickly set their YYYY-MM-DD dates."""
    lessons = group["lessons"]
    if not lessons:
        print("\nNo lessons to edit.")
        return

    print("\n" + "═" * 60)
    print("  ⚡ BATCH EDIT LESSON DATES (One by One)")
    print("  Type a new YYYY-MM-DD for each lesson, or press Enter")
    print("  to keep its current date. Type 'q' to finish early.")
    print("═" * 60)

    print_lessons_list(lessons, "📋 ALL RECORDED LESSONS FOR THIS GROUP:")
    range_input = input(
        f"\nEnter lesson numbers to edit (e.g. '1-4' or '1,3,5' or Enter for ALL 1-{len(lessons)}): "
    ).strip()

    selected_indices = []
    if not range_input or range_input.lower() == "all":
        selected_indices = list(range(len(lessons)))
    else:
        try:
            for part in range_input.split(","):
                part = part.strip()
                if "-" in part:
                    a, b = [int(x) for x in part.split("-", 1)]
                    for k in range(a, b + 1):
                        if 1 <= k <= len(lessons):
                            selected_indices.append(k - 1)
                else:
                    k = int(part)
                    if 1 <= k <= len(lessons):
                        selected_indices.append(k - 1)
        except ValueError:
            print("❌ Invalid selection format.")
            return

    if not selected_indices:
        print("No valid lessons selected.")
        return

    updated_count = 0
    for idx in selected_indices:
        lesson = lessons[idx]
        att_info = f"P:{lesson['present_cnt']} A:{lesson['absent_cnt']}"
        prompt = (
            f"\n  Lesson [{idx + 1:2d}] (Current: {lesson['date_str']} {lesson['day_str']} | "
            f"{lesson['time_str']} | {att_info})\n"
            f"  -> New Date (YYYY-MM-DD) [Enter=skip, q=done]: "
        )
        val = input(prompt).strip()
        if val.lower() in ("q", "quit", "exit"):
            break
        if not val or val == lesson["date_str"]:
            print("     (Kept unchanged)")
            continue

        try:
            new_utc_start, new_utc_end = build_new_utc_times(lesson["startsAt"], lesson["endsAt"], val)
            u_date, u_day, u_time = update_lesson_datetime_in_db(
                conn, group, lesson, new_utc_start, new_utc_end
            )
            updated_count += 1
            print(f"     ✅ Updated -> {u_date} ({u_day}) | {u_time}")
        except Exception as e:
            print(f"     ❌ Invalid date '{val}': {e}")

    print(f"\n🎉 Batch edit finished! Updated {updated_count} lesson(s).")


def handle_shift_lessons_days(conn, group):
    """Shift all or selected lessons by +/- N days."""
    lessons = group["lessons"]
    if not lessons:
        print("\nNo lessons to shift.")
        return

    print_lessons_list(lessons, "📋 ALL RECORDED LESSONS FOR THIS GROUP:")
    range_input = input(
        f"\nEnter lessons to shift (e.g. '1-4' or '2,3' or Enter for ALL 1-{len(lessons)}): "
    ).strip()

    selected_indices = []
    if not range_input or range_input.lower() == "all":
        selected_indices = list(range(len(lessons)))
    else:
        try:
            for part in range_input.split(","):
                part = part.strip()
                if "-" in part:
                    a, b = [int(x) for x in part.split("-", 1)]
                    for k in range(a, b + 1):
                        if 1 <= k <= len(lessons):
                            selected_indices.append(k - 1)
                else:
                    k = int(part)
                    if 1 <= k <= len(lessons):
                        selected_indices.append(k - 1)
        except ValueError:
            print("❌ Invalid selection format.")
            return

    if not selected_indices:
        print("No valid lessons selected.")
        return

    days_str = input("Enter number of days to shift (e.g. -7 for 1 week earlier, +1 for 1 day later): ").strip()
    try:
        delta_days = int(days_str)
    except ValueError:
        print("❌ Invalid number of days.")
        return

    if delta_days == 0:
        print("0 days — nothing to change.")
        return

    print("\n📋 PREVIEW SHIFT:")
    delta = timedelta(days=delta_days)
    for idx in selected_indices:
        l = lessons[idx]
        new_start = parse_db_utc_datetime(l["startsAt"]) + delta
        new_end = parse_db_utc_datetime(l["endsAt"]) + delta
        nd, nday, ntime, _, _ = format_lesson_dt(new_start, new_end)
        print(f"  [{idx + 1:2d}] {l['date_str']} ({l['day_str']})  -->  {nd} ({nday}) | {ntime}")

    confirm = input(f"\nShift {len(selected_indices)} lesson(s) by {delta_days:+d} days? [y/N]: ").strip().lower()
    if confirm not in ("y", "yes"):
        print("Cancelled.")
        return

    updated_count = 0
    for idx in selected_indices:
        l = lessons[idx]
        new_start = parse_db_utc_datetime(l["startsAt"]) + delta
        new_end = parse_db_utc_datetime(l["endsAt"]) + delta
        update_lesson_datetime_in_db(conn, group, l, new_start, new_end)
        updated_count += 1

    print(f"\n✅ Shifted {updated_count} lesson(s) by {delta_days:+d} days!")


def handle_edit_lesson_flags(conn, group):
    """Toggle lesson type (Normal / Extra / CatchUp / Free) or Teacher Absent status."""
    lessons = group["lessons"]
    if not lessons:
        print("\nNo lessons available.")
        return

    print_lessons_list(lessons, "📋 ALL RECORDED LESSONS FOR THIS GROUP:")
    pick = input(f"\nSelect lesson number (1-{len(lessons)}) or [0] to cancel: ").strip()
    if not pick or pick == "0":
        return

    try:
        idx = int(pick) - 1
        lesson = lessons[idx]
    except Exception:
        print("❌ Invalid choice.")
        return

    print(f"\nLesson [{idx + 1}] on {lesson['date_str']} ({lesson['flags_str']}):")
    print("  [1] Set as NORMAL Lesson (Consumes regular credit)")
    print("  [2] Set as EXTRA Lesson (isExtra = true)")
    print("  [3] Set as CATCH-UP Lesson (isCatchUp = true)")
    print("  [4] Set as FREE Lesson (isFree = true — 0 credit deducted)")
    print(f"  [5] Toggle Teacher Absent (Currently: {lesson['isTeacherAbsent']})")
    print("  [0] Cancel")

    choice = input("\nChoose option: ").strip()
    if choice == "1":
        conn.run(
            'UPDATE "Lesson" SET "isExtra" = false, "isCatchUp" = false, "isFree" = false WHERE id = :id',
            id=lesson["id"],
        )
        print("✅ Lesson set to NORMAL.")
    elif choice == "2":
        conn.run(
            'UPDATE "Lesson" SET "isExtra" = true, "isCatchUp" = false, "isFree" = false WHERE id = :id',
            id=lesson["id"],
        )
        print("✅ Lesson set to EXTRA.")
    elif choice == "3":
        conn.run(
            'UPDATE "Lesson" SET "isExtra" = false, "isCatchUp" = true, "isFree" = false WHERE id = :id',
            id=lesson["id"],
        )
        print("✅ Lesson set to CATCH-UP.")
    elif choice == "4":
        conn.run(
            'UPDATE "Lesson" SET "isExtra" = false, "isCatchUp" = false, "isFree" = true WHERE id = :id',
            id=lesson["id"],
        )
        print("✅ Lesson set to FREE.")
    elif choice == "5":
        new_val = not lesson["isTeacherAbsent"]
        conn.run(
            'UPDATE "Lesson" SET "isTeacherAbsent" = :val WHERE id = :id',
            val=new_val, id=lesson["id"],
        )
        print(f"✅ Teacher Absent toggled to {new_val}.")


def handle_create_backdated_lesson(conn, group):
    """Create a new backdated/custom lesson for the group."""
    if not group["teacherId"]:
        print("❌ This group does not have a head teacher assigned.")
        return

    # Find default classroom from existing lessons or branch classrooms
    default_classroom_id = None
    if group["lessons"]:
        default_classroom_id = group["lessons"][-1]["classroomId"]
    else:
        cr_rows = conn.run(
            'SELECT id, name FROM "Classroom" WHERE "branchId" = :bid ORDER BY id ASC LIMIT 1',
            bid=group["branchId"],
        )
        if cr_rows:
            default_classroom_id = cr_rows[0][0]
        else:
            cr_any = conn.run('SELECT id FROM "Classroom" ORDER BY id ASC LIMIT 1')
            if cr_any:
                default_classroom_id = cr_any[0][0]

    if not default_classroom_id:
        print("❌ No classroom found in database.")
        return

    date_str = input("\nEnter Lesson Date (YYYY-MM-DD): ").strip()
    if not date_str:
        return

    default_start = "09:00"
    default_end = "10:30"
    if group["lessons"]:
        default_start = group["lessons"][-1]["loc_start"].strftime("%H:%M")
        default_end = group["lessons"][-1]["loc_end"].strftime("%H:%M")

    start_hm = input(f"Enter Start Time (HH:MM) [default {default_start}]: ").strip() or default_start
    end_hm = input(f"Enter End Time (HH:MM) [default {default_end}]: ").strip() or default_end

    try:
        parts = [int(p) for p in date_str.split("-")]
        sh, sm = [int(x) for x in start_hm.split(":")]
        eh, em = [int(x) for x in end_hm.split(":")]
        loc_start = datetime(parts[0], parts[1], parts[2], sh, sm, 0)
        loc_end = datetime(parts[0], parts[1], parts[2], eh, em, 0)
        if loc_end <= loc_start:
            loc_end = loc_start + timedelta(hours=1, minutes=30)
        utc_start = algiers_to_utc(loc_start)
        utc_end = algiers_to_utc(loc_end)
    except Exception as e:
        print(f"❌ Invalid date/time: {e}")
        return

    mark_present = input("Mark all currently active enrolled students as PRESENT for this lesson? [y/N]: ").strip().lower()

    conn.run("BEGIN")
    try:
        res = conn.run(
            """INSERT INTO "Lesson" ("classId", "teacherId", "classroomId", "branchId", "startsAt", "endsAt",
                                     "isExtra", "isCatchUp", "isFree", "isTeacherAbsent")
               VALUES (:cid, :tid, :crid, :bid, :s, :e, false, false, false, false)
               RETURNING id""",
            cid=group["id"],
            tid=group["teacherId"],
            crid=default_classroom_id,
            bid=group["branchId"],
            s=utc_start,
            e=utc_end,
        )
        new_lid = res[0][0]

        att_created = 0
        if mark_present in ("y", "yes"):
            enr_rows = conn.run(
                'SELECT DISTINCT "studentId" FROM "Enrollment" WHERE "classId" = :cid AND status = \'ACTIVE\'',
                cid=group["id"],
            )
            for er in enr_rows:
                conn.run(
                    'INSERT INTO "Attendance" ("studentId", "lessonId", status) VALUES (:sid, :lid, \'PRESENT\')',
                    sid=er[0], lid=new_lid,
                )
                att_created += 1

        conn.run("COMMIT")
        print(f"\n✅ Created Lesson [ID:{new_lid}] on {date_str} ({start_hm} -> {end_hm}) with {att_created} attendance record(s)!")
    except Exception as e:
        conn.run("ROLLBACK")
        print(f"\n❌ Failed to create lesson: {e}")


def handle_delete_lesson(conn, group):
    """Delete a lesson and its associated attendance records after confirmation."""
    lessons = group["lessons"]
    if not lessons:
        print("\nNo lessons to delete.")
        return

    print_lessons_list(lessons, "📋 ALL RECORDED LESSONS FOR THIS GROUP:")
    pick = input(f"\nSelect lesson number to DELETE (1-{len(lessons)}) or [0] to cancel: ").strip()
    if not pick or pick == "0":
        return

    try:
        idx = int(pick) - 1
        lesson = lessons[idx]
    except Exception:
        print("❌ Invalid choice.")
        return

    print(f"\n⚠️  WARNING: You are about to permanently delete:")
    print(f"    Lesson [{idx + 1}] (ID: {lesson['id']}) on {lesson['date_str']} ({lesson['day_str']}) | {lesson['time_str']}")
    print(f"    Along with {lesson['present_cnt'] + lesson['absent_cnt'] + lesson['excused_cnt']} attendance record(s).")

    confirm = input("\nType 'yes' to permanently delete this lesson: ").strip().lower()
    if confirm != "yes":
        print("Cancelled.")
        return

    conn.run("BEGIN")
    try:
        conn.run('DELETE FROM "Announcement" WHERE "lessonId" = :lid', lid=lesson["id"])
        conn.run(
            'DELETE FROM "CatchUpAttendance" WHERE "missedLessonId" = :lid OR "catchUpLessonId" = :lid',
            lid=lesson["id"],
        )
        conn.run('DELETE FROM "Attendance" WHERE "lessonId" = :lid', lid=lesson["id"])
        conn.run('DELETE FROM "Lesson" WHERE id = :lid', lid=lesson["id"])
        conn.run("COMMIT")
        print(f"✅ Lesson [ID:{lesson['id']}] on {lesson['date_str']} deleted successfully.")
    except Exception as e:
        conn.run("ROLLBACK")
        print(f"❌ Failed to delete lesson: {e}")


def group_action_loop(conn, class_id):
    """Main interactive loop for a chosen group (Class)."""
    while True:
        group = get_class_details_and_lessons(conn, class_id)
        if not group:
            print("❌ Group not found.")
            return "SWITCH"

        display_group_dashboard(group)

        print("\nACTIONS:")
        print("  [1] Edit a Single Lesson's Date / Time")
        print("  [2] Batch Edit Old Lessons' Dates (Step-by-step)")
        print("  [3] Shift All / Selected Lessons by +/- N Days")
        print("  [4] Change Lesson Type (Normal / Extra / Catch-Up / Free / Teacher Absent)")
        print("  [5] Create a New Backdated Lesson for this Group")
        print("  [6] Delete a Lesson")
        print("  [7] Switch Group (Class)")
        print("  [0] Exit")

        cmd = input("\nSelect action (0-7): ").strip().lower()

        if cmd == "1":
            handle_edit_single_lesson(conn, group)
            input("\nPress Enter to continue...")
        elif cmd == "2":
            handle_batch_edit_dates(conn, group)
            input("\nPress Enter to continue...")
        elif cmd == "3":
            handle_shift_lessons_days(conn, group)
            input("\nPress Enter to continue...")
        elif cmd == "4":
            handle_edit_lesson_flags(conn, group)
            input("\nPress Enter to continue...")
        elif cmd == "5":
            handle_create_backdated_lesson(conn, group)
            input("\nPress Enter to continue...")
        elif cmd == "6":
            handle_delete_lesson(conn, group)
            input("\nPress Enter to continue...")
        elif cmd == "7":
            return "SWITCH"
        elif cmd in ("0", "q", "quit", "exit"):
            return "EXIT"


def main():
    parser = argparse.ArgumentParser(description="Group (Class) Old Lessons Date Editor")
    parser.add_argument("identifier", nargs="?", help="Group (Class) ID, Group Name, or Teacher Name")
    parser.add_argument("--db", help="PostgreSQL connection string")
    args = parser.parse_args()

    db_url = args.db or load_env_database_url()
    if not db_url:
        print("❌ Error: DATABASE_URL not found!")
        print("Please set DATABASE_URL or run inside the school software folder.")
        sys.exit(1)

    try:
        conn = get_db_connection(db_url)
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)

    initial_query = args.identifier

    while True:
        if not initial_query:
            print("\n" + "═" * 60)
            print("  📅 GROUP LESSONS DATE EDITOR (TERMUX / CLI)")
            print("═" * 60)
            initial_query = input(
                "Enter Group Name, Teacher Name, Class ID, or 'all' (or 'q' to quit): "
            ).strip()
            if not initial_query or initial_query.lower() in ("q", "quit", "exit"):
                break

        search_arg = None if initial_query.lower() == "all" else initial_query
        matches = search_classes(conn, search_arg)

        if not matches:
            print(f"❌ No group found matching '{initial_query}'.")
            initial_query = None
            continue

        if len(matches) == 1:
            selected_class_id = matches[0]["id"]
        else:
            print(f"\nFound {len(matches)} group(s):")
            display_list = matches
            for i, m in enumerate(display_list, 1):
                tag = " [FORMATION]" if m["isFormation"] else ""
                print(
                    f"  [{i:3d}] #{m['id']} - {m['name']}{tag} | Teacher: {m['teacher_name']} "
                    f"| Branch: {m['branch_name']} | Lessons: {m['lessons_count']}"
                )

            pick = input(f"\nSelect group (1-{len(display_list)}) or [0] to search again: ").strip()
            if not pick or pick == "0":
                initial_query = None
                continue
            try:
                selected_class_id = display_list[int(pick) - 1]["id"]
            except Exception:
                print("❌ Invalid selection.")
                initial_query = None
                continue

        result = group_action_loop(conn, selected_class_id)
        if result == "EXIT":
            break
        initial_query = None

    print("\nGoodbye!")


if __name__ == "__main__":
    main()
