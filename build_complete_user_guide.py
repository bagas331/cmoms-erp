#!/usr/bin/env python3
"""
build_complete_user_guide.py
Generates the comprehensive 49-slide ERP User Guide PowerPoint presentation
matching the exact design aesthetic of 'User Guide Mockup & Motion.pdf' with full updates for
all latest ERP modules: Approved Archive Kanban, Discussion Chat, Capacity Matrix, SLA Engine, etc.
"""

import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

# ==========================================
# COLOR PALETTE (Clean Enterprise Minimal)
# ==========================================
BG_COLOR = RGBColor(255, 255, 255)         # Pure White
HEADER_BG = RGBColor(248, 250, 252)       # Light Slate
TEXT_MAIN = RGBColor(15, 23, 42)          # Slate 900
TEXT_MUTED = RGBColor(71, 85, 105)        # Slate 600
TEXT_LIGHT = RGBColor(148, 163, 184)      # Slate 400

PRIMARY = RGBColor(13, 148, 136)          # Teal 600 (#0d9488)
PRIMARY_DARK = RGBColor(15, 118, 110)     # Teal 700
PRIMARY_LIGHT = RGBColor(240, 253, 250)   # Teal 50

BLUE_ACCENT = RGBColor(37, 99, 235)       # Blue 600
PINK_ACCENT = RGBColor(219, 39, 119)      # Pink 600
AMBER_ACCENT = RGBColor(217, 119, 6)      # Amber 600
GREEN_ACCENT = RGBColor(22, 163, 74)      # Emerald 600
PURPLE_ACCENT = RGBColor(147, 51, 234)    # Purple 600

CARD_BG = RGBColor(248, 250, 252)         # Slate 50
CARD_BORDER = RGBColor(226, 232, 240)     # Slate 200
HIGHLIGHT_BOX = RGBColor(239, 68, 68)     # Red 500 for callout boxes

FONT_TITLE = "Arial"
FONT_BODY = "Arial"

SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

prs = Presentation()
prs.slide_width = SLIDE_WIDTH
prs.slide_height = SLIDE_HEIGHT
blank_layout = prs.slide_layouts[6]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

import re

def find_image(filename):
    """Find image across screenshots folders or pdf_extracted_images with robust pattern matching."""
    if not filename:
        return None
    if os.path.isabs(filename) and os.path.exists(filename):
        return filename
        
    # Check if pattern is like page_01_img_1 or page_08_img_2
    m = re.match(r'(page_\d+_img_\d+)', filename, re.IGNORECASE)
    page_prefix = m.group(1).lower() if m else None
    
    base_stem = filename.split(".")[0].lower()
    
    search_dirs = [
        os.path.join(BASE_DIR, "pdf_extracted_images"),
        os.path.join(BASE_DIR, "screenshots"),
        BASE_DIR
    ]
    
    # 1. Exact match
    for sdir in search_dirs:
        if os.path.exists(sdir):
            for root, dirs, files in os.walk(sdir):
                if filename in files:
                    return os.path.join(root, filename)
                    
    # 2. Match by page prefix (e.g. page_01_img_1 -> page_01_img_1_14.jpeg)
    if page_prefix:
        for sdir in search_dirs:
            if os.path.exists(sdir):
                for root, dirs, files in os.walk(sdir):
                    for f in sorted(files):
                        if f.lower().startswith(page_prefix):
                            return os.path.join(root, f)
                            
    # 3. Substring match
    for sdir in search_dirs:
        if os.path.exists(sdir):
            for root, dirs, files in os.walk(sdir):
                for f in sorted(files):
                    f_low = f.lower()
                    if base_stem in f_low or filename.lower() in f_low:
                        return os.path.join(root, f)
                        
    return None

def add_header(slide, category, title, page_num):
    if category:
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.35))
        tf_c = cat_box.text_frame
        tf_c.word_wrap = True
        tf_c.margin_left = tf_c.margin_top = tf_c.margin_right = tf_c.margin_bottom = 0
        p_c = tf_c.paragraphs[0]
        p_c.text = category.upper()
        p_c.font.name = FONT_TITLE
        p_c.font.size = Pt(11)
        p_c.font.bold = True
        p_c.font.color.rgb = PRIMARY

    t_top = Inches(0.75) if category else Inches(0.5)
    title_box = slide.shapes.add_textbox(Inches(0.8), t_top, Inches(11.7), Inches(0.6))
    tf_t = title_box.text_frame
    tf_t.word_wrap = True
    tf_t.margin_left = tf_t.margin_top = tf_t.margin_right = tf_t.margin_bottom = 0
    p_t = tf_t.paragraphs[0]
    p_t.text = title
    p_t.font.name = FONT_TITLE
    p_t.font.size = Pt(20)
    p_t.font.bold = True
    p_t.font.color.rgb = TEXT_MAIN

    ftr_box = slide.shapes.add_textbox(Inches(11.5), Inches(7.0), Inches(1.0), Inches(0.3))
    tf_f = ftr_box.text_frame
    tf_f.margin_left = tf_f.margin_top = tf_f.margin_right = tf_f.margin_bottom = 0
    p_f = tf_f.paragraphs[0]
    p_f.alignment = PP_ALIGN.RIGHT
    p_f.text = str(page_num)
    p_f.font.name = FONT_BODY
    p_f.font.size = Pt(10)
    p_f.font.color.rgb = TEXT_LIGHT

def add_role_subtitle(slide, role_text):
    sub_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(11.7), Inches(0.3))
    tf = sub_box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = role_text
    p.font.name = FONT_BODY
    p.font.size = Pt(11)
    p.font.italic = True
    p.font.color.rgb = TEXT_MUTED

def add_image_safe(slide, img_name, left, top, width=None, height=None, caption=None, border_color=None):
    img_path = find_image(img_name)
    if img_path and os.path.exists(img_path):
        if width and height:
            pic = slide.shapes.add_picture(img_path, left, top, width=width, height=height)
        elif width:
            pic = slide.shapes.add_picture(img_path, left, top, width=width)
        elif height:
            pic = slide.shapes.add_picture(img_path, left, top, height=height)
        else:
            pic = slide.shapes.add_picture(img_path, left, top)
            
        if border_color:
            pic.line.color.rgb = border_color
            pic.line.width = Pt(1.5)
            
        if caption:
            c_top = top + (height if height else Inches(3.5)) + Inches(0.06)
            c_box = slide.shapes.add_textbox(left, c_top, width if width else Inches(4.0), Inches(0.25))
            tf = c_box.text_frame
            tf.word_wrap = True
            tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            p.text = caption
            p.font.name = FONT_BODY
            p.font.size = Pt(9.5)
            p.font.italic = True
            p.font.color.rgb = TEXT_LIGHT
        return pic
    else:
        w = width if width else Inches(4.0)
        h = height if height else Inches(3.0)
        box = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, w, h)
        box.fill.solid()
        box.fill.fore_color.rgb = RGBColor(241, 245, 249)
        box.line.color.rgb = RGBColor(203, 213, 225)
        tf = box.text_frame
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        p.text = f"[{img_name}]"
        p.font.size = Pt(10)
        p.font.color.rgb = TEXT_LIGHT
        return box

def add_bullet_list(tf, items, font_size=11):
    for i, item in enumerate(items):
        p = tf.add_paragraph() if (i > 0 or tf.paragraphs[0].text) else tf.paragraphs[0]
        p.space_after = Pt(4)
        if isinstance(item, tuple):
            if len(item) == 3:
                prefix, bold_txt, text = item
            elif len(item) == 2:
                prefix = ""
                bold_txt, text = item
            else:
                prefix = ""
                bold_txt = item[0]
                text = ""
                
            if prefix:
                r0 = p.add_run()
                r0.text = prefix + " "
                r0.font.bold = True
                r0.font.color.rgb = TEXT_MAIN
                r0.font.size = Pt(font_size)
                r0.font.name = FONT_BODY
            if bold_txt:
                r1 = p.add_run()
                r1.text = bold_txt + (" " if not bold_txt.endswith(":") else " ")
                r1.font.bold = True
                r1.font.color.rgb = TEXT_MAIN
                r1.font.size = Pt(font_size)
                r1.font.name = FONT_BODY
            if text:
                r2 = p.add_run()
                r2.text = text
                r2.font.bold = False
                r2.font.color.rgb = TEXT_MUTED
                r2.font.size = Pt(font_size)
                r2.font.name = FONT_BODY
        else:
            r = p.add_run()
            r.text = item
            r.font.bold = False
            r.font.color.rgb = TEXT_MUTED
            r.font.size = Pt(font_size)
            r.font.name = FONT_BODY

def add_red_box(slide, left, top, width, height):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.background()
    shape.line.color.rgb = HIGHLIGHT_BOX
    shape.line.width = Pt(2.5)
    return shape

def add_arrow(slide, left, top, width=Inches(0.4), height=Inches(0.3), color=HIGHLIGHT_BOX, direction="right"):
    shape = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW if direction=="right" else MSO_SHAPE.UP_ARROW, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    return shape

# ==========================================
# SLIDE 1: COVER
# ==========================================
s1 = prs.slides.add_slide(blank_layout)
# Left screenshot
add_image_safe(s1, "page_01_img_1_2.jpeg", Inches(0.8), Inches(1.0), width=Inches(5.0), height=Inches(5.5))
# Right Text
tb1 = s1.shapes.add_textbox(Inches(6.2), Inches(2.2), Inches(6.3), Inches(4.0))
tf1 = tb1.text_frame
tf1.word_wrap = True
p1_sub = tf1.paragraphs[0]
p1_sub.text = "USER GUIDE"
p1_sub.font.name = FONT_TITLE
p1_sub.font.size = Pt(16)
p1_sub.font.bold = True
p1_sub.font.color.rgb = PRIMARY
p1_sub.space_after = Pt(14)

p1_title = tf1.add_paragraph()
p1_title.text = "Aplikasi Monitoring Desain\nInternal & Eksternal"
p1_title.font.name = FONT_TITLE
p1_title.font.size = Pt(28)
p1_title.font.bold = True
p1_title.font.color.rgb = TEXT_MAIN
p1_title.space_after = Pt(16)

p1_desc = tf1.add_paragraph()
p1_desc.text = "Panduan Operasional Lengkap End-to-End untuk Seluruh Tim Kreatif, Motion Graphics, Requester & Management."
p1_desc.font.name = FONT_BODY
p1_desc.font.size = Pt(13)
p1_desc.font.color.rgb = TEXT_MUTED
p1_desc.space_after = Pt(20)

p1_ver = tf1.add_paragraph()
p1_ver.text = "CMOMS Enterprise Platform • Versi 2.4 (Oktober 2026)"
p1_ver.font.name = FONT_BODY
p1_ver.font.size = Pt(11)
p1_ver.font.bold = True
p1_ver.font.color.rgb = PRIMARY_DARK

# ==========================================
# SLIDE 2: PERAN (ROLE) DALAM APLIKASI
# ==========================================
s2 = prs.slides.add_slide(blank_layout)
add_header(s2, "PENGENALAN SISTEM", "Peran (Role) dalam Aplikasi", 2)

# Left List
tb2_l = s2.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(4.5), Inches(5.0))
tf2_l = tb2_l.text_frame
tf2_l.word_wrap = True
roles_summary = [
    ("1.", "Requester / AE", "(Account Executive)"),
    ("2.", "Strategic PIC", "(Tim Konsep & Strategi)"),
    ("3.", "Graphic Designer", "(GD / Tim Desain Grafis)"),
    ("4.", "Motion Designer", "(PIC Motion Graphics)"),
    ("5.", "Operator", "(OP / Tim Live Stream)"),
    ("6.", "Team Lead", "(Supervisi & Penugasan)"),
    ("7.", "System Admin", "(Kontrol Penuh Sistem)")
]
for num, rname, rdesc in roles_summary:
    p = tf2_l.add_paragraph() if tf2_l.paragraphs[0].text else tf2_l.paragraphs[0]
    p.space_after = Pt(12)
    r1 = p.add_run()
    r1.text = f"{num} {rname} "
    r1.font.bold = True
    r1.font.size = Pt(13)
    r1.font.color.rgb = TEXT_MAIN
    r2 = p.add_run()
    r2.text = rdesc
    r2.font.size = Pt(11)
    r2.font.color.rgb = TEXT_MUTED

# Right Table
rows, cols = 8, 2
t_left, t_top, t_w, t_h = Inches(5.6), Inches(1.5), Inches(6.9), Inches(4.8)
tbl_shape = s2.shapes.add_table(rows, cols, t_left, t_top, t_w, t_h)
tbl = tbl_shape.table
tbl.columns[0].width = Inches(2.2)
tbl.columns[1].width = Inches(4.7)

headers = ["Role", "Halaman yang Bisa Diakses"]
for c_idx, h_text in enumerate(headers):
    cell = tbl.cell(0, c_idx)
    cell.fill.solid()
    cell.fill.fore_color.rgb = RGBColor(241, 245, 249)
    p = cell.text_frame.paragraphs[0]
    p.text = h_text
    p.font.bold = True
    p.font.size = Pt(11)
    p.font.color.rgb = TEXT_MAIN

