import os
from ultralytics import YOLO
from PIL import Image

# Load YOLOv8 model
model = YOLO("best.pt")  # Ensure correct model path

# Path to the folder containing images and videos
media_folder = "img"

# Ensure output directory exists
base_output_folder = "output"
os.makedirs(base_output_folder, exist_ok=True)

# Find the next available run number
existing_runs = [d for d in os.listdir(base_output_folder) if d.startswith("run_")]
run_number = len(existing_runs) + 1
output_folder = os.path.join(base_output_folder, f"run_{run_number}")
os.makedirs(output_folder, exist_ok=True)  # Create the folder

# Convert .jfif images to .jpg
for file in os.listdir(media_folder):
    if file.endswith(".jfif"):
        jfif_path = os.path.join(media_folder, file)
        jpg_path = os.path.join(media_folder, file.replace(".jfif", ".jpg"))

        try:
            with Image.open(jfif_path) as img:
                img.convert("RGB").save(jpg_path, "JPEG")
            print(f"🔄 Converted {file} to {jpg_path}")
        except Exception as e:
            print(f"❌ Error converting {file}: {e}")

# Get all image and video files (after conversion)
media_files = [f for f in os.listdir(media_folder) if f.endswith(('.jpg', '.png', '.jpeg', '.mp4', '.avi', '.mov'))]

if not media_files:
    print("⚠️ No valid media files found in the folder.")
else:
    print(f"📸 Found {len(media_files)} media files: {media_files}")

# Run inference and force saving all results in the same folder
for media_file in media_files:
    media_path = os.path.join(media_folder, media_file)
    print(f"🔄 Processing: {media_file}")

    try:
        results = model(media_path, save=True, project=output_folder, name="")
        print(f"✅ Saved results for: {media_file}")
    except Exception as e:
        print(f"❌ Error processing {media_file}: {e}")

# Move results to the run_X folder and clean up any subfolders
for item in os.listdir(output_folder):
    item_path = os.path.join(output_folder, item)
    if os.path.isdir(item_path):  # If a subfolder was created, move its contents
        for file in os.listdir(item_path):
            os.rename(os.path.join(item_path, file), os.path.join(output_folder, file))
        os.rmdir(item_path)  # Remove empty subfolder

# Check final number of processed files
final_files = [f for f in os.listdir(output_folder) if os.path.isfile(os.path.join(output_folder, f))]
print(f"📂 Inference complete! {len(final_files)} results saved in '{output_folder}/'.")
