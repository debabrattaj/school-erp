"""Create a 60-second Schoolment product-explainer MP4."""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

import edge_tts
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
SCENES = ROOT / "scenes"
OUTPUT = ROOT / "schoolment-features-60s.mp4"
AUDIO = ROOT / "schoolment-narration.mp3"
W, H = 1920, 1080
FONT = "C:/Windows/Fonts/segoeui.ttf"
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"

SCENE_DATA = [
    ("One connected school.", "Every day, every department, one Schoolment platform.", ["Built for Indian schools", "One secure login", "Desktop + mobile"], "intro"),
    ("Admissions that move faster", "Capture enquiries, manage applications, documents, follow-ups and enrolment without chasing spreadsheets.", ["Lead pipeline", "Document checklist", "Admission workflow"], "admissions"),
    ("Every student, clearly organised", "Keep student profiles, classes, sections, guardians, health notes and records together.", ["Student information", "Class & section setup", "Parent details"], "students"),
    ("Attendance in real time", "Record daily attendance, spot patterns and keep families informed before a small issue becomes a bigger one.", ["Class attendance", "Live trends", "Parent updates"], "attendance"),
    ("Fees with complete visibility", "Create fee structures, collect online, track dues and share receipts from one finance workspace.", ["Online fee collection", "Due tracking", "Receipts & reports"], "fees"),
    ("Academics and exams, in control", "Plan assessments, enter marks, publish results and see performance without manual consolidation.", ["Exam scheduling", "Marks & report cards", "Performance insights"], "academics"),
    ("Learning beyond the classroom", "Use the LMS for courses, homework, resources, submissions and teacher feedback.", ["Homework", "Courses & resources", "Submissions"], "lms"),
    ("Parents stay connected", "Give families a simple portal for notices, attendance, fees, homework and results—plus WhatsApp-ready communication.", ["Parent portal", "Notices", "WhatsApp communication"], "parents"),
    ("Operations that stay on schedule", "Coordinate transport, library, staff, campus activities and daily school operations from the same system.", ["Transport routes", "Library circulation", "Staff management"], "operations"),
    ("AI support when people need it", "Sai helps teams and families find answers quickly, while your school remains in control.", ["AI support assistant", "Faster answers", "Guided help"], "ai"),
    ("Security designed for schools", "Role-based access, two-factor authentication, audit trails and protected school data support responsible operations.", ["Role-based login", "Two-factor authentication", "Audit-ready records"], "security"),
    ("Run school from anywhere", "Schoolment gives leadership, staff and families the information they need—on web and mobile.", ["Android & iOS access", "Configurable modules", "Book a free demo"], "outro"),
]

NARRATION = """Meet Schoolment, the connected platform for modern Indian schools. Manage admissions from first enquiry to enrolment, and keep every student record organised. Record attendance in real time, identify trends, and update families quickly. Configure fee structures, collect payments online, track dues, and issue receipts with confidence. Plan exams, enter marks, publish results, and turn academic data into practical insight. Extend learning with homework, courses, resources, submissions, and feedback. Keep parents close through their portal, notices, mobile apps, and WhatsApp communication. Coordinate transport, library, staff, and campus operations without jumping between tools. Sai, Schoolment's AI support, helps users get answers faster. Role-based access, two-factor authentication, audit trails, and protected data keep your school in control. From the classroom to the front office, Schoolment brings your whole school together. Ready to make everyday operations simpler? Book your free Schoolment demo."""