role_access = [
    ("Requester (AE)", "Dashboard, Task Management (Buat & Review Request)"),
    ("Strategic PIC", "Dashboard, Task Management, Workload & Capacity"),
    ("Graphic Designer", "Dashboard, Task Management, Workload & Capacity"),
    ("Motion PIC", "Dashboard, Motion Pipeline, Workload & Capacity"),
    ("Operator", "Target Handover Video (Tanpa sidebar menu mandiri)"),
    ("Team Lead", "Semua halaman, Triage, Penugasan & Approval"),
    ("System Admin", "Semua halaman, Reports, Master Data & Audit Trail")
]

for r_idx, (r_name, r_acc) in enumerate(role_access):
    c0 = tbl.cell(r_idx + 1, 0)
    c0.text_frame.paragraphs[0].text = r_name
    c0.text_frame.paragraphs[0].font.bold = True
    c0.text_frame.paragraphs[0].font.size = Pt(10.5)
    c0.text_frame.paragraphs[0].font.color.rgb = TEXT_MAIN
    
    c1 = tbl.cell(r_idx + 1, 1)
    c1.text_frame.paragraphs[0].text = r_acc
    c1.text_frame.paragraphs[0].font.size = Pt(10)
    c1.text_frame.paragraphs[0].font.color.rgb = TEXT_MUTED

# ==========================================
# SLIDE 3: AKUN & PASSWORD (DEMO USERS)
# ==========================================
s3 = prs.slides.add_slide(blank_layout)
add_header(s3, "AKUN PENGGUNA", "Account & Password (Akun Pengguna Demo)", 3)

# Left Accounts List
tb3 = s3.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.8), Inches(5.3))
tf3 = tb3.text_frame
tf3.word_wrap = True
p_head = tf3.paragraphs[0]
p_head.text = "Akun Pengguna Terdaftar (Aman untuk Uji Coba):"
p_head.font.bold = True
p_head.font.size = Pt(12)
p_head.font.color.rgb = PRIMARY
p_head.space_after = Pt(8)

demo_users = [
    ("1. System Admin", "admin@orbiz.id", "admin123", "ADMIN"),
    ("2. Alfie Rahman", "alfie@orbiz.id", "alfie123", "TEAM LEAD"),
    ("3. Ira Kusuma", "ira@orbiz.id", "ira123", "STRATEGIC PIC"),
    ("4. Mahes Wardana", "mahes@orbiz.id", "mahes123", "STRATEGIC PIC"),
    ("5. Nadya Aulia", "nadya@orbiz.id", "nadya123", "DESIGNER"),
    ("6. Yusuf Pratama", "yusuf@orbiz.id", "yusuf123", "DESIGNER"),
    ("7. Badriyah Sari", "bad@orbiz.id", "bad123", "DESIGNER"),
    ("8. Jova Dirgantara", "jova@orbiz.id", "jova123", "MOTION PIC"),
    ("9. Bima Saputra", "bima@orbiz.id", "bima123", "MOTION PIC"),
    ("10. Sarah Amelia", "sarah@orbiz.id", "sarah123", "REQUESTER"),
    ("11. Reza Firmansyah", "reza@orbiz.id", "reza123", "REQUESTER"),
    ("12. Sam Operator", "sam@orbiz.id", "sam123", "OPERATOR")
]

for name, email, pwd, role in demo_users:
    p = tf3.add_paragraph()
    p.space_after = Pt(3)
    r1 = p.add_run()
    r1.text = f"{name} — {email} — "
    r1.font.size = Pt(10)
    r1.font.color.rgb = TEXT_MAIN
    r2 = p.add_run()
    r2.text = f"[{role}]"
    r2.font.bold = True
    r2.font.size = Pt(9.5)
    r2.font.color.rgb = PRIMARY_DARK

# Right Demo Login Image & Note
add_image_safe(s3, "page_03_img_1_2.jpeg", Inches(6.9), Inches(1.4), width=Inches(5.6), height=Inches(3.4))
tb3_note = s3.shapes.add_textbox(Inches(6.9), Inches(5.0), Inches(5.6), Inches(1.8))
tf3_note = tb3_note.text_frame
tf3_note.word_wrap = True
p_note = tf3_note.paragraphs[0]
p_note.text = "Karena aplikasi masih dalam tahap purwarupa (demo), Anda dapat menggunakan tombol Quick Login di halaman Login untuk masuk dan mencoba berbagai peran (roles) tanpa memasukkan password secara manual."
p_note.font.size = Pt(11)
p_note.font.color.rgb = TEXT_MUTED

# ==========================================
# SLIDE 4: PETA ALUR BISNIS END-TO-END
# ==========================================
s4 = prs.slides.add_slide(blank_layout)
add_header(s4, "ALUR KERJA UTAMA", "Peta Alur Bisnis End-to-End (Complete Lifecycle)", 4)

tb4 = s4.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(11.7), Inches(0.5))
p4 = tb4.text_frame.paragraphs[0]
p4.text = "Siklus hidup operasional kreatif dari pengajuan tiket awal hingga pengarsipan permanen:"
p4.font.size = Pt(12)
p4.font.color.rgb = TEXT_MUTED

# Workflow Flowchart Boxes
flow_steps = [
    ("1. INTAKE", "Requester buat tiket\n& spesifikasi konten", PRIMARY),
    ("2. TRIAGE", "Team Lead / Strat PIC\nAssign PIC & Bobot", BLUE_ACCENT),
    ("3. EXECUTION", "Designer / Motion PIC\nKerjakan desain & start", AMBER_ACCENT),
    ("4. SUBMIT", "Unggah tautan file\nGoogle Drive / Render", PURPLE_ACCENT),
    ("5. REVIEW", "Lead / AE Approve atau\npermintaan Revisi", PINK_ACCENT),
    ("6. HANDOVER", "Video ke Operator /\nDesain Final Disetujui", GREEN_ACCENT),
    ("7. ARCHIVE", "Masuk otomatis ke\nApproved Archive", PRIMARY_DARK)
]

box_w = Inches(1.5)
box_h = Inches(3.8)
start_x = Inches(0.8)
gap_x = Inches(0.18)

for idx, (stitle, sdesc, scolor) in enumerate(flow_steps):
    bx = start_x + idx * (box_w + gap_x)
    by = Inches(2.0)
    
    # Outer box
    card = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, bx, by, box_w, box_h)
    card.fill.solid()
    card.fill.fore_color.rgb = RGBColor(248, 250, 252)
    card.line.color.rgb = scolor
    card.line.width = Pt(1.5)
    
    # Header tag in card
    hbar = s4.shapes.add_shape(MSO_SHAPE.RECTANGLE, bx, by, box_w, Inches(0.6))
    hbar.fill.solid()
    hbar.fill.fore_color.rgb = scolor
    hbar.line.fill.background()
    hp = hbar.text_frame.paragraphs[0]
    hp.text = stitle
    hp.alignment = PP_ALIGN.CENTER
    hp.font.bold = True
    hp.font.size = Pt(10.5)
    hp.font.color.rgb = RGBColor(255, 255, 255)
    
    # Content in card
    tb_c = s4.shapes.add_textbox(bx + Inches(0.1), by + Inches(0.8), box_w - Inches(0.2), Inches(2.8))
    tfc = tb_c.text_frame
    tfc.word_wrap = True
    cp = tfc.paragraphs[0]
    cp.alignment = PP_ALIGN.CENTER
    cp.text = sdesc
    cp.font.size = Pt(10.5)
    cp.font.color.rgb = TEXT_MAIN

# Bottom note
tb4_ft = s4.shapes.add_textbox(Inches(0.8), Inches(6.0), Inches(11.7), Inches(0.8))
p4_f = tb4_ft.text_frame.paragraphs[0]
p4_f.text = "• Seluruh transisi status tercatat di Audit Trail secara real-time.\n• Perhitungan SLA otomatis mengecualikan hari libur nasional & akhir pekan."
p4_f.font.size = Pt(11)
p4_f.font.color.rgb = TEXT_MUTED

# ==========================================
# SLIDE 5: AUTENTIKASI: LOGIN KE APLIKASI
# ==========================================
s5 = prs.slides.add_slide(blank_layout)
add_header(s5, "AUTENTIKASI", "Login & Autentikasi Pengguna", 5)

tb5 = s5.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.5), Inches(5.0))
tf5 = tb5.text_frame
tf5.word_wrap = True

steps_login = [
    ("Langkah Masuk ke Sistem:", ""),
    ("1. Akses Portal:", "Buka browser menuju URL aplikasi monitoring ERP."),
    ("2. Masukkan Kredensial:", "Ketik alamat Email dan Password terdaftar Anda."),
    ("3. Fitur Quick Demo Login:", "Pada mode demo, Anda cukup mengklik salah satu tombol peran (Admin, Designer, Motion PIC, dll.) untuk login instan tanpa mengetik password."),
    ("4. Klik Tombol Sign In:", "Sistem akan memvalidasi otentikasi sesi dan mengarahkan Anda langsung ke Dashboard sesuai hak akses peran Anda."),
    ("5. Keamanan Akses:", "Sesi dilindungi token terenkripsi dengan proteksi Role-Based Access Control (RBAC).")
]
for bold_p, desc in steps_login:
    p = tf5.add_paragraph() if tf5.paragraphs[0].text else tf5.paragraphs[0]
    p.space_after = Pt(8)
    if bold_p.endswith(":"):
        r1 = p.add_run()
        r1.text = bold_p + " "
        r1.font.bold = True
        r1.font.size = Pt(11.5)
        r1.font.color.rgb = PRIMARY if "Langkah" in bold_p else TEXT_MAIN
    if desc:
        r2 = p.add_run()
        r2.text = desc
        r2.font.size = Pt(11)
        r2.font.color.rgb = TEXT_MUTED

add_image_safe(s5, "01_login_page_1791381257616.png", Inches(6.6), Inches(1.4), width=Inches(5.9), height=Inches(5.0), caption="Tampilan Halaman Login & Tombol Quick Login Demo")

# ==========================================
# SLIDE 6: DASHBOARD UTAMA
# ==========================================
s6 = prs.slides.add_slide(blank_layout)
add_header(s6, "DASHBOARD", "Dashboard Utama & Ringkasan KPI Operasional", 6)

tb6 = s6.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.4), Inches(5.2))
tf6 = tb6.text_frame
tf6.word_wrap = True

dash_points = [
    ("Pusat Kendali Operasional Real-Time:", ""),
    ("[1] Metrik Ringkasan (KPIs):", "Menampilkan total tiket aktif, tugas dalam pengerjaan (In Progress), dalam review, dan selesai bulan ini."),
    ("[2] Beban Kerja Desainer:", "Visualisasi cepat kapasitas harian tim desain dan desainer yang berstatus overload."),
    ("[3] Peringatan SLA & Jatuh Tempo:", "Notifikasi langsung untuk tiket yang mendekati atau telah melewati Service Level Agreement."),
    ("[4] Distribusi Brand & Pipeline:", "Grafik proporsi permintaan berdasarkan klien utama (Internal vs Eksternal)."),
    ("[5] Akses Cepat:", "Navigasi instan ke antrean tugas prioritas tinggi.")
]
for bold_p, desc in dash_points:
    p = tf6.add_paragraph() if tf6.paragraphs[0].text else tf6.paragraphs[0]
    p.space_after = Pt(6)
    if bold_p:
        r1 = p.add_run()
        r1.text = bold_p + " "
        r1.font.bold = True
        r1.font.size = Pt(11.5)
        r1.font.color.rgb = PRIMARY if "Pusat" in bold_p else TEXT_MAIN
    if desc:
        r2 = p.add_run()
        r2.text = desc
        r2.font.size = Pt(11)
        r2.font.color.rgb = TEXT_MUTED

add_image_safe(s6, "02_dashboard_overview_1791381296787.png", Inches(6.4), Inches(1.4), width=Inches(6.1), height=Inches(5.0), caption="Dashboard Ringkasan Operasional & Grafik Metrik")

# ==========================================
# SLIDE 7: STRUKTUR NAVIGASI & SIDEBAR
# ==========================================
s7 = prs.slides.add_slide(blank_layout)
add_header(s7, "NAVIGASI", "Struktur Menu Navigasi & Sidebar", 7)

tb7 = s7.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.8), Inches(5.2))
tf7 = tb7.text_frame
tf7.word_wrap = True

