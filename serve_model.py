from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import base64
import io
from PIL import Image
import numpy as np
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Check if model file exists
model_path = 'best.pt'
if not os.path.exists(model_path):
    print(f"❌ Model file not found at: {model_path}")
    print(f"Current working directory: {os.getcwd()}")
    print("Available files:", os.listdir())
    model_loaded = False
    model = None
else:
    try:
        # Load the YOLOv8 model
        model = YOLO(model_path)
        print(f"✅ Model loaded successfully from {model_path}!")
        print(f"Model classes: {model.names}")
        model_loaded = True
    except Exception as e:
        print(f"❌ Error loading model: {str(e)}")
        model = None
        model_loaded = False

@app.route('/detect', methods=['POST'])
def detect():
    """Detect PPE in an image"""
    try:
        if not model_loaded:
            return jsonify({"success": False, "error": "Model not loaded"}), 500
            
        # Get the image data from the request
        image_data = request.json.get('image')
        if not image_data:
            return jsonify({"success": False, "error": "No image data provided"}), 400
            
        # Handle base64 images with or without prefix
        if ',' in image_data:
            image_data = image_data.split(',')[1]  # Remove base64 prefix
        
        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Run inference
        results = model(image)
        
        # Process results
        output = []
        for result in results:
            boxes = result.boxes.cpu().numpy()
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0]
                confidence = box.conf[0]
                class_id = int(box.cls[0])
                class_name = model.names[class_id]
                
                output.append({
                    'class': class_name,
                    'confidence': float(confidence),
                    'box': [float(x1), float(y1), float(x2), float(y2)]
                })
        
        # Return the detections
        return jsonify({
            "success": True,
            "detections": output,
            "model_classes": model.names
        })
    
    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/status', methods=['GET'])
def status():
    """Check if the API is working and the model is loaded."""
    return jsonify({
        "status": "running",
        "model_loaded": model_loaded,
        "model_path": model_path,
        "classes": model.names if model_loaded else None
    })

# Add a root route for basic testing
@app.route('/', methods=['GET'])
def home():
    return "PPE Detection API is running. Use /status to check status and /detect for detections."

if __name__ == '__main__':
    print("Starting PPE Detection API server...")
    if model_loaded:
        print("Model classes:", model.names)
    else:
        print("Warning: Model not loaded. API will return errors for detection requests.")
    app.run(debug=True, port=5000)