def font(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def wrap(draw: ImageDraw.ImageDraw, text: str, width: int, fnt) -> list[str]:
    words, lines, current = text.split(), [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def background(kind: str) -> Image.Image:
    base = Image.new("RGB", (W, H), "#080d22")
    px = base.load()
    for y in range(H):
        for x in range(W):
            wave = int(24 * (x / W) + 20 * (1 - y / H))
            px[x, y] = (8 + wave // 4, 13 + wave // 3, 34 + wave)
    if kind in {"intro", "outro"}:
        hero = Image.open(ASSETS / "schoolment-opening.png").convert("RGB")
        hero.thumbnail((W, H))
        hero = hero.resize((W, H))
        hero = ImageEnhance.Brightness(hero).enhance(0.48).filter(ImageFilter.GaussianBlur(0.4))
        base = hero
    return base


def make_scene(index: int, title: str, body: str, points: list[str], kind: str):
    image = background(kind)
    overlay = Image.new("RGBA", (W, H), (5, 9, 28, 124 if kind in {"intro", "outro"} else 30))
    image = Image.alpha_composite(image.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(image)
    violet = "#7557ff"
    cyan = "#56c9ff"
    # Brand and progress marker
    draw.rounded_rectangle((90, 68, 142, 120), radius=14, fill=violet)
    draw.text((105, 77), "S", font=font(31, True), fill="white")
    draw.text((160, 76), "Schoolment", font=font(34, True), fill="white")
    draw.text((160, 118), "ONLINE SCHOOL MANAGEMENT SYSTEM", font=font(17), fill="#b7c4df")
    draw.rounded_rectangle((1510, 82, 1818, 102), radius=10, fill="#1a2446")
    draw.rounded_rectangle((1510, 82, 1510 + int(308 * (index + 1) / len(SCENE_DATA)), 102), radius=10, fill=violet)
    # Content panel
    panel_x, panel_y, panel_w, panel_h = 100, 220, 1040, 670
    draw.rounded_rectangle((panel_x, panel_y, panel_x + panel_w, panel_y + panel_h), radius=42, fill=(10, 17, 43, 222), outline=(115, 142, 205, 90), width=2)
    draw.text((panel_x + 72, panel_y + 64), f"{index + 1:02d}  /  SCHOOLMENT", font=font(22, True), fill=cyan)
    y = panel_y + 126
    for line in wrap(draw, title, panel_w - 144, font(64, True)):
        draw.text((panel_x + 72, y), line, font=font(64, True), fill="white")
        y += 78
    y += 22
    for line in wrap(draw, body, panel_w - 144, font(29)):
        draw.text((panel_x + 72, y), line, font=font(29), fill="#c7d1e8")
        y += 43
    chip_y = panel_y + panel_h - 148
    for n, point in enumerate(points):
        x = panel_x + 72 + n * 292
        draw.rounded_rectangle((x, chip_y, x + 260, chip_y + 72), radius=22, fill=(31, 44, 89, 240), outline=(117, 87, 255, 130), width=2)
        draw.ellipse((x + 18, chip_y + 22, x + 34, chip_y + 38), fill=violet)
        for line_i, line in enumerate(wrap(draw, point, 190, font(18, True))[:2]):
            draw.text((x + 50, chip_y + 14 + line_i * 22), line, font=font(18, True), fill="white")
    # Decorative feature orb / device-like card
    draw.ellipse((1320, 260, 1780, 720), fill=(68, 54, 166, 70), outline=(116, 94, 255, 150), width=4)
    draw.rounded_rectangle((1368, 340, 1732, 650), radius=32, fill=(13, 21, 56, 235), outline=(88, 201, 255, 170), width=3)
    draw.rounded_rectangle((1410, 390, 1688, 440), radius=12, fill=violet)
    draw.text((1440, 400), "ONE PLATFORM", font=font(24, True), fill="white")
    for j in range(4):
        yy = 475 + j * 37
        draw.rounded_rectangle((1415, yy, 1668 - j * 18, yy + 18), radius=9, fill=(86, 201, 255, 190 if j % 2 == 0 else 120))
    draw.text((1302, 790), "Built for school teams. Designed for everyday work.", font=font(23), fill="#d6def4")
    image.convert("RGB").save(SCENES / f"scene-{index:02d}.png", quality=94)


async def narration():
    communicate = edge_tts.Communicate(NARRATION, voice="en-IN-NeerjaNeural", rate="-7%")
    await communicate.save(str(AUDIO))


def main():
    SCENES.mkdir(parents=True, exist_ok=True)
    for idx, item in enumerate(SCENE_DATA):
        make_scene(idx, *item)
    asyncio.run(narration())
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    inputs = []
    for idx in range(len(SCENE_DATA)):
        inputs += ["-loop", "1", "-t", "5.5", "-i", str(SCENES / f"scene-{idx:02d}.png")]
    filters = []
    for idx in range(len(SCENE_DATA)):
        filters.append(f"[{idx}:v]scale={W}:{H},setsar=1[v{idx}]")
    previous = "v0"
    for idx in range(1, len(SCENE_DATA)):
        out = f"x{idx}"
        filters.append(f"[{previous}][v{idx}]xfade=transition=fade:duration=0.45:offset={idx * 5.05}[{out}]")
        previous = out
    cmd = [ffmpeg, "-y", *inputs, "-i", str(AUDIO), "-filter_complex", ";".join(filters), "-map", f"[{previous}]", "-map", f"{len(SCENE_DATA)}:a", "-t", "60", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(OUTPUT)]
    subprocess.run(cmd, check=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
