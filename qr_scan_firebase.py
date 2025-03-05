import cv2
import numpy as np
from pyzbar.pyzbar import decode
import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase
cred = credentials.Certificate("serviceAccountKey.json")  
firebase_admin.initialize_app(cred)
db = firestore.client()

print("✅ Firebase successfully connected!")

# Function to scan QR from the webcam
def scan_from_webcam():
    # Open webcam for QR code scanning
    cap = cv2.VideoCapture(0)

    last_scanned_workerId = None

    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Error: Unable to capture frame!")
            break

        # Step 1: Scan QR Code for Worker ID
        workerId = None
        for barcode in decode(frame):
            workerId = barcode.data.decode("utf-8")
            
            # Check if the scanned workerId is different from the last one
            if workerId != last_scanned_workerId:
                print(f"📷 Scanned Worker ID: {workerId}")

                # Retrieve worker details from Firestore using workerId
                worker_ref = db.collection("workers").document(workerId)
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

                # Update last scanned workerId
                last_scanned_workerId = workerId

        # Show the camera feed
        cv2.imshow("QR Code Scanner", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):  # Press 'q' to quit
            break

    cap.release()
    cv2.destroyAllWindows()


# Function to scan QR from a PNG file
def scan_from_image(image_path):
    # Step 1: Read the PNG image
    image = cv2.imread(image_path)

    if image is None:
        print(f"❌ Error: Unable to read the image at {image_path}!")
    else:
        # Step 2: Decode QR Code from the image
        workerId = None
        for barcode in decode(image):
            workerId = barcode.data.decode("utf-8")
            
            # Step 3: Retrieve worker details from Firestore using workerId
            if workerId:
                print(f"📷 Scanned Worker ID: {workerId}")

                worker_ref = db.collection("workers").document(workerId)
                worker_data = worker_ref.get()

                if worker_data.exists:
                    worker_info = worker_data.to_dict()
                    worker_name = worker_info["name"]
                    worker_post = worker_info["post"]
                    print(f"✅ Worker Found: {worker_name} - {worker_post}")
                    
                    # Display worker details on the image
                    cv2.putText(image, f"Name: {worker_name}", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                    cv2.putText(image, f"Post: {worker_post}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                else:
                    print("❌ Worker Not Found!")
                    cv2.putText(image, "Worker Not Found", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    
                # Step 4: Show the processed image with worker details
                cv2.imshow("QR Code Scan Result", image)

                # Wait for user to press a key before closing the image window
                cv2.waitKey(0)
                
        cv2.destroyAllWindows()


# Function to process all PNG files in the folder
def scan_all_images_in_folder(folder_path):
    # Get all PNG files in the directory
    png_files = [f for f in os.listdir(folder_path) if f.endswith('.png')]

    if not png_files:
        print("❌ No PNG files found in the specified folder.")
    else:
        print(f"✅ Found {len(png_files)} PNG file(s).")
        for png_file in png_files:
            image_path = os.path.join(folder_path, png_file)
            print(f"Processing: {image_path}")
            scan_from_image(image_path)


# Main function to choose between webcam or image file
def main():
    choice = input("Choose an option:\n1. Scan from Webcam\n2. Scan from all PNG files in folder\nEnter 1 or 2: ")

    if choice == "1":
        scan_from_webcam()
    elif choice == "2":
        # Fixed folder path
        folder_path = r"S:\ML\Safery-Equipment-Detection-\QR_codes"
        scan_all_images_in_folder(folder_path)
    else:
        print("❌ Invalid choice. Please enter 1 or 2.")

if __name__ == "__main__":
    main()
