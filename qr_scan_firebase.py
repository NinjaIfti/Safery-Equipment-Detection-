import cv2
import numpy as np
from pyzbar.pyzbar import decode
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
cred = credentials.Certificate("serviceAccountKey.json")  
firebase_admin.initialize_app(cred)
db = firestore.client()

print("✅ Firebase successfully connected!")

# Open webcam for QR code scanning
cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ Error: Unable to capture frame!")
        break

    # Step 1: Scan QR Code for Worker ID
    worker_id = None
    for barcode in decode(frame):
        worker_id = barcode.data.decode("utf-8")
        print(f"📷 Scanned Worker ID: {worker_id}")

        # Retrieve worker details from Firestore
        worker_ref = db.collection("workers").document(worker_id)
        worker_data = worker_ref.get()

        if worker_data.exists:
            worker_info = worker_data.to_dict()
            worker_name = worker_info["name"]
            worker_post = worker_info["post"]
           
            print(f"✅ Worker Found: {worker_name} - {worker_post}")
            
            
            # Display worker details on frame
            cv2.putText(frame, f"Name: {worker_name}", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, f"Post: {worker_post}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

        else:
            print("❌ Worker Not Found!")
            cv2.putText(frame, "Worker Not Found", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

    # Show the camera feed
    cv2.imshow("QR Code Scanner", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):  # Press 'q' to quit
        break

cap.release()
cv2.destroyAllWindows()
