import qrcode
import os

# Create a folder named "QR_codes" if it doesn't exist
output_folder = "QR_codes"
os.makedirs(output_folder, exist_ok=True)

# List of worker IDs (You can add more workers)
worker_ids = ["worker_001", "worker_002", "worker_003"]

# Generate QR codes with optimized settings
for worker_id in worker_ids:
    qr = qrcode.QRCode(
        version=1,  # Controls the size of the QR code (1 is the smallest)
        error_correction=qrcode.constants.ERROR_CORRECT_L,  # Low error correction (sufficient for IDs)
        box_size=10,  # Size of each box in the QR code grid
        border=4,  # Border thickness
    )
    qr.add_data(worker_id)  # Add worker ID as data
    qr.make(fit=True)  # Optimize QR code size

    # Generate the QR code image
    img = qr.make_image(fill="black", back_color="white")

    # Save inside "QR_codes" folder
    img_path = os.path.join(output_folder, f"{worker_id}.png")
    img.save(img_path)

    print(f"✅ QR Code saved: {img_path}")

print(f"\n🎯 QR Codes successfully generated! Check the '{output_folder}' folder.")