nav_points = [
    ("Grup Menu Sidebar:", ""),
    ("A. MAIN MENU (Operasional Harian):", ""),
    ("• Dashboard:", "Ringkasan metrik dan aktivitas umum."),
    ("• Task Management:", "Manajemen desain grafis/mockup statis."),
    ("• Motion Pipeline:", "Manajemen produksi video & animasi motion."),
    ("• Workload & Capacity:", "Matriks beban kerja & alokasi poin tim."),
    ("• Reports & Analytics:", "Laporan performa SLA & tren output."),
    ("B. ADMINISTRATION (Data Master & Audit):", ""),
    ("• Clients / Brands:", "Kelola master klien & status kerjasama."),
    ("• Content Types:", "Pengaturan format desain & bobot kesulitan bawaan."),
    ("• Holiday Calendar:", "Registrasi hari libur nasional & cuti bersama."),
    ("• User Management:", "Kelola pengguna, peran & batas kapasitas poin."),
    ("• Audit Trail:", "Perekam jejak aktivitas sistem secara permanen.")
]
for bold_p, desc in nav_points:
    p = tf7.add_paragraph() if tf7.paragraphs[0].text else tf7.paragraphs[0]
    p.space_after = Pt(3)
    if bold_p:
        r1 = p.add_run()
        r1.text = bold_p + " "
        r1.font.bold = True
        r1.font.size = Pt(11)
        r1.font.color.rgb = PRIMARY_DARK if "MENU" in bold_p else TEXT_MAIN
    if desc:
        r2 = p.add_run()
        r2.text = desc
        r2.font.size = Pt(10.5)
        r2.font.color.rgb = TEXT_MUTED

add_image_safe(s7, "sidebar_navigation_1791382271817.png", Inches(7.0), Inches(1.4), width=Inches(5.5), height=Inches(5.0), caption="Tampilan Struktur Sidebar Menu Lengkap")

# ==========================================
# SLIDE 8: TASK MANAGEMENT (PENGENALAN)
# ==========================================
s8 = prs.slides.add_slide(blank_layout)
add_header(s8, "TASK MANAGEMENT", "Task Management (Pusat Kendali Desain Statis)", 8)

tb8_top = s8.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(11.7), Inches(0.8))
tf8_t = tb8_top.text_frame
tf8_t.word_wrap = True
p8_t = tf8_t.paragraphs[0]
p8_t.text = "Halaman Task Management adalah pusat kendali untuk memantau, mengelola, dan melacak seluruh permintaan Mockup dari awal hingga selesai. Halaman ini dirancang untuk memfasilitasi kolaborasi antara Requester (AE), Designer (GD), dan Team Lead."
p8_t.font.size = Pt(12)
p8_t.font.color.rgb = TEXT_MUTED

add_image_safe(s8, "page_04_img_1_2.jpeg", Inches(0.8), Inches(2.2), width=Inches(11.7), height=Inches(4.5), caption="Tampilan Penuh Halaman Task Management (Mockup Pipeline)")

# ==========================================
# SLIDE 9: TASK MANAGEMENT (VIEW MODES)
# ==========================================
s9 = prs.slides.add_slide(blank_layout)
add_header(s9, "TASK MANAGEMENT", "2. Navigasi Tampilan (View Modes)", 9)

tb9 = s9.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(5.8), Inches(3.0))
tf9 = tb9.text_frame
tf9.word_wrap = True
p9_intro = tf9.paragraphs[0]
p9_intro.text = "Anda dapat melihat daftar tugas dalam dua pilihan tampilan sesuai dengan kebutuhan Anda. Tombol pengaturan tampilan berada di bagian kanan atas halaman (di sebelah kolom pencarian)."
p9_intro.font.size = Pt(11)
p9_intro.font.color.rgb = TEXT_MUTED
p9_intro.space_after = Pt(8)

add_bullet_list(tf9, [
    ("A.", "Tampilan Kanban (Kanban View):", "Tampilan visual berbentuk papan (board) yang membagi tugas berdasarkan statusnya saat ini (misal: Unassigned, Assigned, In Progress, Submitted, dsb.)."),
    ("B.", "Tampilan Tabel (Table View):", "Tampilan berupa daftar baris yang padat informasi, menampilkan detail seperti Kode Task, Brand, Kesulitan, Status, SLA, Tanggal, dan Aksi."),
    ("", "Cara pakai:", "Klik card/kartu tugas untuk melihat detail dari tugas tersebut.")
], font_size=10.5)

add_image_safe(s9, "page_05_img_1_2.jpeg", Inches(0.8), Inches(4.5), width=Inches(3.2), height=Inches(1.8))
add_image_safe(s9, "page_05_img_2_3.jpeg", Inches(6.8), Inches(1.3), width=Inches(5.7), height=Inches(2.7), caption="Screenshot Tampilan Kanban")
add_image_safe(s9, "page_05_img_3_4.jpeg", Inches(6.8), Inches(4.2), width=Inches(5.7), height=Inches(2.7), caption="Screenshot Tampilan Tabel")

# ==========================================
# SLIDE 10: TASK MANAGEMENT (SEARCH & FILTER)
# ==========================================
s10 = prs.slides.add_slide(blank_layout)
add_header(s10, "TASK MANAGEMENT", "3. Fitur Pencarian dan Filter", 10)

tb10 = s10.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(11.7), Inches(0.4))
p10_in = tb10.text_frame.paragraphs[0]
p10_in.text = "Gunakan toolbar di bagian atas untuk menemukan spesifik tugas yang Anda cari:"
p10_in.font.size = Pt(11.5)
p10_in.font.color.rgb = TEXT_MUTED

tb10_b = s10.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(11.7), Inches(2.2))
tf10_b = tb10_b.text_frame
tf10_b.word_wrap = True

add_bullet_list(tf10_b, [
    ("•", "Kolom Pencarian:", "Ketik nama Brand, nama Campaign, Kode Task, atau nama Designer untuk mencari tugas dengan cepat."),
    ("•", "Filter Waktu:", "Menyaring daftar tugas berdasarkan Bulan dan Tahun, atau gunakan fitur kalender 'Exact Date' untuk mencari tugas di tanggal spesifik."),
    ("•", "Filter Status:", "Menampilkan tugas hanya dengan status tertentu (contoh: Hanya menampilkan yang 'In Progress')."),
    ("•", "Filter Designer:", "Menampilkan tugas yang sedang dikerjakan oleh Designer tertentu."),
    ("•", "Tombol Export:", "Klik Export untuk mengunduh data tugas yang sedang tampil ke dalam bentuk file Microsoft Excel / CSV.")
], font_size=11)

add_image_safe(s10, "page_06_img_1_2.jpeg", Inches(0.8), Inches(4.3), width=Inches(11.7), height=Inches(2.5), caption="Screenshot Bagian Toolbar / Filter & Tombol Export")
add_red_box(s10, Inches(0.85), Inches(4.7), Inches(4.8), Inches(1.2))
add_red_box(s10, Inches(10.2), Inches(4.7), Inches(2.2), Inches(1.2))

# ==========================================
# SLIDE 11: CARA MEMBUAT TASK BARU
# ==========================================
s11 = prs.slides.add_slide(blank_layout)
add_header(s11, "TASK MANAGEMENT", "4. Cara Membuat Task Baru (Create New Task)", 11)
add_role_subtitle(s11, "Khusus Role: Admin, Team Lead, Requester, Strategic PIC")

tb11 = s11.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.8), Inches(4.8))
tf11 = tb11.text_frame
tf11.word_wrap = True

steps_cnew = [
    ("1. Klik Tombol:", "Klik tombol '+ New Task' berwarna biru di pojok kanan atas."),
    ("2. Form Input:", "Akan muncul jendela Create New Task."),
    ("3. Isi Data Wajib:", ""),
    ("   • Client / Brand:", "Pilih brand terkait."),
    ("   • Content Type:", "Jenis konten (Feed, Story, Banner, dsb.)."),
    ("   • Campaign Name:", "Nama acara/kampanye (misal: Promo 8.8)."),
    ("   • Task Source:", "Sumber tugas (Orca atau E-Commerce)."),
    ("   • Request Qty:", "Jumlah keluaran desain yang dibutuhkan."),
    ("   • Req Date & Due Date:", "Tanggal diajukan dan target selesai."),
    ("4. Opsi Strategic:", "Jika butuh konsep strategis, aktifkan toggle 'Requires Strategic?' dan pilih nama Strategic PIC."),
    ("5. Kolom Notes:", "(Opsional) Tambahkan catatan/brief referensi."),
    ("6. Simpan:", "Klik 'Create Task'. Status awal adalah Unassigned.")
]
for bold_p, desc in steps_cnew:
    p = tf11.add_paragraph() if tf11.paragraphs[0].text else tf11.paragraphs[0]
    p.space_after = Pt(2)
    if bold_p:
        r1 = p.add_run()
        r1.text = bold_p + " "
        r1.font.bold = True
        r1.font.size = Pt(10.5)
        r1.font.color.rgb = TEXT_MAIN
    if desc:
        r2 = p.add_run()
        r2.text = desc
        r2.font.size = Pt(10)
        r2.font.color.rgb = TEXT_MUTED

add_image_safe(s11, "page_07_img_2_61.jpeg", Inches(6.8), Inches(1.7), width=Inches(5.7), height=Inches(4.5), caption="Screenshot Modal Create New Task")
add_image_safe(s11, "page_07_img_1_45.jpeg", Inches(1.5), Inches(5.6), width=Inches(2.8), height=Inches(1.1))
add_red_box(s11, Inches(2.1), Inches(5.7), Inches(2.1), Inches(0.9))

# ==========================================
# SLIDE 12: ALUR KERJA — LANGKAH 1: ASSIGN TASK
# ==========================================
s12 = prs.slides.add_slide(blank_layout)
add_header(s12, "TASK MANAGEMENT", "5. Alur Kerja Tugas — Langkah 1: Assign Task", 12)
add_role_subtitle(s12, "Role: Admin, Team Lead")

tb12 = s12.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(8.0), Inches(2.1))
tf12 = tb12.text_frame
tf12.word_wrap = True

add_bullet_list(tf12, [
    ("•", "Cari Tugas:", "Temukan tugas dengan status Unassigned pada Kanban atau Tabel."),
    ("•", "Klik Assign:", "Klik tombol 'Assign' pada kartu tugas atau modal detail."),
    ("•", "Pilih Design PIC:", "Pilih Designer yang akan mengerjakan. Sistem menampilkan sisa kapasitas poin harian masing-masing desainer."),
    ("•", "Tentukan Difficulty:", "Pilih tingkat kesulitan (Low, Medium, High)."),
    ("•", "Konfirmasi:", "Klik Assign. Status tugas akan berubah menjadi Assigned.")
], font_size=11)

add_image_safe(s12, "page_08_img_1_68.jpeg", Inches(0.8), Inches(4.0), width=Inches(3.2), height=Inches(2.7))
add_arrow(s12, Inches(4.1), Inches(5.2), width=Inches(0.35), height=Inches(0.25))
add_image_safe(s12, "page_08_img_3_70.jpeg", Inches(4.55), Inches(4.2), width=Inches(3.8), height=Inches(2.4))
add_arrow(s12, Inches(8.45), Inches(5.2), width=Inches(0.35), height=Inches(0.25))
add_image_safe(s12, "page_08_img_2_69.jpeg", Inches(8.9), Inches(4.0), width=Inches(3.6), height=Inches(2.7), caption="Screenshot Modal Assign Task")
add_image_safe(s12, "page_08_img_4_71.jpeg", Inches(9.5), Inches(1.1), width=Inches(2.8), height=Inches(2.5))
add_arrow(s12, Inches(10.8), Inches(3.7), width=Inches(0.25), height=Inches(0.35), direction="up")

# ==========================================
# SLIDE 13: ALUR KERJA — LANGKAH 2: START TASK
# ==========================================
s13 = prs.slides.add_slide(blank_layout)
add_header(s13, "TASK MANAGEMENT", "Langkah 2: Start Task (Memulai Pengerjaan)", 13)
add_role_subtitle(s13, "Role: Designer yang ditugaskan, Admin, Team Lead")

tb13 = s13.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.4), Inches(4.5))
tf13 = tb13.text_frame
tf13.word_wrap = True

add_bullet_list(tf13, [
    ("1.", "Siap Mengerjakan:", "Ketika Designer siap untuk mulai mengerjakan, cari tugas dengan status Assigned."),
    ("2.", "Klik Start Work:", "Klik tombol 'Start Work' (ikon Play warna hijau/cyan)."),
    ("3.", "Status Berubah:", "Status tugas otomatis berubah menjadi In Progress."),
    ("4.", "Catatan SLA:", "Perhitungan waktu pengerjaan (SLA Working Days) otomatis akan mulai dihitung dari titik ini berdasarkan jam kerja efektif.")
], font_size=11.5)

add_image_safe(s13, "page_09_img_1_2.jpeg", Inches(6.5), Inches(1.8), width=Inches(6.0), height=Inches(4.8), caption="Tombol Start Work pada Modal Task Detail")
add_red_box(s13, Inches(10.5), Inches(5.2), Inches(1.7), Inches(0.7))

