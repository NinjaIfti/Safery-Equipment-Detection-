import os
from ultralytics import YOLO

# Load trained YOLOv8 model
model = YOLO("best.pt")  # Ensure the correct path to your model

# Path to the image folder
image_folder = "img"

# Get all image files
image_files = [f for f in os.listdir(image_folder) if f.endswith(('.jpg', '.png', '.jpeg'))]

# Run inference on all images in the folder
for image_file in image_files:
    image_path = os.path.join(image_folder, image_file)
    results = model(image_path, show=True)  # Show detections on the image

    # Save the results
    for r in results:
        r.save(filename=os.path.join("output", image_file))  # Save detected images to 'output' folder

print("Inference complete! Check the 'output' folder.")
