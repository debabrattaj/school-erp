"""Build a 60-second portrait Schoolment YouTube Short using live-app screenshots."""

from __future__ import annotations

import asyncio
import math
import subprocess
from pathlib import Path

import edge_tts
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
SCENES = ROOT / "scenes"
OUT = ROOT / "schoolment-60s-youtube-short.mp4"
AUDIO = ROOT / "narration.mp3"
W, H = 1080, 1920
REGULAR = "C:/Windows/Fonts/segoeui.ttf"
BOLD = "C:/Windows/Fonts/segoeuib.ttf"

SCENES_DATA = [
    ("Your school. One smarter system.", "Schoolment brings every school operation together.", "educator-opening.png", "hero"),
    ("Admissions → student records", "Manage enquiries, documents, admission workflow, classes and guardians in one place.", None, "admissions"),
    ("Know what’s happening today", "Live dashboard metrics give leadership a clear view of students, faculty and collections.", "live-dashboard-metrics.png", "dashboard"),
    ("Attendance without guesswork", "Record attendance, track trends, and flag follow-up needs early.", "live-dashboard-attendance.png", "attendance"),
    ("Fees, dues & receipts", "Collect online, track receivables and keep finance visible for your team.", "live-dashboard-metrics.png", "fees"),
    ("Exams that don’t create extra work", "Schedule assessments, enter marks, publish results and celebrate performance.", "live-dashboard-exams.png", "exams"),
    ("Learning, parents & communication", "Homework, LMS resources, parent portal, notices and WhatsApp-ready updates.", None, "parents"),
    ("Run every operation from one place", "Transport, library, staff and campus activities stay coordinated.", "live-dashboard-profile.png", "operations"),
    ("Support that is always available", "Sai helps teams and families find answers quickly—on web and mobile.", None, "ai"),
    ("Secure. Configurable. Mobile-ready.", "Role-based login, two-factor authentication and audit trails. Book your Schoolment demo.", "live-dashboard-metrics.png", "cta"),
]

NARRATION = """What if your entire school could run from one place? Meet Schoolment. Start with admissions, enquiries, documents, student records, classes and guardians. See the health of your school at a glance with a live dashboard for students, staff, fees and collections. Record attendance in seconds, track trends and act early. Manage fee structures, online collection, dues and receipts with confidence. Plan exams, enter marks, publish results and understand performance without endless spreadsheets. Give teachers an LMS for homework, learning resources, submissions and feedback. Keep parents connected through their portal, mobile apps, notices and WhatsApp-ready communication. Coordinate transport, library, staff and daily campus operations in one connected workflow. Sai, Schoolment’s AI support, helps users get answers faster. And with role-based login, two-factor authentication and audit trails, your school stays in control. Schoolment: one smart system for every school day. Book your demo today."""


def f(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REGULAR, size)


def lines(draw, text, max_width, font):
    output, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        else:
            output.append(current)
            current = word
    if current:
        output.append(current)
    return output


def gradient():
    image = Image.new("RGB", (W, H))
    pix = image.load()
    for y in range(H):
        for x in range(W):
            glow = max(0, 1 - math.hypot((x - 850) / 900, (y - 300) / 1000))
            pix[x, y] = (7 + int(20 * glow), 13 + int(18 * glow), 36 + int(75 * glow))
    return image


def fit(image, size):
    target_w, target_h = size
    ratio = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def scene(index, title, body, asset, variant):
    im = gradient().convert("RGBA")
    if variant == "hero":
        photo = fit(Image.open(ASSETS / asset).convert("RGB"), (W, H))
        im = Image.blend(photo.convert("RGBA"), im, 0.45)
    draw = ImageDraw.Draw(im)
    # Header and progress
    draw.rounded_rectangle((62, 62, 128, 128), radius=18, fill="#7356ff")
    draw.text((81, 72), "S", font=f(38, True), fill="white")
    draw.text((150, 70), "Schoolment", font=f(38, True), fill="white")
    draw.rounded_rectangle((62, 160, 1018, 172), radius=6, fill="#26315a")
    draw.rounded_rectangle((62, 160, 62 + int(956 * (index + 1) / 10), 172), radius=6, fill="#7356ff")
    # Captions
    y = 235
    for text_line in lines(draw, title, 916, f(72, True)):
        draw.text((62, y), text_line, font=f(72, True), fill="white", stroke_width=1, stroke_fill="#0a1029")
        y += 84
    y += 18
    for text_line in lines(draw, body, 890, f(34)):
        draw.text((62, y), text_line, font=f(34), fill="#d9e1fa")
        y += 48
    if asset and variant != "hero":
        screen = Image.open(ASSETS / asset).convert("RGB")
        screen = fit(screen, (912, 570))
        card = Image.new("RGBA", (952, 650), (10, 18, 52, 240))
        card_draw = ImageDraw.Draw(card)
        card_draw.rounded_rectangle((0, 0, 951, 649), radius=38, outline="#8299da", width=3)
        card_draw.rounded_rectangle((31, 30, 921, 600), radius=24, fill="#eef3fc")
        card.alpha_composite(screen.convert("RGBA"), (40, 30))
        im.alpha_composite(card, (64, 800))
        draw = ImageDraw.Draw(im)
        draw.rounded_rectangle((102, 1415, 980, 1512), radius=30, fill="#171f4a", outline="#654eff", width=2)
        draw.text((140, 1442), "REAL SCHOOLMENT DASHBOARD", font=f(26, True), fill="#69caff")
    else:
        # Animated-product style stack for non-dashboard scenes.
        for i, label in enumerate(("CONNECTED MODULES", "WORKFLOWS", "MOBILE ACCESS")):
            yy = 830 + i * 154
            draw.rounded_rectangle((92, yy, 988, yy + 112), radius=28, fill=(24, 34 + i * 10, 83 + i * 18, 245), outline="#7057ff", width=3)
            draw.ellipse((124, yy + 32, 172, yy + 80), fill=(99, 202, 255, 255))
            draw.text((204, yy + 34), label, font=f(31, True), fill="white")
    footer = "schoolment.com   •   Built for modern Indian schools"
    draw.text((62, 1818), footer, font=f(24), fill="#b9c7ec")
    im.convert("RGB").save(SCENES / f"short-{index:02d}.png", quality=94)


async def speak():
    await edge_tts.Communicate(NARRATION, voice="en-IN-NeerjaNeural", rate="-7%").save(str(AUDIO))


def main():
    SCENES.mkdir(parents=True, exist_ok=True)
    for idx, scene_data in enumerate(SCENES_DATA):
        scene(idx, *scene_data)
    asyncio.run(speak())
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    inputs = []
    for idx in range(10):
        inputs += ["-loop", "1", "-t", "6.4", "-i", str(SCENES / f"short-{idx:02d}.png")]
    filters = [f"[{idx}:v]scale={W}:{H},setsar=1[v{idx}]" for idx in range(10)]
    prior = "v0"
    for idx in range(1, 10):
        out = f"x{idx}"
        filters.append(f"[{prior}][v{idx}]xfade=transition=fadeblack:duration=0.4:offset={idx * 6}[{out}]")
        prior = out
    command = [ffmpeg, "-y", *inputs, "-i", str(AUDIO), "-filter_complex", ";".join(filters), "-map", f"[{prior}]", "-map", "10:a", "-t", "60", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(OUT)]
    subprocess.run(command, check=True)
    print(OUT)


if __name__ == "__main__":
    main()