# ==========================================
# SLIDE 14: ALUR KERJA — LANGKAH 3: SUBMIT DESIGN
# ==========================================
s14 = prs.slides.add_slide(blank_layout)
add_header(s14, "TASK MANAGEMENT", "Langkah 3: Submit Design (Mengirimkan Hasil)", 14)
add_role_subtitle(s14, "Role: Designer yang ditugaskan, Admin, Team Lead")

tb14 = s14.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(11.7), Inches(1.6))
tf14 = tb14.text_frame
tf14.word_wrap = True
add_bullet_list(tf14, [
    ("•", "Selesai Pengerjaan:", "Setelah desain selesai dikerjakan, klik tombol Submit (ikon Pesawat Kertas)."),
    ("•", "Formulir Pengiriman:", "Akan muncul formulir pelaporan yang harus diisi:"),
    ("   - Output Quantity:", "Jumlah final hasil desain yang diserahkan."),
    ("   - Final Asset Name:", "Nama file aset final yang distandarisasi."),
    ("   - Google Drive Link:", "Tautan URL menuju folder desain di Google Drive."),
    ("•", "Hasil:", "Klik Submit. Status tugas akan berubah menjadi Submitted.")
], font_size=11)

add_image_safe(s14, "page_10_img_1_3.jpeg", Inches(0.8), Inches(3.5), width=Inches(2.8), height=Inches(3.2))
add_arrow(s14, Inches(3.8), Inches(4.8), width=Inches(0.4), height=Inches(0.3))
add_image_safe(s14, "page_10_img_2_4.jpeg", Inches(4.4), Inches(3.6), width=Inches(4.2), height=Inches(3.0))
add_arrow(s14, Inches(8.8), Inches(4.8), width=Inches(0.4), height=Inches(0.3))
add_image_safe(s14, "page_10_img_3_5.jpeg", Inches(9.4), Inches(3.6), width=Inches(3.2), height=Inches(3.0), caption="Screenshot Form Submit")

# ==========================================
# SLIDE 15: ALUR KERJA — LANGKAH 4: APPROVE / REVISE
# ==========================================
s15 = prs.slides.add_slide(blank_layout)
add_header(s15, "TASK MANAGEMENT", "Langkah 4: Approve / Revise (Proses Review)", 15)
add_role_subtitle(s15, "Role: Requester, Admin, Team Lead")

tb15 = s15.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.5), Inches(4.8))
tf15 = tb15.text_frame
tf15.word_wrap = True

add_bullet_list(tf15, [
    ("•", "Pemeriksaan Hasil:", "Requester diwajibkan memeriksa hasil desain menggunakan tautan Google Drive yang disertakan."),
    ("•", "Opsi 1: Approve (Sesuai):", "Jika sudah sesuai, klik tombol 'Approve Design' (ikon Centang hijau). Status menjadi Approved dan tugas dianggap selesai."),
    ("•", "Opsi 2: Revise (Perlu Perbaikan):", "Jika ada revisi, klik tombol 'Request Revision' (ikon Putar Balik/Rotate)."),
    ("   - Alasan Revisi:", "Pilih Reason Category (misal: Copywriting, Color, Layout)."),
    ("   - Catatan Revisi:", "Tuliskan instruksi perbaikan spesifik di kolom Notes."),
    ("•", "Hasil Revisi:", "Status berubah menjadi Revision dan tugas kembali ke antrean Designer.")
], font_size=11)

add_image_safe(s15, "page_11_img_1_2.jpeg", Inches(6.5), Inches(1.8), width=Inches(6.0), height=Inches(4.8), caption="Tombol Request Revision & Approve Design")
add_red_box(s15, Inches(6.6), Inches(5.3), Inches(5.8), Inches(0.8))

# ==========================================
# SLIDE 16: ALUR KERJA — LANGKAH 5: PENGERJAAN REVISI
# ==========================================
s16 = prs.slides.add_slide(blank_layout)
add_header(s16, "TASK MANAGEMENT", "Langkah 5: Pengerjaan Revisi (Revision Flow)", 16)
add_role_subtitle(s16, "Role: Graphic Designer")

tb16 = s16.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.5), Inches(4.8))
tf16 = tb16.text_frame
tf16.word_wrap = True

add_bullet_list(tf16, [
    ("1.", "Pantau Antrean Revisi:", "Designer wajib memantau kartu tugas yang berstatus Revision pada kolom papan Kanban."),
    ("2.", "Baca Catatan Revisi:", "Buka detail tugas untuk membaca Revision History dan instruksi perbaikan dari Requester."),
    ("3.", "Perbaiki Desain:", "Lakukan revisi aset desain sesuai catatan yang diminta."),
    ("4.", "Re-Submit:", "Setelah selesai, klik tombol 'Submit Output / Re-Submit' dan perbarui tautan aset Google Drive jika ada versi baru."),
    ("5.", "Siklus Review Ulang:", "Proses akan kembali mengulang Langkah 4 untuk di-review ulang oleh Requester hingga disetujui.")
], font_size=11.5)

add_image_safe(s16, "page_12_img_1_2.jpeg", Inches(6.5), Inches(1.8), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Riwayat Catatan Revisi & Tombol Re-Submit")

# ==========================================
# SLIDE 17: FITUR KHUSUS: BATAL STATUS (UNDO STATUS)
# ==========================================
s17 = prs.slides.add_slide(blank_layout)
add_header(s17, "TASK MANAGEMENT", "Fitur Tambahan: Batal Status (Undo Status)", 17)
add_role_subtitle(s17, "Role: Admin, Team Lead")

tb17 = s17.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.5), Inches(4.5))
tf17 = tb17.text_frame
tf17.word_wrap = True

add_bullet_list(tf17, [
    ("•", "Fungsi Proteksi Alur Kerja:", "Jika terjadi kesalahan klik tahapan (misalnya tugas belum selesai tapi tidak sengaja ter-submit atau salah di-approve), Admin atau Team Lead dapat menggunakan fitur Undo Status."),
    ("•", "Cara Pakai:", "Buka Task Detail pada tugas yang ingin diperbaiki, lalu klik tombol 'Undo Status' (ikon Panah Mundur)."),
    ("•", "Efek:", "Status tugas akan kembali mundur 1 tahapan sebelumnya (misal: dari Submitted kembali ke In Progress)."),
    ("•", "Pencatatan Log:", "Setiap aksi Undo dicatat dalam Audit Trail untuk mencegah penyalahgunaan alur.")
], font_size=11.5)

add_image_safe(s17, "page_13_img_1_2.jpeg", Inches(6.5), Inches(1.8), width=Inches(6.0), height=Inches(4.8), caption="Tombol Undo Status pada Modal Detail")
add_red_box(s17, Inches(8.8), Inches(5.4), Inches(1.2), Inches(0.6))

# ==========================================
# SLIDE 18: MELIHAT DETAIL & RIWAYAT TUGAS
# ==========================================
s18 = prs.slides.add_slide(blank_layout)
add_header(s18, "TASK MANAGEMENT", "6. Melihat Detail & Riwayat Tugas (Task Detail)", 18)

tb18 = s18.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.5), Inches(4.8))
tf18 = tb18.text_frame
tf18.word_wrap = True

add_bullet_list(tf18, [
    ("Untuk Melacak Progres Detail & Riwayat Tugas:", ""),
    ("1. Buka Detail:", "Klik area kartu pada mode Kanban, ATAU klik teks berwarna biru pada Task Code (contoh: REQ-2026-001) pada mode Table."),
    ("2. Konten Modal Detail:", ""),
    ("   • Informasi Spesifikasi:", "Data Klien/Brand, Campaign, Content Type, Qty, Target Due Date, dan Strategic PIC."),
    ("   • Metrik SLA:", "Waktu mulai, waktu selesai, dan durasi SLA Working Days."),
    ("   • Tautan Aset Final:", "Akses langsung menuju Google Drive folder."),
    ("   • Audit Trail (Riwayat Aktivitas):", "Menampilkan semua rekam jejak berurutan: siapa pelaku, kapan waktu tepatnya, dan catatan perubahan data.")
], font_size=11)

add_image_safe(s18, "page_14_img_2_3.jpeg", Inches(6.5), Inches(1.7), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Modal Task Detail & Audit Trail")

# ==========================================
# SLIDE 19: MOTION MANAGEMENT (PENGENALAN)
# ==========================================
s19 = prs.slides.add_slide(blank_layout)
add_header(s19, "MOTION MANAGEMENT", "Motion Pipeline (Produksi Video & Animasi)", 19)

tb19 = s19.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(11.7), Inches(0.8))
tf19 = tb19.text_frame
tf19.word_wrap = True
p19 = tf19.paragraphs[0]
p19.text = "Halaman Motion Management atau Motion Graphics Pipeline adalah fitur yang dikhususkan untuk memantau, mengelola, dan mengeksekusi tugas-tugas berbasis video atau animasi (Motion Graphics). Halaman ini mempertemukan Requester/AE, Motion Designer, dan Operator (Tim Live)."
p19.font.size = Pt(12)
p19.font.color.rgb = TEXT_MUTED

add_image_safe(s19, "page_15_img_1_2.jpeg", Inches(0.8), Inches(2.2), width=Inches(11.7), height=Inches(4.5), caption="Screenshot Penuh Halaman Motion Graphics Pipeline")

# ==========================================
# SLIDE 20: MOTION MANAGEMENT (KANBAN BOARD)
# ==========================================
s20 = prs.slides.add_slide(blank_layout)
add_header(s20, "MOTION MANAGEMENT", "2. Navigasi Tampilan (Kanban Board Motion)", 20)

tb20 = s20.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(11.7), Inches(1.2))
tf20 = tb20.text_frame
tf20.word_wrap = True
p20 = tf20.paragraphs[0]
p20.text = "Berbeda dengan tugas desain statis, halaman Motion secara eksklusif menggunakan Tampilan Kanban (Papan Visual). Tugas bergerak dari kiri ke kanan berdasarkan statusnya:"
p20.font.size = Pt(11.5)
p20.font.color.rgb = TEXT_MUTED
p20.space_after = Pt(4)

p20_flow = tf20.add_paragraph()
p20_flow.text = "Queued (Antrean)  ➔  In Progress  ➔  Submitted  ➔  Revision  ➔  Approved  ➔  Completed (Handover)"
p20_flow.font.bold = True
p20_flow.font.size = Pt(12)
p20_flow.font.color.rgb = PRIMARY_DARK

add_image_safe(s20, "page_16_img_1_2.jpeg", Inches(0.8), Inches(2.8), width=Inches(11.7), height=Inches(4.0), caption="Screenshot Papan Kanban Motion Pipeline")

# ==========================================
# SLIDE 21: MOTION MANAGEMENT (SEARCH & FILTER)
# ==========================================
s21 = prs.slides.add_slide(blank_layout)
add_header(s21, "MOTION MANAGEMENT", "3. Fitur Pencarian dan Filter Motion", 21)

tb21 = s21.shapes.add_textbox(Inches(0.8), Inches(1.3), Inches(11.7), Inches(2.2))
tf21 = tb21.text_frame
tf21.word_wrap = True

add_bullet_list(tf21, [
    ("Alat Penyaringan Antrean Video Khusus:", ""),
    ("• Kolom Pencarian:", "Cari tugas berdasarkan Nama Brand, Jenis Kampanye, Kode Tugas (contoh: MOT-2026-001), atau Nama Motion Designer."),
    ("• Filter Waktu:", "Menyaring daftar berdasarkan Bulan, Tahun, atau tanggal spesifik (Exact Date)."),
    ("• Filter Status:", "Menampilkan tugas hanya dengan status tertentu (misal: Queued, In Progress, Submitted)."),
    ("• Filter Designer:", "Menampilkan daftar tugas milik PIC Motion tertentu.")
], font_size=11)

add_image_safe(s21, "page_17_img_1_2.jpeg", Inches(0.8), Inches(3.8), width=Inches(11.7), height=Inches(2.8), caption="Screenshot Bagian Filter & Tombol Create Request Motion")

# ==========================================
# SLIDE 22: CARA MEMBUAT TUGAS MOTION BARU
# ==========================================
s22 = prs.slides.add_slide(blank_layout)
add_header(s22, "MOTION MANAGEMENT", "4. Cara Membuat Tugas Motion Baru (Create Request)", 22)

tb22 = s22.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.8), Inches(5.0))
tf22 = tb22.text_frame
tf22.word_wrap = True

add_bullet_list(tf22, [
    ("Pembuatan Tugas Motion (Standalone):", ""),
    ("1. Klik Tombol:", "Klik tombol 'Create Request' berwarna pink di pojok kanan atas."),
    ("2. Isi Kolom Wajib:", ""),
    ("   • Brand:", "Pilih nama klien/brand."),
    ("   • Platform:", "Target tayang (TikTok, Shopee, Reels, YouTube)."),
    ("   • Tipe Motion:", "Deskripsi animasi (2D Animation, Lower Thirds, dsb.)."),
    ("   • Jenis Kampanye:", "Pilih BaU, PayDay, Double Date (DD), atau Special."),
    ("   • Studio:", "Tentukan lokasi studio (Jakarta / Bandung)."),
    ("   • Tanggal Produksi & Periode:", "Jadwal produksi & tanggal tayang."),
    ("3. Pilih PIC Motion:", "(Opsional) Pilih desainer video yang ditugaskan."),
    ("4. Simpan:", "Klik 'Buat Request'. Tugas otomatis masuk kolom Queued.")
], font_size=10.5)

