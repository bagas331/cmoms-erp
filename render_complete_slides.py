import os
import win32com.client

ppt_app = win32com.client.Dispatch("PowerPoint.Application")
ppt_app.Visible = 1

base_dir = os.path.dirname(os.path.abspath(__file__))
pptx_path = os.path.join(base_dir, "ERP_User_Guide_Complete.pptx")
out_dir = os.path.join(base_dir, "rendered_complete_slides")
os.makedirs(out_dir, exist_ok=True)

presentation = ppt_app.Presentations.Open(pptx_path, ReadOnly=True)

try:
    total_slides = len(presentation.Slides)
    print(f"Total slides to export: {total_slides}")
    for idx, slide in enumerate(presentation.Slides):
        out_path = os.path.join(out_dir, f"slide_{idx+1:02d}.png")
        slide.Export(out_path, "PNG", 1920, 1080)
    print(f"Exported all {total_slides} slides to {out_dir}")
finally:
    presentation.Close()
    ppt_app.Quit()
