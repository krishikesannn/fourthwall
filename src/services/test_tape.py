import os
import subprocess
from PIL import Image

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out_dir = r"c:\Users\Simran\Downloads\THEFOURTHWALL-20260824T141601Z-1-001\THEFOURTHWALL\src\services"
test_html = os.path.join(out_dir, "test_tape_adjust.html")

for top_val in [24.5, 25.5, 26.5, 27.5]:
    shot = os.path.join(out_dir, f"tape_{top_val}.png")
    html_content = f"""<!DOCTYPE html>
<html>
<head>
<style>
  body {{ margin: 0; background: #efe2cf; width: 1122px; height: 1402px; position: relative; overflow: hidden; }}
  .asset {{ position: absolute; display: block; height: auto; }}
  .intro-note {{ left: 8.5%; top: 7.2%; width: 30.0%; z-index: 4; }}
  .marketing-card {{ left: 2.8%; top: {top_val}%; width: 29.5%; z-index: 3; filter: drop-shadow(0 12px 24px rgba(40, 25, 10, 0.12)); }}
</style>
</head>
<body>
  <img src="assets/note-arrow-clover.png" class="asset intro-note" />
  <img src="assets/marketing-card.png" class="asset marketing-card" />
</body>
</html>
"""
    with open(test_html, "w", encoding="utf-8") as f:
        f.write(html_content)
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--window-size=1122,1402",
        f"--screenshot={shot}",
        f"file:///{test_html.replace(os.sep, '/')}"
    ]
    subprocess.run(cmd, check=True)

# Also let's stitch them horizontally to inspect
img_245 = Image.open(os.path.join(out_dir, "tape_24.5.png")).crop((0, 0, 500, 700))
img_255 = Image.open(os.path.join(out_dir, "tape_25.5.png")).crop((0, 0, 500, 700))
img_265 = Image.open(os.path.join(out_dir, "tape_26.5.png")).crop((0, 0, 500, 700))
img_275 = Image.open(os.path.join(out_dir, "tape_27.5.png")).crop((0, 0, 500, 700))

stitched = Image.new("RGB", (2000, 700))
stitched.paste(img_245, (0, 0))
stitched.paste(img_255, (500, 0))
stitched.paste(img_265, (1000, 0))
stitched.paste(img_275, (1500, 0))
stitched.save(os.path.join(out_dir, "tape_grid.png"))

print("Rendered tape variations!")