add_image_safe(s22, "page_18_img_1_2.jpeg", Inches(6.8), Inches(1.5), width=Inches(5.7), height=Inches(4.8), caption="Screenshot Modal Create Motion Request")

# ==========================================
# SLIDE 23: ALUR MOTION — START & SUBMIT
# ==========================================
s23 = prs.slides.add_slide(blank_layout)
add_header(s23, "MOTION MANAGEMENT", "Alur Kerja Motion — Start & Submit Render", 23)
add_role_subtitle(s23, "Role: Motion PIC yang ditugaskan, Admin, Team Lead")

# Left: Start Task
tb23_l = s23.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.5), Inches(2.2))
tf23_l = tb23_l.text_frame
tf23_l.word_wrap = True
add_bullet_list(tf23_l, [
    ("Langkah 2: Memulai (Start)", ""),
    ("• Cari Tugas:", "Motion PIC mencari tugasnya di kolom Queued."),
    ("• Klik Start:", "Klik tombol Start (ikon Play warna Cyan)."),
    ("• Status:", "Berpindah ke kolom In Progress. SLA pengerjaan mulai berjalan.")
], font_size=11)
add_image_safe(s23, "page_19_img_1_2.jpeg", Inches(0.8), Inches(4.0), width=Inches(5.5), height=Inches(2.7), caption="Tombol Start pada Kolom Queued")

# Right: Submit Task
tb23_r = s23.shapes.add_textbox(Inches(6.8), Inches(1.8), Inches(5.7), Inches(2.2))
tf23_r = tb23_r.text_frame
tf23_r.word_wrap = True
add_bullet_list(tf23_r, [
    ("Langkah 3: Pengiriman (Submit)", ""),
    ("• Render Selesai:", "Setelah video dirender dan diunggah ke cloud (Drive)."),
    ("• Klik Submit:", "Klik tombol Submit (ikon Centang)."),
    ("• Isi Link Output:", "Masukkan URL file render final & catatan (opsional)."),
    ("• Status:", "Berpindah ke kolom Submitted.")
], font_size=11)
add_image_safe(s23, "page_20_img_1_2.jpeg", Inches(6.8), Inches(4.0), width=Inches(5.7), height=Inches(2.7), caption="Screenshot Modal Submit Motion")

# ==========================================
# SLIDE 24: ALUR MOTION — APPROVE & REVISION
# ==========================================
s24 = prs.slides.add_slide(blank_layout)
add_header(s24, "MOTION MANAGEMENT", "Langkah 4: Review, Approve & Revision Motion", 24)
add_role_subtitle(s24, "Role: Requester, Admin, Team Lead")

tb24 = s24.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.5), Inches(4.8))
tf24 = tb24.text_frame
tf24.word_wrap = True

add_bullet_list(tf24, [
    ("Proses Review Hasil Render Video:", ""),
    ("1. Pengecekan Video:", "Requester melakukan review hasil render melalui tautan 'View Output' pada kartu tugas."),
    ("2. Opsi Sesuai (Approve):", "Klik tombol Approve (ikon Centang hijau). Status maju ke Approved."),
    ("3. Opsi Perlu Revisi:", "Klik tombol Revision (ikon Putar Balik kuning)."),
    ("   - Tulis Catatan:", "Masukkan detail perbaikan (misal: timing transisi, audio sync, typo)."),
    ("   - Status:", "Mundur ke kolom Revision agar Motion PIC memperbaiki dan melakukan Re-submit.")
], font_size=11)

add_image_safe(s24, "page_21_img_1_2.jpeg", Inches(6.5), Inches(1.8), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Kolom Submitted & Revision Motion")

# ==========================================
# SLIDE 25: ALUR MOTION — HANDOVER KE OPERATOR
# ==========================================
s25 = prs.slides.add_slide(blank_layout)
add_header(s25, "MOTION MANAGEMENT", "Langkah 5: Handover / Complete (Penyerahan ke Operator)", 25)
add_role_subtitle(s25, "Role: Admin, Team Lead")

tb25 = s25.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.5), Inches(4.8))
tf25 = tb25.text_frame
tf25.word_wrap = True

add_bullet_list(tf25, [
    ("Penyerahan Video ke Tim Live / Broadcast:", ""),
    ("• Video Approved:", "Video yang sudah Approved harus diserahkan kepada tim operasional (Operator/Tim Live) untuk ditayangkan."),
    ("• Klik Handover:", "Klik tombol Handover pada kartu tugas berstatus Approved."),
    ("• Pilih Operator:", "Akan muncul daftar Operator. Pilih nama Operator yang bertugas (contoh: Sam Operator)."),
    ("• Selesai:", "Klik Handover (Complete). Status akhir menjadi Completed dan video siap disiarkan!")
], font_size=11.5)

add_image_safe(s25, "page_22_img_1_3.jpeg", Inches(6.5), Inches(2.0), width=Inches(2.5), height=Inches(3.2))
add_arrow(s25, Inches(9.2), Inches(3.5), width=Inches(0.4), height=Inches(0.3))
add_image_safe(s25, "page_22_img_2_4.jpeg", Inches(9.8), Inches(2.3), width=Inches(2.7), height=Inches(2.6), caption="Modal Handover")

# ==========================================
# SLIDE 26: MELIHAT DETAIL MOTION TASK
# ==========================================
s26 = prs.slides.add_slide(blank_layout)
add_header(s26, "MOTION MANAGEMENT", "6. Melihat Detail Motion Task", 26)

tb26 = s26.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.5), Inches(4.8))
tf26 = tb26.text_frame
tf26.word_wrap = True

add_bullet_list(tf26, [
    ("Akses Informasi Mendalam Tugas Video:", ""),
    ("1. Cara Buka:", "Klik tepat di tengah/area kartu tugas pada papan Kanban Motion."),
    ("2. Jendela Detail Memuat:", ""),
    ("   • Metadata Lengkap:", "Klien/Brand, Nama Campaign, Platform, Studio, Tanggal Produksi & Periode."),
    ("   • Asset Request Link:", "Tautan aset mentahan (jika request datang langsung/standalone)."),
    ("   • Final Asset Handoff (Design):", "Tautan file desain statis final dari Graphic Designer (jika turunan dari Mockup)."),
    ("   • Output Motion Render:", "Tautan langsung menuju video hasil render final.")
], font_size=11)

add_image_safe(s26, "page_23_img_1_2.jpeg", Inches(6.5), Inches(1.7), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Jendela Detail Motion Task")

# ==========================================
# SLIDE 27: APPROVED ARCHIVE (PENGENALAN)
# ==========================================
s27 = prs.slides.add_slide(blank_layout)
add_header(s27, "APPROVED ARCHIVE", "Approved Archive (Pusat Arsip Tugas Selesai)", 27)

tb27 = s27.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.0))
tf27 = tb27.text_frame
tf27.word_wrap = True

add_bullet_list(tf27, [
    ("Solusi Overload Papan Kerja Aktif:", ""),
    ("• Latar Belakang:", "Ketika tugas desain/motion telah disetujui (Approved), menumpuknya kartu pada kolom Approved aktif dapat mengganggu visibilitas kerja tim."),
    ("• Otomatisasi Arsip:", "Setiap tiket yang statusnya berubah menjadi APPROVED otomatis dialihkan ke section Approved Archive."),
    ("• Integritas Data:", "Tidak membuat duplikasi record. Menggunakan data request asli dengan pengelompokan berbasis tanggal persetujuan (approved_at)."),
    ("• Keunggulan:", "Papan kerja aktif tetap bersih, sementara data historis tersimpan rapi dan mudah ditelusuri kapan saja.")
], font_size=11.5)

add_image_safe(s27, "04_request_archive_kanban_1791381372292.png", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(5.0), caption="Tampilan Approved Archive Kanban View")

# ==========================================
# SLIDE 28: APPROVED ARCHIVE (STRUKTUR 5-MINGGU)
# ==========================================
s28 = prs.slides.add_slide(blank_layout)
add_header(s28, "APPROVED ARCHIVE", "Struktur Kanban 5-Minggu (Time-Based Distribution)", 28)

tb28 = s28.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.0))
tf28 = tb28.text_frame
tf28.word_wrap = True

add_bullet_list(tf28, [
    ("Struktur Pengelompokan Berbasis Waktu:", ""),
    ("• Kolom Periode:", "Alih-alih membagi berdasarkan status, kolom pada Approved Archive merepresentasikan periode waktu:"),
    ("   - Week 1:", "Tanggal 1 s/d 7 dalam bulan terpilih."),
    ("   - Week 2:", "Tanggal 8 s/d 14."),
    ("   - Week 3:", "Tanggal 15 s/d 21."),
    ("   - Week 4:", "Tanggal 22 s/d 28."),
    ("   - Week 5:", "Tanggal 29 s/d akhir bulan."),
    ("• Penempatan Otomatis:", "Sistem otomatis menempatkan kartu ke kolom minggu yang sesuai berdasarkan approved_at."),
    ("• Ringkasan Jumlah:", "Setiap kolom menampilkan counter jumlah desain selesai pada minggu tersebut.")
], font_size=11)

add_image_safe(s28, "approved_archive_view_1791383308596.png", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(5.0), caption="Distribusi 5 Minggu pada Approved Archive")

# ==========================================
# SLIDE 29: APPROVED ARCHIVE (FILTER & EKSPOR)
# ==========================================
s29 = prs.slides.add_slide(blank_layout)
add_header(s29, "APPROVED ARCHIVE", "Filter Periode Historis & Ekspor Data CSV", 29)

tb29 = s29.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.0))
tf29 = tb29.text_frame
tf29.word_wrap = True

add_bullet_list(tf29, [
    ("Kemudahan Navigasi & Pelaporan Historis:", ""),
    ("• Pemilih Bulan & Tahun:", "Pilih bulan (Januari–Desember) dan tahun untuk membuka arsip periode manapun."),
    ("• Pencarian Cepat:", "Ketik nama Brand, Campaign, Kode Task, atau Designer untuk memfilter kartu di seluruh kolom minggu secara instan."),
    ("• Ekspor CSV / Excel:", "Klik tombol 'Export' untuk mengunduh seluruh data arsip periode yang sedang aktif ke format spreadsheet."),
    ("• Konsistensi:", "Tersedia baik pada modul Mockup Task Management maupun Motion Graphics Pipeline.")
], font_size=11.5)

add_image_safe(s29, "07_motion_archive_kanban_1791381748040.png", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(5.0), caption="Motion Approved Archive & Toolbar Filter")

# ==========================================
# SLIDE 30: KOLABORASI & CHAT REAL-TIME
# ==========================================
s30 = prs.slides.add_slide(blank_layout)
add_header(s30, "KOLABORASI TIM", "Fitur Diskusi & Chat Real-Time per Request", 30)

tb30 = s30.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.0))
tf30 = tb30.text_frame
tf30.word_wrap = True

add_bullet_list(tf30, [
    ("Komunikasi Terpusat Tanpa Aplikasi Pihak Ketiga:", ""),
    ("• Buka Tab Diskusi:", "Setiap tiket tugas memiliki tab 'Discussion / Chat' terintegrasi di dalam modal detail."),
    ("• Gelembung Pesan Terstruktur:", "Pesan pengguna yang sedang login muncul di sebelah KANAN (gelembung aksen pink), sementara pesan rekan tim muncul di sebelah KIRI (gelembung dark slate)."),
    ("• Identifikasi Pengirim:", "Setiap pesan mencantumkan nama pengirim, role tag, dan timestamp pengiriman yang akurat."),
    ("• Attachment / Lampiran:", "Mendukung pengiriman tautan file dan brief revisi cepat."),
    ("• Notifikasi Otomatis:", "Pesan baru memicu lonceng notifikasi bagi seluruh pengguna yang terkait dengan tiket tersebut.")
], font_size=11)

add_image_safe(s30, "request_chat_view_1791383172222.png", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(5.0), caption="Tampilan Chat Diskusi dengan Layout Gelembung Kanan-Kiri")

# ==========================================
# SLIDE 31: PUSAT NOTIFIKASI SISTEM
# ==========================================
s31 = prs.slides.add_slide(blank_layout)
add_header(s31, "NOTIFIKASI", "Pusat Notifikasi & Pemantauan Perubahan Status", 31)

tb31 = s31.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.0))
tf31 = tb31.text_frame
tf31.word_wrap = True

