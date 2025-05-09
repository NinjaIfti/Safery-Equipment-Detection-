# Safety Equipment Detection

A computer vision application for real-time detection of Personal Protective Equipment (PPE) and QR code scanning for construction sites and industrial environments.

![Safety Equipment Detection](https://img.shields.io/badge/Safety-AI%20Powered-blue)
![Python](https://img.shields.io/badge/Python-3.8%2B-brightgreen)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.0%2B-orange)
![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-yellow)

## Overview

This project combines YOLO-based object detection with QR code scanning to enforce and track safety equipment usage in industrial environments. The system:

- Detects PPE items (helmets, safety vests, gloves, etc.) on workers
- Scans and processes QR codes for authentication and logging
- Provides real-time safety compliance monitoring
- Integrates with Firebase for data storage and retrieval

## Features

- **Real-time PPE Detection**: YOLOv8 model trained to detect various safety equipment
- **QR Code Integration**: Scan and process QR codes for user verification
- **Web Interface**: Built with React for monitoring and administration
- **Offline Capability**: Process images locally when needed
- **Firebase Backend**: Secure data storage and authentication
- **Result Visualization**: Annotated output with detection boxes and confidence scores

## Tech Stack

- **Computer Vision**: YOLOv8 (Ultralytics), OpenCV
- **Frontend**: React, TailwindCSS
- **Backend**: Firebase
- **QR Processing**: html5-qrcode, jsqr
- **Data Processing**: Python, TensorFlow

## Installation

### Prerequisites

- Python 3.8+
- Node.js and npm
- Firebase account (for backend functionality)

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/your-username/Safety-Equipment-Detection.git
   cd Safety-Equipment-Detection
   ```

2. Set up Python environment:
   ```
   python -m venv venv
   venv\Scripts\activate  # Windows
   # OR
   source venv/bin/activate  # Linux/Mac
   
   pip install ultralytics opencv-python
   ```

3. Install Node.js dependencies:
   ```
   npm install
   ```

4. Configure Firebase:
   - Update `serviceAccountKey.json` with your Firebase credentials

## Usage

### Running the Model

```bash
# Run YOLO model on images in the img/ folder
python run_yolo.py

# Start the model server
python serve_model.py
```

### Web Interface

```bash
# Start the React development server
npm start
```

### QR Code Processing

```bash
# Process QR codes and update Firebase
python ppe_qr_detection.py
```

## Project Structure

- `/src` - React frontend code
- `/models` - Contains the YOLOv8 model files
- `/public` - Static assets
- `run_yolo.py` - Script to run object detection
- `serve_model.py` - API server for model inference
- `ppe_qr_detection.py` - QR code processing script

## Model Details

The project uses a custom-trained YOLOv8 model (`best.pt`) optimized for detecting safety equipment including:

- Hard hats
- Safety vests
- Gloves
- Safety glasses
- Face masks
- Hearing protection

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Ultralytics for the YOLOv8 implementation
- Contributors to the open-source libraries used in this project 
