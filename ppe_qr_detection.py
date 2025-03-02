import cv2
import numpy as np
from pyzbar.pyzbar import decode
from ultralytics import YOLO
import datetime
import os

# Load the trained YOLOv8 model (Make sure 'best.pt' is in the same folder)
MODEL_PATH = "best.pt"
if not os.path.exists(MODEL_PATH):
    print("❌ Error: Model file 'best.pt' not found!")
    exit()

model = YOLO(MODEL_PATH)

# Define required PPE for attendance (Update class indices based on your dataset)
REQUIRED_PPE = {2, 10, 3}  # Suit, Shoes, Helmet (Update based on your dataset)

# Open webcam (0 = Laptop Camera, 1 = External Webcam)
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Error: Unable to access the camera!")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ Error: Failed to capture frame!")
        break

    # Step 1: Scan QR Code for Worker ID
    worker_id = None
    for barcode in decode(frame):
        worker_id = barcode.data.decode("utf-8")
        print(f"📷 Scanned Worker ID: {worker_id}")

        # Draw rectangle around QR code
        rect_pts = barcode.polygon
        pts = np.array(rect_pts, np.int32)
        pts = pts.reshape((-1, 1, 2))
        cv2.polylines(frame, [pts], True, (0, 255, 0), 2)

    if worker_id:
        # Step 2: Capture Image & Run PPE Detection
        image_path = "worker_capture.jpg"
        cv2.imwrite(image_path, frame)
        results = model(frame)  # YOLOv8 PPE detection
        detected_classes = set([int(box.cls) for box in results[0].boxes])

        # Step 3: Check PPE Compliance
        compliance = REQUIRED_PPE.issubset(detected_classes)
        status = "Attendance Granted ✅" if compliance else "Attendance Denied ❌"

        # Display worker status
        cv2.putText(frame, f"{worker_id}: {status}", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    cv2.imshow("QR Code + PPE Detection", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):  # Press 'q' to quit
        break

cap.release()
cv2.destroyAllWindows()