add_bullet_list(tf31, [
    ("Pemberitahuan Cepat Aktivitas Penting:", ""),
    ("• Ikon Lonceng Header:", "Terletak di pojok kanan atas dengan indikator badge angka merah untuk notifikasi yang belum dibaca (unread)."),
    ("• Jenis Notifikasi yang Didukung:", ""),
    ("   - Penugasan Baru (Task Assigned)"),
    ("   - Permintaan Revisi (Revision Requested)"),
    ("   - Persetujuan Desain (Task Approved)"),
    ("   - Pesan Diskusi Baru (New Chat Message)"),
    ("   - Peringatan Tenggat Waktu (SLA Warning)"),
    ("• Navigasi Instan:", "Klik pada salah satu notifikasi untuk langsung membuka modal detail tiket yang bersangkutan."),
    ("• Tandai Sudah Dibaca:", "Dapat ditandai sebagai telah dibaca secara individual atau sekaligus.")
], font_size=11)

add_image_safe(s31, "notification_panel_1791382291165.png", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(5.0), caption="Panel Notifikasi Real-Time")

# ==========================================
# SLIDE 32: WORKLOAD & CAPACITY INTELLIGENCE
# ==========================================
s32 = prs.slides.add_slide(blank_layout)
add_header(s32, "KAPASITAS KERJA", "Workload & Capacity Intelligence (Monitoring Beban Kerja)", 32)

tb32 = s32.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.0))
tf32 = tb32.text_frame
tf32.word_wrap = True

add_bullet_list(tf32, [
    ("Manajemen Kapasitas & Pencegahan Burnout:", ""),
    ("• Standar Kuota Poin Harian:", ""),
    ("   - Graphic Designer: Kuota 5.0 s/d 7.0 Poin per hari."),
    ("   - Motion Designer: Kuota 7.0 Poin per hari."),
    ("• Bobot Kesulitan Konten:", "Low (1-2 pts), Medium (3-4 pts), High (4.5-5 pts)."),
    ("• Matriks Occupancy %:", "Menampilkan persentase keterisian beban kerja setiap desainer secara visual."),
    ("• Peringatan Overload:", "Jika beban aktif melebihi kuota harian, sistem memberikan badge peringatan 'Overload' merah agar Team Lead dapat mendistribusikan ulang (rebalance) tugas.")
], font_size=11)

add_image_safe(s32, "07_workload_capacity_1791381544943.png", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(5.0), caption="Matriks Beban Kerja & Kapasitas Harian Desainer")

# ==========================================
# SLIDE 33: REPORTS & ANALYTICS
# ==========================================
s33 = prs.slides.add_slide(blank_layout)
add_header(s33, "ANALITIK & LAPORAN", "Reports & Analytics Engine (Performa SLA & Tren)", 33)

tb33 = s33.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.0))
tf33 = tb33.text_frame
tf33.word_wrap = True

add_bullet_list(tf33, [
    ("Evaluasi Efisiensi & Kinerja Operasional:", ""),
    ("• SLA Performance:", "Tingkat kepatuhan penyelesaian tepat waktu (% On-Time vs % Overdue) berdasarkan jam kerja riil."),
    ("• Rasio Request vs Output:", "Perbandingan volume permintaan masuk dibandingkan jumlah aset final yang disetujui per bulan."),
    ("• Distribusi Brand:", "Pivot kontribusi pekerjaan per klien untuk analisis alokasi sumber daya agensi."),
    ("• Rata-rata Turnaround Time:", "Durasi rata-rata hari kerja penyelesaian per tipe konten."),
    ("• Ekspor Laporan:", "Dukungan penuh ekspor metrik ke format CSV/Excel untuk pelaporan manajemen.")
], font_size=11)

add_image_safe(s33, "08_reports_analytics_1791381576616.png", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(5.0), caption="Laporan Analitik Performa SLA & Distribusi Konten")

# ==========================================
# SLIDE 34: MASTER DATA & PENGATURAN (PENGENALAN)
# ==========================================
s34 = prs.slides.add_slide(blank_layout)
add_header(s34, "ADMIN & SETTINGS", "Pusat Pengelolaan Data Master Aplikasi", 34)

tb34 = s34.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(11.7), Inches(1.5))
tf34 = tb34.text_frame
tf34.word_wrap = True
p34 = tf34.paragraphs[0]
p34.text = "Grup halaman Admin & Pengaturan adalah pusat pengelolaan 'Data Master' aplikasi. Fitur-fitur di dalamnya dirancang khusus untuk digunakan oleh Admin (dan beberapa bagi Team Lead) demi memastikan kelancaran operasional, akurasi perhitungan SLA, serta keamanan akses pengguna."
p34.font.size = Pt(12)
p34.font.color.rgb = TEXT_MUTED

# 5 Sub-pages Cards
sub_pages = [
    ("1. User Management", "Kelola akun pengguna, peran akses, dan kapasitas poin harian desainer.", BLUE_ACCENT),
    ("2. Clients / Brands", "Daftar rujukan brand/klien aktif dan tipe kerjasama (Internal / Eksternal).", PRIMARY),
    ("3. Content Types", "Format jenis konten dan rekomendasi tingkat kesulitan otomatis bawaan.", PURPLE_ACCENT),
    ("4. Holiday Calendar", "Kalender hari libur nasional untuk otomasi perhitungan tenggat waktu SLA.", AMBER_ACCENT),
    ("5. Audit Trail", "Perekam jejak aktivitas sistem ('CCTV Sistem') yang bersifat permanen/read-only.", GREEN_ACCENT)
]

for idx, (sp_title, sp_desc, sp_col) in enumerate(sub_pages):
    sy = Inches(3.0) + idx * Inches(0.8)
    card = s34.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), sy, Inches(11.7), Inches(0.68))
    card.fill.solid()
    card.fill.fore_color.rgb = RGBColor(248, 250, 252)
    card.line.color.rgb = sp_col
    card.line.width = Pt(1.5)
    
    tb_c = s34.shapes.add_textbox(Inches(1.0), sy + Inches(0.08), Inches(11.3), Inches(0.55))
    tfc = tb_c.text_frame
    tfc.word_wrap = True
    p = tfc.paragraphs[0]
    r1 = p.add_run()
    r1.text = sp_title + " — "
    r1.font.bold = True
    r1.font.size = Pt(11.5)
    r1.font.color.rgb = TEXT_MAIN
    r2 = p.add_run()
    r2.text = sp_desc
    r2.font.size = Pt(11)
    r2.font.color.rgb = TEXT_MUTED

# ==========================================
# SLIDE 35: DATA MASTER — USER MANAGEMENT
# ==========================================
s35 = prs.slides.add_slide(blank_layout)
add_header(s35, "ADMIN & SETTINGS", "2. User Management (Manajemen Pengguna)", 35)

tb35 = s35.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(5.5), Inches(5.2))
tf35 = tb35.text_frame
tf35.word_wrap = True

add_bullet_list(tf35, [
    ("Pengelolaan Akses & Kapasitas Pengguna:", ""),
    ("• Melihat Daftar Pengguna:", "Profil, email, Role, status keaktifan, dan poin kapasitas harian."),
    ("• Cara Mengundang Pengguna Baru:", ""),
    ("   1. Klik tombol '+ New User'."),
    ("   2. Masukkan alamat Email pengguna."),
    ("   3. Tentukan Role (Designer, Requester, Motion PIC, Lead, dsb.)."),
    ("   4. Jika memilih Designer/Motion, wajib masukkan Daily Capacity Points."),
    ("   5. Klik 'Create & Generate Invite'."),
    ("   6. Salin Invite Link yang dihasilkan untuk aktivasi mandiri oleh calon pengguna."),
    ("• Menghapus Pengguna:", "Klik ikon Tong Sampah (Trash) merah pada baris pengguna.")
], font_size=10.5)

add_image_safe(s35, "page_25_img_2_3.jpeg", Inches(6.5), Inches(1.4), width=Inches(6.0), height=Inches(2.5), caption="Modal Buat Pengguna & Generate Invite Link")
add_image_safe(s35, "10_admin_users_1791381637800.png", Inches(6.5), Inches(4.1), width=Inches(6.0), height=Inches(2.5), caption="Tabel Daftar Pengguna Terdaftar")

# ==========================================
# SLIDE 36: DATA MASTER — CLIENTS / BRANDS
# ==========================================
s36 = prs.slides.add_slide(blank_layout)
add_header(s36, "ADMIN & SETTINGS", "3. Clients / Brands (Klien dan Brand)", 36)

tb36 = s36.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.5), Inches(5.0))
tf36 = tb36.text_frame
tf36.word_wrap = True

add_bullet_list(tf36, [
    ("Daftar Rujukan Brand Agensi & Klien:", ""),
    ("• Fungsi Rujukan:", "Daftar rujukan semua Brand atau Klien yang ditangani agensi. Data ini otomatis muncul di menu dropdown 'Pilih Brand' saat pembuatan tiket baru."),
    ("• Menambahkan Klien Baru:", "Klik tombol penambahan klien, masukkan nama Brand, dan tentukan tipe klien (Internal atau Eksternal)."),
    ("• Menonaktifkan Klien (Inactive):", "Jika sebuah Brand selesai bekerjasama, Anda tidak perlu menghapusnya. Cukup ubah statusnya menjadi Inactive agar riwayat tiket lamanya tetap aman tanpa muncul di form tiket baru.")
], font_size=11.5)

add_image_safe(s36, "page_26_img_1_2.jpeg", Inches(6.5), Inches(1.5), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Modal Tambah Klien & Dropdown Tipe")

# ==========================================
# SLIDE 37: DATA MASTER — CONTENT TYPES
# ==========================================
s37 = prs.slides.add_slide(blank_layout)
add_header(s37, "ADMIN & SETTINGS", "4. Content Types (Jenis Konten & Kesulitan)", 37)

tb37 = s37.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.5), Inches(5.0))
tf37 = tb37.text_frame
tf37.word_wrap = True

add_bullet_list(tf37, [
    ("Standarisasi Format Desain & Poin Kesulitan:", ""),
    ("• Fungsi Master Konten:", "Mengatur rujukan berbagai format konten desain yang sering dikerjakan (contoh: IG Feed, Story, Key Visual, Web Banner, Video 2D)."),
    ("• Default Difficulty:", "Saat menambahkan jenis konten baru, Anda dapat menentukan Default Difficulty (Low / Medium / High)."),
    ("• Manfaat:", "Mempermudah Team Lead saat penugasan (Assign) karena sistem otomatis merekomendasikan bobot poin kesulitan yang konsisten."),
    ("• Fleksibilitas:", "Bobot tetap dapat disesuaikan manual pada kasus-kasus spesifik saat penugasan.")
], font_size=11.5)

add_image_safe(s37, "page_27_img_1_2.jpeg", Inches(6.5), Inches(1.5), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Modal Tambah Format Konten & Default Difficulty")

# ==========================================
# SLIDE 38: DATA MASTER — HOLIDAY CALENDAR
# ==========================================
s38 = prs.slides.add_slide(blank_layout)
add_header(s38, "ADMIN & SETTINGS", "5. Holiday Calendar (Kalender Hari Libur & SLA)", 38)

tb38 = s38.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.5), Inches(5.0))
tf38 = tb38.text_frame
tf38.word_wrap = True

add_bullet_list(tf38, [
    ("Otomasi Perhitungan Service Level Agreement:", ""),
    ("• Peran Kalender Libur:", "Merupakan fondasi ketepatan sistem karena mesin otomatis penghitung SLA mengecualikan akhir pekan (Sabtu–Minggu) dan hari libur nasional."),
    ("• Cara Penggunaan:", ""),
    ("   1. Masuk ke halaman Holiday Calendar."),
    ("   2. Daftarkan tanggal merah atau hari cuti bersama."),
    ("   3. Masukkan deskripsi libur (misal: 'Hari Raya Idul Fitri')."),
    ("   4. Klik simpan. Sistem otomatis melewati tanggal-tanggal tersebut ketika menghitung tenggat waktu (Due Date) dan durasi hari kerja tugas.")
], font_size=11)

add_image_safe(s38, "page_28_img_1_2.jpeg", Inches(6.5), Inches(1.5), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Modal Tambah Tanggal Libur Nasional")

# ==========================================
# SLIDE 39: DATA MASTER — AUDIT TRAIL
# ==========================================
s39 = prs.slides.add_slide(blank_layout)
add_header(s39, "ADMIN & SETTINGS", "6. Audit Trail (Riwayat Aktivitas & CCTV Sistem)", 39)

tb39 = s39.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.5), Inches(5.0))
tf39 = tb39.text_frame
tf39.word_wrap = True

add_bullet_list(tf39, [
    ("Perekam Jejak Aktivitas Terenkripsi & Permanen:", ""),
    ("• Definisi 'CCTV Sistem':", "Merekam setiap tindakan penting yang dilakukan pengguna di dalam sistem tanpa terkecuali."),
    ("• Kegunaan Investigasi:", "Jika terjadi kesalahan atau ketidaksesuaian proses, Admin dapat memeriksa Audit Trail untuk melacak pelaku, timestamp akurat, dan nilai data sebelum vs sesudah perubahan."),
    ("• Sifat Read-Only:", "Data bersifat permanen dan tidak dapat diubah atau dihapus oleh siapapun demi akuntabilitas."),
    ("• Pencarian & Filter:", "Mendukung pencarian berbasis nama pengguna, tipe entitas tiket, atau rentang tanggal tertentu.")
], font_size=11)

