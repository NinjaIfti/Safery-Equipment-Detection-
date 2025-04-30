import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { storage, db } from './firebase';  
import ReactWebcam from "react-webcam";
import * as faceapi from "face-api.js";
import jsQR from "jsqr";
import * as tf from "@tensorflow/tfjs";
import { 
  ref, 
  getDownloadURL 
} from "firebase/storage";  
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc,
  addDoc,
  serverTimestamp
} from "firebase/firestore";


const FaceRecognition = () => {
  const [workers, setWorkers] = useState([]);
  const [scannedWorker, setScannedWorker] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [message, setMessage] = useState("Starting attendance system...");
  const [modelLoadingProgress, setModelLoadingProgress] = useState(0);
  const [webcamReady, setWebcamReady] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [showAttendanceTable, setShowAttendanceTable] = useState(false);
  
  // QR code related states
  const [qrScanning, setQrScanning] = useState(true);
  const [qrScanned, setQrScanned] = useState(false);
  const [qrWorkerId, setQrWorkerId] = useState(null);
  
  // Camera control state
  const [cameraFacingMode, setCameraFacingMode] = useState("environment"); // "user" for front, "environment" for back
  
  // PPE Detection related states
  const [ppeScanning, setPpeScanning] = useState(false);
  const [ppeDetected, setPpeDetected] = useState(false);
  const [ppeModel, setPpeModel] = useState(null);
  const [ppeViolations, setPpeViolations] = useState([]);
  const [ppeResults, setPpeResults] = useState(null);
  const [ppeRequired, setPpeRequired] = useState(["helmet", "vest", "gloves"]);
  const [ppeTimeout, setPpeTimeout] = useState(null);
  
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const qrCanvasRef = useRef(null);
  const ppeCanvasRef = useRef(null);
  const qrTimeout = useRef(null);
  const navigate = useNavigate();

  // Toggle camera between front and back
  const toggleCamera = () => {
    setCameraFacingMode(prevMode => 
      prevMode === "environment" ? "user" : "environment"
    );
    
    // Reset webcam ready state as we're changing the camera
    setWebcamReady(false);
    
    // If in middle of scanning, we'll need to restart the scanning process
    if (qrScanning && !qrScanned) {
      // Clear any existing timeout
      if (qrTimeout.current) {
        clearTimeout(qrTimeout.current);
        qrTimeout.current = null;
      }
      
      // We'll let the useEffect hook restart scanning when webcam is ready
    }
  };

  // Function to scan QR code from video frame
  const scanQRCode = useCallback(() => {
    if (!qrScanning || qrScanned || !webcamReady) return;
    
    const video = webcamRef.current?.video;
    const qrCanvas = qrCanvasRef.current;
    
    if (!video || !qrCanvas || video.readyState !== 4) {
      // Try again if video isn't ready
      qrTimeout.current = setTimeout(scanQRCode, 100);
      return;
    }
    
    const canvas = qrCanvas;
    const context = canvas.getContext('2d');
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Set canvas dimensions to match video
    canvas.width = width;
    canvas.height = height;
    
    // Draw video frame to canvas
    context.drawImage(video, 0, 0, width, height);
    
    // Get image data for QR code scanning
    const imageData = context.getImageData(0, 0, width, height);
    
    // Scan for QR code
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    
    // Process result if QR code is found
    if (code) {
      console.log("QR code detected:", code.data);
      
      // Stop scanning
      setQrScanned(true);
      setMessage(`QR code detected: ${code.data}. Verifying...`);
      
      // Draw QR code bounding box
      context.beginPath();
      context.moveTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
      context.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y);
      context.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y);
      context.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y);
      context.lineTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
      context.lineWidth = 4;
      context.strokeStyle = "#FF3B58";
      context.stroke();
      
      // Process the QR code data (format: worker_ID)
      const workerId = code.data.replace("worker_", "");
      setQrWorkerId(workerId);
      
      // Verify worker exists
      verifyWorker(workerId).then(workerExists => {
        if (workerExists) {
          setMessage("QR code verified. Starting face verification...");
          // Small delay to ensure UI updates before switching to face scanning
          setTimeout(() => {
            setQrScanning(false);
            setIsScanning(true);
          }, 500);
        } else {
          setMessage("Invalid QR code or worker not found. Please try again.");
          setTimeout(() => {
            setQrScanned(false);
            setQrWorkerId(null);
          }, 2000);
        }
      });
      
      return;
    }
    
    // Continue scanning if no QR found
    qrTimeout.current = setTimeout(scanQRCode, 100);
  }, [qrScanning, qrScanned, webcamReady]);
  
  // Start QR scanning when webcam is ready
  useEffect(() => {
    if (webcamReady && qrScanning && !qrScanned) {
      setMessage("Please scan worker QR code");
      scanQRCode();
    }
    
    return () => {
      // Clean up timeout on unmount
      if (qrTimeout.current) {
        clearTimeout(qrTimeout.current);
      }
    };
  }, [webcamReady, qrScanning, qrScanned, scanQRCode, cameraFacingMode]);
  
  // Verify worker exists in database
  const verifyWorker = async (workerId) => {
    try {
      // Convert to the format used in Firestore (worker_{id})
      const docId = `worker_${workerId}`;
      const workerDocRef = doc(db, "workers", docId);
      const workerDoc = await getDoc(workerDocRef);
      
      return workerDoc.exists();
    } catch (error) {
      console.error("Error verifying worker:", error);
      return false;
    }
  };

  // Load face-api models only after QR code is scanned
  useEffect(() => {
    if (!qrScanned) return;

    const loadModels = async () => {
      try {
        setMessage("Loading facial recognition models...");
        
        // Use public URL for models - adjust this according to your file structure
        // For React apps using create-react-app, models should be in the public folder
        const MODEL_URL = process.env.PUBLIC_URL + '/models';
        
        // Load models with better error handling and sequential loading
        setModelLoadingProgress(0);
        
        try {
          await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
          setModelLoadingProgress(20);
          setMessage("Loading facial recognition models (1/5)...");
          console.log("✅ SSD Mobilenet model loaded");
        } catch (error) {
          console.error("Error loading SSD Mobilenet model:", error);
          setMessage(`Error loading SSD Mobilenet model. Check that ${MODEL_URL}/ssd_mobilenetv1_model-* files exist.`);
          return;
        }
        
        try {
          await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
          setModelLoadingProgress(40);
          setMessage("Loading facial recognition models (2/5)...");
          console.log("✅ Face Landmark model loaded");
        } catch (error) {
          console.error("Error loading Face Landmark model:", error);
          setMessage(`Error loading Face Landmark model. Check that ${MODEL_URL}/face_landmark_68_model-* files exist.`);
          return;
        }
        
        try {
          await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
          setModelLoadingProgress(60);
          setMessage("Loading facial recognition models (3/5)...");
          console.log("✅ Face Recognition model loaded");
        } catch (error) {
          console.error("Error loading Face Recognition model:", error);
          setMessage(`Error loading Face Recognition model. Check that ${MODEL_URL}/face_recognition_model-* files exist.`);
          return;
        }
        
        try {
          // Load TensorFlow.js
          await tf.ready();
          setModelLoadingProgress(80);
          setMessage("Loading PPE detection model (4/5)...");
          console.log("✅ TensorFlow.js is ready");
          
          try {
            // Load YOLOv8 model
            const ppeModelPath = process.env.PUBLIC_URL + '/models/best/model.json';
            const loadedModel = await tf.loadGraphModel(ppeModelPath);
            setPpeModel(loadedModel);
            setModelLoadingProgress(100);
            setMessage("All models loaded successfully (5/5)");
            console.log("✅ YOLOv8 PPE detection model loaded");
          } catch (error) {
            console.error("Error loading YOLOv8 PPE model:", error);
            setMessage(`Error loading PPE detection model. Check that ${process.env.PUBLIC_URL}/models/best/model.json exists.`);
            // Continue without PPE detection capability
            setModelLoadingProgress(100);
          }
        } catch (error) {
          console.error("Error loading TensorFlow.js:", error);
          setMessage("Error initializing TensorFlow.js. PPE detection may not work.");
          // Continue without PPE detection capability
          setModelLoadingProgress(100);
        }
        
        setModelsLoaded(true);
        setMessage("Loading worker face data...");
        
        // Fetch worker data
        await loadWorkerFaces();
      } catch (error) {
        console.error("Error in model loading process:", error);
        setMessage("Error loading facial recognition models. Please check console for details and refresh.");
      }
    };

    loadModels();
  }, [qrScanned]);

  // Handle webcam ready state
  const handleWebcamReady = () => {
    console.log("Webcam is ready");
    setWebcamReady(true);
    if (qrScanned) {
      setMessage("Face scanning ready. Please look at the camera.");
    }
  };

  // Load worker faces from Firebase
  const loadWorkerFaces = async () => {
    try {
      // Get all workers from Firestore
      const workersCollection = collection(db, "workers");
      const workerSnapshot = await getDocs(workersCollection);
      
      const workersData = [];
      const labeledDescriptors = [];
      
      if (workerSnapshot.empty) {
        setMessage("No worker records found in database.");
        return;
      }
      
      setMessage(`Loading face data for ${workerSnapshot.docs.length} workers...`);
      
      // Process all workers
      for (const workerDoc of workerSnapshot.docs) {
        const workerData = workerDoc.data();
        workersData.push({
          ...workerData,
          id: workerDoc.id
        });
        
        // Extract worker ID from Firestore
        const workerIdRaw = workerData.workerId || "";
        const workerId = workerIdRaw.replace("worker_", ""); // Remove prefix if present
        
        try {
          // Get face image URL from Firebase Storage - match your naming pattern
          const imageUrl = await getDownloadURL(ref(storage, `worker-faces/workerId_${workerId}.jpg`));
          
          // Load image and get face descriptor
          const img = await faceapi.fetchImage(imageUrl);
          const detections = await faceapi.detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();
          
          if (detections) {
            const descriptor = detections.descriptor;
            // Use the Firestore document ID as the label for face matching
            labeledDescriptors.push(
              new faceapi.LabeledFaceDescriptors(
                workerDoc.id, // Use the full document ID as the label
                [descriptor]
              )
            );
            console.log(`✅ Loaded face data for worker: ${workerData.name}`);
          } else {
            console.warn(`⚠️ No face detected in image for worker: ${workerData.name}`);
          }
        } catch (error) {
          console.error(`Error loading face for worker ${workerData.workerId}:`, error);
        }
      }
      
      // Create face matcher with loaded descriptors
      if (labeledDescriptors.length > 0) {
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
        setFaceMatcher(matcher);
        setWorkers(workersData);
        setMessage(webcamReady ? 
          `Face scanning ready. Loaded ${labeledDescriptors.length} worker faces.` : 
          `Loading webcam. Loaded ${labeledDescriptors.length} worker faces.`);
      } else {
        setMessage("No worker face data found. Please ensure worker face images are uploaded to storage.");
      }
    } catch (error) {
      console.error("Error loading worker faces:", error);
      setMessage("Error loading worker data. Please check network connection and try again.");
    }
  };

  // Face detection and recognition function
  const detectFaces = useCallback(async () => {
    if (!isScanning || !webcamRef.current || !canvasRef.current || !faceMatcher || !webcamReady || !qrScanned) return;

    const video = webcamRef.current.video;
    if (!video) return;

    // Make sure video is playing and has dimensions
    if (video.readyState !== 4 || video.videoWidth === 0 || video.videoHeight === 0) {
      requestAnimationFrame(detectFaces);
      return;
    }

    // Get video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Set canvas dimensions
    const canvas = canvasRef.current;
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    try {
      // Detect faces
      const detections = await faceapi.detectAllFaces(video)
        .withFaceLandmarks()
        .withFaceDescriptors();

      // Clear canvas and draw results
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Only draw video on canvas if detections succeeded
      if (detections && detections.length >= 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      
      // Match detected faces with workers
      if (detections && detections.length > 0) {
        for (const detection of detections) {
          // Make sure detection has valid dimensions
          if (!detection || !detection.detection || !detection.detection.box || 
              detection.detection.box.width === null || detection.detection.box.height === null) {
            console.warn("Invalid detection object:", detection);
            continue;
          }
          
          const match = faceMatcher.findBestMatch(detection.descriptor);
          
          if (match && match.label !== 'unknown') {
            // Draw detection on canvas
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { 
              label: match.label, 
              boxColor: match.distance < 0.6 ? 'green' : 'red' 
            });
            drawBox.draw(canvas);
            
            // If we have a good match
            if (match.distance < 0.6) {
              const workerId = match.label;
              
              // Get worker document ID from the match label (should be the document ID)
              // And compare with the QR code scanned workerId to ensure they match
              const scannedWorkerDocId = `worker_${qrWorkerId}`;
              
              if (workerId === scannedWorkerDocId) {
                // Both QR code and face match for the same worker
                setIsScanning(false);
                
                // Get worker data to pass to the PPE detection step
                const workerDocRef = doc(db, "workers", workerId);
                const workerDoc = await getDoc(workerDocRef);
                
                if (workerDoc.exists()) {
                  const workerData = workerDoc.data();
                  const matchedWorker = { ...workerData, id: workerId };
                  
                  // Set the current worker for PPE scanning
                  setScannedWorker(matchedWorker);
                  
                  // Move to PPE detection phase
                  setPpeScanning(true);
                  setMessage("Face matched! Starting PPE detection...");
                  
                  // Delay a bit to allow UI to update
                  setTimeout(() => {
                    detectPPE(matchedWorker);
                  }, 500);
                } else {
                  // Unusual case - face matched but worker data not found
                  setMessage("Worker face matched but record not found. Please try again.");
                  resetScanProcess();
                }
                
                return; // Exit after finding a good match
              } else {
                // Face doesn't match the QR code that was scanned
                setMessage("⚠️ Face doesn't match the QR code that was scanned. Please try again.");
                
                // Draw with red color to indicate mismatch
                const drawBox = new faceapi.draw.DrawBox(box, { 
                  label: "Mismatch with QR", 
                  boxColor: 'red' 
                });
                drawBox.draw(canvas);
              }
            }
          } else {
            // Draw unknown face
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { 
              label: 'Unknown', 
              boxColor: 'red' 
            });
            drawBox.draw(canvas);
          }
        }
      }
    } catch (error) {
      console.error("Error in face detection:", error);
    }

    // Continue scanning if no match found
    if (isScanning) {
      requestAnimationFrame(detectFaces);
    }
  }, [isScanning, faceMatcher, webcamReady, qrScanned, qrWorkerId]);

  // Start face detection when models and data are loaded
  useEffect(() => {
    if (qrScanned && isScanning && webcamRef.current) {
      console.log("Starting camera for face detection");
      // This log should help confirm the camera initialization path is reached
    }
    
    if (modelsLoaded && faceMatcher && isScanning && webcamReady && qrScanned) {
      console.log("Starting face detection");
      detectFaces();
      return () => {};
    }
  }, [modelsLoaded, faceMatcher, isScanning, detectFaces, webcamReady, qrScanned]);

  // Function to detect PPE using YOLOv8
  const detectPPE = async (worker) => {
    if (!ppeScanning || !webcamRef.current || !ppeCanvasRef.current || !ppeModel) {
      console.error("Cannot run PPE detection - missing requirements");
      markAttendance(worker.id, false, ["PPE detection unavailable"]);
      return;
    }
    
    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) {
      // Try again if video isn't ready
      setTimeout(() => detectPPE(worker), 100);
      return;
    }
    
    try {
      setMessage("Scanning for PPE (helmet, vest, gloves)...");
      
      // Get canvas and prepare for drawing
      const canvas = ppeCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Prepare image for YOLOv8 model
      const imageData = tf.browser.fromPixels(video);
      
      // Preprocess image to match model input requirements
      // For YOLOv8, usually need to resize to model input size (e.g., 640x640) and normalize
      const modelInputSize = 640;
      
      // Resize image to model input size
      const resized = tf.image.resizeBilinear(imageData, [modelInputSize, modelInputSize]);
      
      // Normalize pixel values to [0, 1]
      const normalized = resized.div(255.0);
      
      // Add batch dimension and get tensor in correct shape [1, 640, 640, 3]
      const batched = normalized.expandDims(0);
      
      // Run inference
      const results = await ppeModel.predict(batched);
      
      // Process results
      // Note: The exact processing depends on your YOLOv8 model output format
      // Assuming results is an array [boxes, scores, classes]
      const boxes = await results[0].arraySync();  // Normalized [x1, y1, x2, y2] coordinates
      const scores = await results[1].arraySync(); // Confidence scores
      const classes = await results[2].arraySync(); // Class indices
      
      // Class names for your PPE model (adjust to match your model's classes)
      const classNames = ["helmet", "vest", "gloves", "boots", "no_helmet", "no_vest", "no_gloves", "no_boots"];
      
      // Threshold for detection confidence
      const threshold = 0.5;
      
      // Track detected items and violations
      const detected = [];
      const violations = [];
      
      // Process detections above threshold
      for (let i = 0; i < scores[0].length; i++) {
        if (scores[0][i] > threshold) {
          // Get class name
          const className = classNames[classes[0][i]];
          
          // Check if this is a violation (classes with "no_" prefix)
          if (className.startsWith("no_")) {
            violations.push(className);
          } else {
            detected.push(className);
          }
          
          // Draw bounding box on canvas
          const [y1, x1, y2, x2] = boxes[0][i];
          const boxX = x1 * canvas.width;
          const boxY = y1 * canvas.height;
          const boxWidth = (x2 - x1) * canvas.width;
          const boxHeight = (y2 - y1) * canvas.height;
          
          // Set color based on whether it's compliant (green) or violation (red)
          ctx.strokeStyle = className.startsWith("no_") ? "red" : "green";
          ctx.lineWidth = 2;
          ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
          
          // Draw label
          ctx.fillStyle = className.startsWith("no_") ? "red" : "green";
          ctx.font = "16px Arial";
          ctx.fillText(`${className} (${Math.round(scores[0][i] * 100)}%)`, boxX, boxY > 20 ? boxY - 5 : boxY + 20);
        }
      }
      
      // Check if all required PPE items are detected
      const missingPPE = [];
      for (const item of ppeRequired) {
        if (!detected.includes(item)) {
          missingPPE.push(`no_${item}`);
        }
      }
      
      // Store detection results
      setPpeResults({
        detected,
        violations: [...violations, ...missingPPE]
      });
      
      // Update violations state
      setPpeViolations([...violations, ...missingPPE]);
      
      // Check if there are any violations
      const hasViolations = violations.length > 0 || missingPPE.length > 0;
      const isPpeCompliant = !hasViolations;
      
      // Set PPE detection result
      setPpeDetected(isPpeCompliant);
      
      // Mark attendance with PPE status
      markAttendance(worker.id, isPpeCompliant, [...violations, ...missingPPE]);
      
      // Display appropriate message
      if (isPpeCompliant) {
        setMessage("✅ PPE verification successful!");
      } else {
        const violationItems = [...violations, ...missingPPE]
          .map(v => v.replace("no_", "missing "))
          .join(", ");
        setMessage(`⚠️ PPE verification failed: ${violationItems}`);
      }
      
      // Clean up tensors to avoid memory leaks
      imageData.dispose();
      resized.dispose();
      normalized.dispose();
      batched.dispose();
      results.forEach(tensor => tensor.dispose());
      
    } catch (error) {
      console.error("Error in PPE detection:", error);
      setMessage("Error during PPE verification. Processing attendance anyway.");
      // Mark attendance without PPE verification
      markAttendance(worker.id, false, ["PPE detection error"]);
    }
  };

  // Mark attendance for matched worker
  const markAttendance = async (workerId, ppeCompliant, ppeViolations = []) => {
    try {
      setPpeScanning(false);
      
      const workerDocRef = doc(db, "workers", workerId);
      const workerDoc = await getDoc(workerDocRef);

      if (workerDoc.exists()) {
        const workerData = workerDoc.data();

        // Update attendance status with timestamp and PPE compliance
        const timestamp = new Date().toISOString();
        await updateDoc(workerDocRef, { 
          attendance: "Present",
          lastAttendanceTime: timestamp,
          ppeCompliant: ppeCompliant,
          lastPpeStatus: ppeCompliant ? "Compliant" : "Non-compliant"
        });

        // Add attendance record with PPE details
        const attendanceRecordsRef = collection(db, "attendanceRecords");
        await addDoc(attendanceRecordsRef, {
          workerId: workerId,
          name: workerData.name,
          timestamp: serverTimestamp(),
          status: "Present",
          ppeCompliant: ppeCompliant,
          ppeViolations: ppeViolations,
          department: workerData.department || "Not specified",
          post: workerData.post || "Not specified"
        });

        // Set scanned worker details
        const updatedWorkerData = { 
          ...workerData, 
          id: workerId,
          attendance: "Present",
          timestamp: timestamp,
          ppeCompliant: ppeCompliant,
          ppeViolations: ppeViolations
        };
        
        setScannedWorker(updatedWorkerData);
        
        // Add to attendance records list
        setAttendanceRecords(prev => {
          // Check if this worker is already in the list
          const existingIndex = prev.findIndex(w => w.workerId === workerData.workerId);
          if (existingIndex >= 0) {
            // Update existing record
            const updated = [...prev];
            updated[existingIndex] = updatedWorkerData;
            return updated;
          } else {
            // Add new record
            return [...prev, updatedWorkerData];
          }
        });
        
        // Show attendance table after successful recognition
        setShowAttendanceTable(true);
        
        const statusMessage = ppeCompliant ? 
          `✅ Attendance marked for: ${workerData.name} (PPE: Compliant)` : 
          `⚠️ Attendance marked for: ${workerData.name} (PPE: Non-compliant)`;
          
        setMessage(statusMessage);
        console.log(statusMessage);
      } else {
        setScannedWorker({ error: "❌ Worker record not found!" });
        setMessage("Face recognized but worker record not found!");
      }
    } catch (error) {
      console.error("Error marking attendance:", error);
      setScannedWorker({ error: "❌ Error marking attendance!" });
      setMessage("Error occurred while processing attendance!");
    }
  };

  // Reset everything and start over
  const resetScanProcess = () => {
    setQrScanned(false);
    setQrWorkerId(null);
    setScannedWorker(null);
    setShowAttendanceTable(false);
    setIsScanning(false);
    setQrScanning(true);
    setPpeScanning(false);
    setPpeDetected(false);
    setPpeResults(null);
    setPpeViolations([]);
    setMessage("Please scan worker QR code");
    
    // Clear timeouts
    if (qrTimeout.current) {
      clearTimeout(qrTimeout.current);
    }
    
    window.location.reload();
  };

  // Format timestamp for display
  const formatTime = (timestamp) => {
    if (!timestamp) return "N/A";
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
    } catch (e) {
      return "Invalid date";
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 p-6">
      <div className="w-full max-w-3xl bg-white p-6 rounded-lg shadow-lg text-center">
        <h2 className="text-2xl font-semibold text-gray-800">👤 QR + Face + PPE Detection System</h2>
        
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        
        {/* Loading Progress */}
        {qrScanned && !modelsLoaded && modelLoadingProgress > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${modelLoadingProgress}%` }}
            ></div>
          </div>
        )}

        {/* Camera Toggle Button */}
        <button 
          onClick={toggleCamera} 
          className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
        >
          {cameraFacingMode === "environment" ? "📷 Switch to Front Camera" : "📷 Switch to Back Camera"}
        </button>

        {/* Webcam for QR, Face, and PPE Detection */}
        <div className="mt-4 flex flex-col items-center relative">
          <ReactWebcam
            ref={webcamRef}
            className="w-full max-w-md rounded-lg border border-gray-300 shadow-md"
            mirrored={cameraFacingMode === "user"}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              width: 640,
              height: 480,
              facingMode: cameraFacingMode
            }}
            onUserMedia={handleWebcamReady}
          />
          
          {/* QR Canvas */}
          {qrScanning && !qrScanned && (
            <canvas 
              ref={qrCanvasRef} 
              className="absolute top-0 left-0 right-0 mx-auto w-full max-w-md rounded-lg"
            />
          )}
          
          {/* Face Detection Canvas */}
          {isScanning && (
            <canvas 
              ref={canvasRef} 
              className="absolute top-0 left-0 right-0 mx-auto w-full max-w-md rounded-lg"
            />
          )}
          
          {/* PPE Detection Canvas */}
          {ppeScanning && (
            <canvas 
              ref={ppeCanvasRef} 
              className="absolute top-0 left-0 right-0 mx-auto w-full max-w-md rounded-lg"
            />
          )}
          
          {/* Camera Guidance */}
          {qrScanning && !qrScanned && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="border-2 border-white w-72 h-72 rounded-lg opacity-80"></div>
              <p className="text-white text-sm mt-2 bg-black bg-opacity-50 p-1 rounded">Center QR code in box</p>
            </div>
          )}
        </div>

        {/* Verification Progress Steps */}
        <div className="mt-4 flex justify-center items-center space-x-4">
          <div className={`flex flex-col items-center ${qrScanned ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${qrScanned ? 'bg-green-100 border-green-600' : 'bg-gray-100 border-gray-300'} border-2`}>
              <span>1</span>
            </div>
            <span className="text-xs mt-1">QR</span>
          </div>
          <div className="h-1 w-8 bg-gray-200 rounded">
            <div className={`h-full ${qrScanned ? 'bg-green-500' : 'bg-gray-200'} rounded`}></div>
          </div>
          <div className={`flex flex-col items-center ${scannedWorker && !ppeScanning ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${scannedWorker && !ppeScanning ? 'bg-green-100 border-green-600' : 'bg-gray-100 border-gray-300'} border-2`}>
              <span>2</span>
            </div>
            <span className="text-xs mt-1">Face</span>
          </div>
          <div className="h-1 w-8 bg-gray-200 rounded">
            <div className={`h-full ${scannedWorker ? 'bg-green-500' : 'bg-gray-200'} rounded`}></div>
          </div>
          <div className={`flex flex-col items-center ${ppeResults ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ppeResults ? 'bg-green-100 border-green-600' : 'bg-gray-100 border-gray-300'} border-2`}>
              <span>3</span>
            </div>
            <span className="text-xs mt-1">PPE</span>
          </div>
        </div>

        {/* Scanned Worker Details with PPE Status */}
        {scannedWorker && !scannedWorker.error && (
          <div className="mt-6 p-4 bg-gray-100 border rounded-lg">
            <h3 className="text-green-600 font-semibold">✅ Worker Identified</h3>
            <div className="flex items-center justify-center mt-2">
              {scannedWorker.faceImageURL && (
                <img 
                  src={scannedWorker.faceImageURL} 
                  alt={`${scannedWorker.name}`}
                  className="h-16 w-16 object-cover rounded-full border-2 border-green-500 mr-4"
                />
              )}
              <div className="text-left">
                <p className="text-gray-700"><strong>Name:</strong> {scannedWorker.name}</p>
                <p className="text-gray-700"><strong>Worker ID:</strong> {scannedWorker.workerId}</p>
                <p className="text-gray-700"><strong>Post:</strong> {scannedWorker.post}</p>
                <p className="text-green-600 font-semibold">
                  <strong>Attendance:</strong> {scannedWorker.attendance} at {formatTime(scannedWorker.timestamp)}
                </p>
                {scannedWorker.ppeCompliant !== undefined && (
                  <p className={scannedWorker.ppeCompliant ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                    <strong>PPE Status:</strong> {scannedWorker.ppeCompliant ? "Compliant ✅" : "Non-compliant ⚠️"}
                  </p>
                )}
              </div>
            </div>

            {/* PPE Violations List */}
            {scannedWorker.ppeViolations && scannedWorker.ppeViolations.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
                <h4 className="text-red-600 font-medium mb-1">PPE Violations Detected:</h4>
                <ul className="list-disc pl-5">
                  {scannedWorker.ppeViolations.map((violation, index) => (
                    <li key={index} className="text-red-700">
                      {violation.replace('no_', 'Missing ')}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-red-600 mt-2">
                  Please ensure all required safety equipment is worn properly before entering work area.
                </p>
              </div>
            )}
          </div>
        )}

        {scannedWorker && scannedWorker.error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="text-red-600 font-semibold">{scannedWorker.error}</h3>
          </div>
        )}

        {/* Attendance Records Table with PPE Status */}
        {showAttendanceTable && attendanceRecords.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Today's Attendance</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse bg-white rounded-lg shadow">
                <thead>
                  <tr className="bg-gray-100 text-gray-800">
                    <th className="px-4 py-2 text-left">Worker</th>
                    <th className="px-4 py-2 text-left">ID</th>
                    <th className="px-4 py-2 text-left">Post</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">PPE</th>
                    <th className="px-4 py-2 text-left">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.map((record) => (
                    <tr key={record.workerId} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 flex items-center">
                        {record.faceImageURL && (
                          <img 
                            src={record.faceImageURL} 
                            alt={record.name} 
                            className="h-8 w-8 object-cover rounded-full mr-2"
                          />
                        )}
                        {record.name}
                      </td>
                      <td className="px-4 py-2">{record.workerId}</td>
                      <td className="px-4 py-2">{record.post}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                          {record.attendance}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {record.ppeCompliant !== undefined && (
                          <span className={`px-2 py-1 ${record.ppeCompliant ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded-full text-xs font-semibold`}>
                            {record.ppeCompliant ? "Compliant" : "Non-compliant"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm">{formatTime(record.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            ⬅️ Back to Admin Panel
          </button>

          {(scannedWorker || qrScanned) && (
            <button
              onClick={resetScanProcess}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              🔄 Scan Another
            </button>
          )}
          
          {(!modelsLoaded && qrScanned) && (
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
            >
              🔄 Refresh Page
            </button>
          )}
          
          {attendanceRecords.length > 0 && (
            <button
              onClick={() => setShowAttendanceTable(!showAttendanceTable)}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
            >
              {showAttendanceTable ? "🔽 Hide Attendance" : "🔼 Show Attendance"} 
            </button>
          )}
        </div>
        
        {/* PPE Requirements Info */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-left">
          <h4 className="text-blue-700 font-medium">Required PPE for Site Access:</h4>
          <ul className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
            {ppeRequired.map((item, index) => (
              <li key={index} className="flex items-center">
                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full mr-2">✓</span>
                <span className="capitalize">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FaceRecognition;