add_image_safe(s39, "page_29_img_1_2.jpeg", Inches(6.5), Inches(1.5), width=Inches(6.0), height=Inches(4.8), caption="Screenshot Tabel Perekam Jejak Audit Trail")

# ==========================================
# SLIDE 40: PANDUAN PERAN: REQUESTER & STRATEGIC PIC
# ==========================================
s40 = prs.slides.add_slide(blank_layout)
add_header(s40, "PANDUAN PERAN", "Panduan Berbasis Peran: Requester & Strategic PIC", 40)

# Left Column: Requester
tb40_l = s40.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.6), Inches(5.2))
tf40_l = tb40_l.text_frame
tf40_l.word_wrap = True
add_bullet_list(tf40_l, [
    ("PERAN: REQUESTER / AE", ""),
    ("• Tanggung Jawab Utama:", "Membuat tiket permintaan desain, memberikan brief lengkap, memantau progres, dan mereview aset final."),
    ("• Hak Akses & Aksi:", ""),
    ("   - Membuat tiket baru (+ New Task) & Standalone Motion."),
    ("   - Membuka Task Detail & Berkomunikasi via Chat."),
    ("   - Memeriksa tautan Google Drive / Render Output."),
    ("   - Menyetujui (Approve) atau Meminta Revisi (Revise)."),
    ("• Larangan:", "Tidak dapat meng-assign desainer atau mengubah master data.")
], font_size=11)

# Right Column: Strategic PIC
tb40_r = s40.shapes.add_textbox(Inches(6.8), Inches(1.5), Inches(5.6), Inches(5.2))
tf40_r = tb40_r.text_frame
tf40_r.word_wrap = True
add_bullet_list(tf40_r, [
    ("PERAN: STRATEGIC PIC", ""),
    ("• Tanggung Jawab Utama:", "Menyusun konsep strategis, validasi brand guideline, dan mematangkan brief kampanye sebelum eksekusi visual."),
    ("• Hak Akses & Aksi:", ""),
    ("   - Menerima tiket dengan flag 'Requires Strategic'."),
    ("   - Menyusun catatan konsep pada tab Diskusi / Notes."),
    ("   - Memberikan sign-off strategis agar tugas diteruskan ke tim desainer grafis."),
    ("   - Memantau Workload & Capacity tim strategi.")
], font_size=11)

# ==========================================
# SLIDE 41: PANDUAN PERAN: DESIGNER & MOTION PIC
# ==========================================
s41 = prs.slides.add_slide(blank_layout)
add_header(s41, "PANDUAN PERAN", "Panduan Berbasis Peran: Designer & Motion PIC", 41)

# Left Column: Graphic Designer
tb41_l = s41.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.6), Inches(5.2))
tf41_l = tb41_l.text_frame
tf41_l.word_wrap = True
add_bullet_list(tf41_l, [
    ("PERAN: GRAPHIC DESIGNER (GD)", ""),
    ("• Tanggung Jawab Utama:", "Mengeksekusi desain statis, feed, banner, dan aset mockup sesuai brief."),
    ("• Hak Akses & Alur Kerja:", ""),
    ("   - Memantau tiket tugas di kolom Assigned & In Progress."),
    ("   - Klik Start Work untuk memulai pengerjaan."),
    ("   - Mengirimkan hasil melalui tombol Submit Output (Google Drive Link)."),
    ("   - Menangani perbaikan tugas berstatus Revision & Re-submit."),
    ("   - Menjaga batas kapasitas harian (5–7 poin).")
], font_size=11)

# Right Column: Motion PIC
tb41_r = s41.shapes.add_textbox(Inches(6.8), Inches(1.5), Inches(5.6), Inches(5.2))
tf41_r = tb41_r.text_frame
tf41_r.word_wrap = True
add_bullet_list(tf41_r, [
    ("PERAN: MOTION PIC (ANIMASI & VIDEO)", ""),
    ("• Tanggung Jawab Utama:", "Memproduksi konten video animasi, lower thirds, dan visual gerak untuk media sosial dan promosi."),
    ("• Hak Akses & Alur Kerja:", ""),
    ("   - Memantau antrean di kolom Queued Motion Pipeline."),
    ("   - Klik Start untuk mengaktifkan timer SLA pengerjaan."),
    ("   - Mengunggah tautan render final ke Google Drive / Cloud."),
    ("   - Memperbaiki video jika ada catatan revisi."),
    ("   - Memastikan format resolusi sesuai platform (TikTok, IG, YT).")
], font_size=11)

# ==========================================
# SLIDE 42: PANDUAN PERAN: LEAD, OPERATOR & ADMIN
# ==========================================
s42 = prs.slides.add_slide(blank_layout)
add_header(s42, "PANDUAN PERAN", "Panduan Peran: Team Lead, Operator & System Admin", 42)

# 3 Horizontal Summary Cards
lead_card = s42.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(3.6), Inches(5.2))
lead_card.fill.solid()
lead_card.fill.fore_color.rgb = RGBColor(248, 250, 252)
lead_card.line.color.rgb = BLUE_ACCENT
lead_card.line.width = Pt(1.5)
tf_lc = lead_card.text_frame
tf_lc.word_wrap = True
add_bullet_list(tf_lc, [
    ("TEAM LEAD", ""),
    ("• Penugasan & Triage:", "Menugaskan (Assign) tugas ke desainer yang memiliki sisa kapasitas poin."),
    ("• Quality Assurance:", "Review awal sebelum diserahkan ke Requester."),
    ("• Handover:", "Menyerahkan video ke Operator."),
    ("• Undo Status:", "Koreksi salah klik alur.")
], font_size=10)

op_card = s42.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(4.8), Inches(1.5), Inches(3.6), Inches(5.2))
op_card.fill.solid()
op_card.fill.fore_color.rgb = RGBColor(248, 250, 252)
op_card.line.color.rgb = GREEN_ACCENT
op_card.line.width = Pt(1.5)
tf_oc = op_card.text_frame
tf_oc.word_wrap = True
add_bullet_list(tf_oc, [
    ("OPERATOR (TIM LIVE)", ""),
    ("• Target Handover:", "Menerima video yang telah Approved untuk ditayangkan saat live streaming."),
    ("• Unduh Aset:", "Mengunduh file render resolusi tinggi dari link output."),
    ("• Broadcast Ready:", "Menandai status tugas menjadi Completed.")
], font_size=10)

adm_card = s42.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.8), Inches(1.5), Inches(3.6), Inches(5.2))
adm_card.fill.solid()
adm_card.fill.fore_color.rgb = RGBColor(248, 250, 252)
adm_card.line.color.rgb = PRIMARY_DARK
adm_card.line.width = Pt(1.5)
tf_ac = adm_card.text_frame
tf_ac.word_wrap = True
add_bullet_list(tf_ac, [
    ("SYSTEM ADMIN", ""),
    ("• Kontrol Penuh:", "Mengatur seluruh konfigurasi sistem."),
    ("• Master Data:", "Kelola Pengguna, Klien, Format Konten & Kalender Libur."),
    ("• Audit Trail:", "Investigasi aktivitas sistem."),
    ("• Override Privileges:", "Otoritas modifikasi darurat.")
], font_size=10)

# ==========================================
# SLIDE 43: SKENARIO PRAKTIS 1 & 2
# ==========================================
s43 = prs.slides.add_slide(blank_layout)
add_header(s43, "SKENARIO PRAKTIS", "Skenario Nyata 1 & 2: Pembuatan Request & Revisi", 43)

# Scenario 1 Card
s1_box = s43.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(5.6), Inches(5.2))
s1_box.fill.solid()
s1_box.fill.fore_color.rgb = RGBColor(248, 250, 252)
s1_box.line.color.rgb = PRIMARY
s1_box.line.width = Pt(1.5)
tf_s1 = s1_box.text_frame
tf_s1.word_wrap = True
add_bullet_list(tf_s1, [
    ("SKENARIO 1: Pengajuan Tiket Desain Baru", ""),
    ("• Situasi:", "AE Sarah ingin membuat permintaan 3 banner promo untuk klien KOSE Cosmeport dengan tenggat 4 hari kerja."),
    ("• Langkah Eksekusi:", ""),
    ("   1. Sarah login sebagai Requester."),
    ("   2. Buka Task Management ➔ Klik '+ New Task'."),
    ("   3. Pilih Brand KOSE, Tipe Web Banner, Qty 3, Due Date 4 hari ke depan."),
    ("   4. Klik 'Create Task'."),
    ("• Hasil yang Diharapkan:", "Tiket terbit dengan kode REQ-2026-xxx berstatus Unassigned dan Team Lead menerima notifikasi untuk penugasan.")
], font_size=10.5)

# Scenario 2 Card
s2_box = s43.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.5), Inches(5.6), Inches(5.2))
s2_box.fill.solid()
s2_box.fill.fore_color.rgb = RGBColor(248, 250, 252)
s2_box.line.color.rgb = AMBER_ACCENT
s2_box.line.width = Pt(1.5)
tf_s2 = s2_box.text_frame
tf_s2.word_wrap = True
add_bullet_list(tf_s2, [
    ("SKENARIO 2: Penanganan Permintaan Revisi", ""),
    ("• Situasi:", "Desain telah disubmit oleh Nadya, namun Requester melihat ada kesalahan penulisan promo (typo)."),
    ("• Langkah Eksekusi:", ""),
    ("   1. Requester membuka detail tugas di kolom Submitted."),
    ("   2. Klik tombol 'Request Revision'."),
    ("   3. Pilih kategori 'Copywriting / Text' dan ketik catatan koreksi."),
    ("   4. Nadya menerima notifikasi revisi, membuka link Drive, memperbaiki teks, lalu klik 'Submit Output'."),
    ("• Hasil yang Diharapkan:", "Status kembali ke Submitted dan riwayat revisi tercatat di modal.")
], font_size=10.5)

# ==========================================
# SLIDE 44: SKENARIO PRAKTIS 3 & 4
# ==========================================
s44 = prs.slides.add_slide(blank_layout)
add_header(s44, "SKENARIO PRAKTIS", "Skenario Nyata 3 & 4: Penugasan & Komunikasi Chat", 44)

# Scenario 3 Card
s3_box = s44.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(5.6), Inches(5.2))
s3_box.fill.solid()
s3_box.fill.fore_color.rgb = RGBColor(248, 250, 252)
s3_box.line.color.rgb = BLUE_ACCENT
s3_box.line.width = Pt(1.5)
tf_s3 = s3_box.text_frame
tf_s3.word_wrap = True
add_bullet_list(tf_s3, [
    ("SKENARIO 3: Penugasan Beban Kerja Seimbang", ""),
    ("• Situasi:", "Team Lead Alfie ingin menugaskan tiket bernilai Medium (3.5 poin)."),
    ("• Langkah Eksekusi:", ""),
    ("   1. Alfie membuka Workload & Capacity untuk melihat sisa poin harian tim."),
    ("   2. Terlihat Nadya sudah 5.5 poin (mendekati batas), sedangkan Yusuf masih 2.0 poin."),
    ("   3. Alfie membuka Task Management ➔ Klik Assign ➔ Pilih Yusuf Pratama."),
    ("• Hasil yang Diharapkan:", "Beban kerja tim tetap seimbang tanpa memicu alarm overload.")
], font_size=10.5)

# Scenario 4 Card
s4_box = s44.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.5), Inches(5.6), Inches(5.2))
s4_box.fill.solid()
s4_box.fill.fore_color.rgb = RGBColor(248, 250, 252)
s4_box.line.color.rgb = PINK_ACCENT
s4_box.line.width = Pt(1.5)
tf_s4 = s4_box.text_frame
tf_s4.word_wrap = True
add_bullet_list(tf_s4, [
    ("SKENARIO 4: Klarifikasi Cepat Melalui Chat", ""),
    ("• Situasi:", "Desainer butuh logo format PNG transparan dari Requester."),
    ("• Langkah Eksekusi:", ""),
    ("   1. Desainer membuka Task Detail ➔ Tab Discussion / Chat."),
    ("   2. Mengetik pesan permintaan logo berserta link Drive referensi."),
    ("   3. Requester menerima lonceng notifikasi dan membalas langsung di dalam thread."),
    ("• Hasil yang Diharapkan:", "Seluruh riwayat obrolan tersimpan rapi di tiket terkait tanpa tercecer di aplikasi chat eksternal.")
], font_size=10.5)

# ==========================================
# SLIDE 45: SKENARIO PRAKTIS 5 & 6
# ==========================================
s45 = prs.slides.add_slide(blank_layout)
add_header(s45, "SKENARIO PRAKTIS", "Skenario Nyata 5 & 6: Handover Video & Penelusuran Arsip", 45)

# Scenario 5 Card
s5_box = s45.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(5.6), Inches(5.2))
s5_box.fill.solid()
s5_box.fill.fore_color.rgb = RGBColor(248, 250, 252)
s5_box.line.color.rgb = GREEN_ACCENT
s5_box.line.width = Pt(1.5)
tf_s5 = s5_box.text_frame
tf_s5.word_wrap = True
add_bullet_list(tf_s5, [
    ("SKENARIO 5: Handover Video Siap Siar ke Operator", ""),
    ("• Situasi:", "Video animasi promo BaU Shopee telah disetujui (Approved) dan harus disiarkan dalam live streaming malam ini."),
    ("• Langkah Eksekusi:", ""),
    ("   1. Team Lead membuka Motion Pipeline ➔ Kolom Approved."),
    ("   2. Klik 'Handover' ➔ Pilih 'Sam Operator'."),
    ("   3. Sam Operator membuka detail tugas, mengunduh file video render dari link output, lalu menandai Completed."),
    ("• Hasil yang Diharapkan:", "Video siap siar dan status akhir menjadi Completed.")
], font_size=10.5)

# Scenario 6 Card
s6_box = s45.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.5), Inches(5.6), Inches(5.2))
s6_box.fill.solid()
s6_box.fill.fore_color.rgb = RGBColor(248, 250, 252)
s6_box.line.color.rgb = PRIMARY_DARK
s6_box.line.width = Pt(1.5)
tf_s6 = s6_box.text_frame
tf_s6.word_wrap = True
add_bullet_list(tf_s6, [
    ("SKENARIO 6: Mencari Aset Desain Bulan Lalu", ""),
    ("• Situasi:", "Manajemen membutuhkan file banner kampanye bulan September 2026 untuk bahan laporan bulanan."),
    ("• Langkah Eksekusi:", ""),
    ("   1. Pengguna membuka Task Management ➔ Approved Archive."),
    ("   2. Mengubah dropdown bulan ke 'Sep' dan tahun '2026'."),
    ("   3. Ketik nama brand pada kolom pencarian."),
    ("   4. Klik kartu yang ditemukan untuk membuka tautan Google Drive."),
    ("• Hasil yang Diharapkan:", "Aset lama ditemukan dalam hitungan detik tanpa membuka folder Drive manual.")
], font_size=10.5)

# ==========================================
# SLIDE 46: PANDUAN PEMECAHAN MASALAH (TROUBLESHOOTING)
# ==========================================
s46 = prs.slides.add_slide(blank_layout)
add_header(s46, "TROUBLESHOOTING", "Panduan Pemecahan Masalah (Troubleshooting)", 46)

tb46 = s46.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(11.7), Inches(5.3))
tf46 = tb46.text_frame
tf46.word_wrap = True

trouble_items = [
    ("Kendala yang Sering Terjadi & Solusi Cepat:", ""),
    ("1. Tidak Bisa Login / Password Ditolak:", "Pastikan penulisan email dan password tepat huruf besar/kecilnya. Pada mode demo, gunakan tombol 'Quick Login' peran Anda. Jika status akun 'Pending Activation', hubungi Admin untuk link undangan aktivasi."),
    ("2. Kartu Tugas Tidak Muncul di Papan Kerja:", "Periksa filter toolbar di bagian atas (apakah filter bulan, status, atau desainer sedang aktif menyaring data). Pastikan peran Anda memiliki hak akses melihat tiket tersebut."),
    ("3. Durasi SLA Terlihat Terlalu Panjang:", "Sistem otomatis mengecualikan hari Sabtu, Minggu, dan tanggal merah yang terdaftar di Holiday Calendar. Periksa apakah terdapat hari libur nasional pada rentang pengerjaan tersebut."),
    ("4. Tombol Aksi (Approve / Submit) Terkunci:", "Pastikan tugas berada pada status yang tepat dan role akun Anda memiliki wewenang untuk tahapan tersebut (misal: hanya Requester/Lead yang bisa Approve)."),
    ("5. Pesan Chat Belum Muncul:", "Pastikan koneksi internet stabil. Gunakan tombol refresh atau tutup-buka kembali modal detail tiket untuk memuat pembaruan obrolan terbaru.")
]
for bold_p, desc in trouble_items:
    p = tf46.add_paragraph() if tf46.paragraphs[0].text else tf46.paragraphs[0]
    p.space_after = Pt(6)
    if bold_p:
        r1 = p.add_run()
        r1.text = bold_p + " "
        r1.font.bold = True
        r1.font.size = Pt(11)
        r1.font.color.rgb = PRIMARY_DARK if "Kendala" in bold_p else TEXT_MAIN
    if desc:
        r2 = p.add_run()
        r2.text = desc
        r2.font.size = Pt(10.5)
        r2.font.color.rgb = TEXT_MUTED

# ==========================================
# SLIDE 47: PRAKTIK TERBAIK PENGGUNAAN SISTEM
# ==========================================
s47 = prs.slides.add_slide(blank_layout)
add_header(s47, "BEST PRACTICES", "Praktik Terbaik Penggunaan Sistem (Operational Excellence)", 47)

tb47 = s47.shapes.add_textbox(Inches(0.8), Inches(1.4), Inches(11.7), Inches(5.3))
tf47 = tb47.text_frame
tf47.word_wrap = True

best_practices = [
    ("Panduan Standar Operasional untuk Efisiensi Maksimal:", ""),
    ("• Detail Brief yang Jelas:", "Selalu lampirkan tautan aset mentah, brand guideline, dan referensi visual pada kolom Notes/Diskusi saat membuat tiket baru demi meminimalisir revisi berulang."),
    ("• Disiplin Transisi Status:", "Desainer wajib mengklik 'Start Work' segera saat mulai mengerjakan dan 'Submit Output' tepat setelah unggah Drive agar perhitungan metrik SLA akurat."),
    ("• Gunakan In-App Chat untuk Semua Klarifikasi:", "Hindari instruksi lisan atau chat eksternal yang tidak terdokumentasi; gunakan fitur Discussion pada modal tiket agar seluruh riwayat tersimpan permanen."),
    ("• Periksa Beban Tim Sebelum Penugasan:", "Team Lead harus memprioritaskan desainer dengan sisa kapasitas poin yang memadai untuk mencegah penumpukan tugas dan keterlambatan."),
    ("• Verifikasi Hasil Sebelum Approval:", "Requester wajib membuka tautan Drive dan memeriksa kesesuaian copy/resolusi sebelum menekan tombol Approve.")
]
for bold_p, desc in best_practices:
    p = tf47.add_paragraph() if tf47.paragraphs[0].text else tf47.paragraphs[0]
    p.space_after = Pt(8)
    if bold_p:
        r1 = p.add_run()
        r1.text = bold_p + " "
        r1.font.bold = True
        r1.font.size = Pt(11.5)
        r1.font.color.rgb = PRIMARY if "Panduan" in bold_p else TEXT_MAIN
    if desc:
        r2 = p.add_run()
        r2.text = desc
        r2.font.size = Pt(11)
        r2.font.color.rgb = TEXT_MUTED

# ==========================================
# SLIDE 48: LEMBAR PINTAS / QUICK REFERENCE
# ==========================================
s48 = prs.slides.add_slide(blank_layout)
add_header(s48, "RINGKASAN", "Lembar Pintas Cepat (Quick Reference Cheat Sheet)", 48)

rows48, cols48 = 8, 3
t48_shape = s48.shapes.add_table(rows48, cols48, Inches(0.8), Inches(1.4), Inches(11.7), Inches(5.3))
tbl48 = t48_shape.table
tbl48.columns[0].width = Inches(2.8)
tbl48.columns[1].width = Inches(4.5)
tbl48.columns[2].width = Inches(4.4)

q_headers = ["Tindakan / Aksi", "Navigasi & Langkah Singkat", "Role yang Berwenang"]
for c_idx, h_text in enumerate(q_headers):
    cell = tbl48.cell(0, c_idx)
    cell.fill.solid()
    cell.fill.fore_color.rgb = RGBColor(241, 245, 249)
    p = cell.text_frame.paragraphs[0]
    p.text = h_text
    p.font.bold = True
    p.font.size = Pt(11)
    p.font.color.rgb = TEXT_MAIN

cheat_items = [
    ("Buat Permintaan Baru", "Task Management ➔ '+ New Task' / Motion ➔ 'Create Request'", "Requester, Strategic PIC, Lead, Admin"),
    ("Tugaskan Desainer (Assign)", "Pilih kartu Unassigned ➔ Klik 'Assign' ➔ Pilih PIC & Bobot", "Team Lead, System Admin"),
    ("Mulai Pengerjaan", "Pilih kartu Assigned ➔ Klik 'Start Work' (Play Icon)", "Graphic Designer, Motion PIC"),
    ("Kirim Hasil Desain/Video", "Pilih kartu In Progress ➔ Klik 'Submit' ➔ Masukkan Link Drive", "Graphic Designer, Motion PIC"),
    ("Review & Persetujuan", "Pilih kartu Submitted ➔ Klik 'Approve' atau 'Request Revision'", "Requester, Team Lead, Admin"),
    ("Handover Video ke Operator", "Motion Pipeline ➔ Kartu Approved ➔ Klik 'Handover'", "Team Lead, System Admin"),
    ("Cari Arsip Selesai", "Approved Archive ➔ Pilih Bulan & Tahun ➔ Cari / Ekspor CSV", "Semua Role Pengguna")
]

for r_idx, (act, nav, rols) in enumerate(cheat_items):
    c0 = tbl48.cell(r_idx + 1, 0)
    c0.text_frame.paragraphs[0].text = act
    c0.text_frame.paragraphs[0].font.bold = True
    c0.text_frame.paragraphs[0].font.size = Pt(10)
    c0.text_frame.paragraphs[0].font.color.rgb = PRIMARY_DARK
    
    c1 = tbl48.cell(r_idx + 1, 1)
    c1.text_frame.paragraphs[0].text = nav
    c1.text_frame.paragraphs[0].font.size = Pt(9.5)
    c1.text_frame.paragraphs[0].font.color.rgb = TEXT_MAIN
    
    c2 = tbl48.cell(r_idx + 1, 2)
    c2.text_frame.paragraphs[0].text = rols
    c2.text_frame.paragraphs[0].font.size = Pt(9.5)
    c2.text_frame.paragraphs[0].font.color.rgb = TEXT_MUTED

# ==========================================
# SLIDE 49: PENUTUP & SALURAN DUKUNGAN
# ==========================================
s49 = prs.slides.add_slide(blank_layout)
add_header(s49, "PENUTUP", "Penutup & Saluran Dukungan Operasional", 49)

tb49_c = s49.shapes.add_textbox(Inches(1.5), Inches(2.0), Inches(10.3), Inches(4.5))
tf49 = tb49_c.text_frame
tf49.word_wrap = True

p49_t = tf49.paragraphs[0]
p49_t.alignment = PP_ALIGN.CENTER
p49_t.text = "ERP / Operator Management System (CMOMS)"
p49_t.font.name = FONT_TITLE
p49_t.font.size = Pt(22)
p49_t.font.bold = True
p49_t.font.color.rgb = TEXT_MAIN
p49_t.space_after = Pt(10)

p49_sub = tf49.add_paragraph()
p49_sub.alignment = PP_ALIGN.CENTER
p49_sub.text = "Complete Workflow from Request Creation to Approved Archive"
p49_sub.font.name = FONT_BODY
p49_sub.font.size = Pt(14)
p49_sub.font.bold = True
p49_sub.font.color.rgb = PRIMARY
p49_sub.space_after = Pt(24)

p49_info = tf49.add_paragraph()
p49_info.alignment = PP_ALIGN.CENTER
p49_info.text = "Dokumen ini merupakan panduan resmi operasional internal agensi.\nJika Anda mengalami kendala teknis atau memerlukan bantuan eskalasi sistem:"
p49_info.font.name = FONT_BODY
p49_info.font.size = Pt(12)
p49_info.font.color.rgb = TEXT_MUTED
p49_info.space_after = Pt(16)

p49_ctc = tf49.add_paragraph()
p49_ctc.alignment = PP_ALIGN.CENTER
p49_ctc.text = "📧 Email Dukungan: support@orbiz.id  |  💬 Helpdesk IT: @orbiz-it-ops\nDokumentasi Versi 2.4 • Orbiz Creative Operations © 2026"
p49_ctc.font.name = FONT_BODY
p49_ctc.font.size = Pt(11)
p49_ctc.font.bold = True
p49_ctc.font.color.rgb = TEXT_MAIN

# Save final presentation
output_pptx = os.path.join(BASE_DIR, "ERP_User_Guide_Complete.pptx")
prs.save(output_pptx)
print(f"Successfully generated complete 49-slide presentation: {output_pptx}")
