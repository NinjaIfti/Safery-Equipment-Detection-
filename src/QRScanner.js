import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { storage, db } from './firebase';  
import ReactWebcam from "react-webcam";
import * as faceapi from "face-api.js";
import { 
  ref, 
  getDownloadURL 
} from "firebase/storage";  
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc 
} from "firebase/firestore";


const FaceRecognition = () => {
  const [workers, setWorkers] = useState([]);
  const [scannedWorker, setScannedWorker] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [message, setMessage] = useState("Loading facial recognition models...");
  const [modelLoadingProgress, setModelLoadingProgress] = useState(0);
  const [webcamReady, setWebcamReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);
  
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  // Debug function
  const addDebugLog = (log) => {
    console.log(log);
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${log}`]);
  };

  // Load face-api models
  useEffect(() => {
    const loadModels = async () => {
      try {
        addDebugLog("Starting to load facial recognition models...");
        setMessage("Loading facial recognition models...");
        
        // Use public URL for models - adjust this according to your file structure
        const MODEL_URL = process.env.PUBLIC_URL + '/models';
        addDebugLog(`Using model path: ${MODEL_URL}`);
        
        // Load models with better error handling and sequential loading
        setModelLoadingProgress(0);
        
        try {
          addDebugLog("Loading SSD Mobilenet model...");
          await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
          setModelLoadingProgress(33);
          setMessage("Loading facial recognition models (1/3)...");
          addDebugLog("✅ SSD Mobilenet model loaded successfully");
        } catch (error) {
          addDebugLog(`❌ Error loading SSD Mobilenet model: ${error.message}`);
          console.error("Error loading SSD Mobilenet model:", error);
          setMessage(`Error loading SSD Mobilenet model. Check that ${MODEL_URL}/ssd_mobilenetv1_model-* files exist.`);
          return;
        }
        
        try {
          addDebugLog("Loading Face Landmark model...");
          await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
          setModelLoadingProgress(66);
          setMessage("Loading facial recognition models (2/3)...");
          addDebugLog("✅ Face Landmark model loaded successfully");
        } catch (error) {
          addDebugLog(`❌ Error loading Face Landmark model: ${error.message}`);
          console.error("Error loading Face Landmark model:", error);
          setMessage(`Error loading Face Landmark model. Check that ${MODEL_URL}/face_landmark_68_model-* files exist.`);
          return;
        }
        
        try {
          addDebugLog("Loading Face Recognition model...");
          await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
          setModelLoadingProgress(100);
          setMessage("Loading facial recognition models (3/3)...");
          addDebugLog("✅ Face Recognition model loaded successfully");
        } catch (error) {
          addDebugLog(`❌ Error loading Face Recognition model: ${error.message}`);
          console.error("Error loading Face Recognition model:", error);
          setMessage(`Error loading Face Recognition model. Check that ${MODEL_URL}/face_recognition_model-* files exist.`);
          return;
        }
        
        setModelsLoaded(true);
        setMessage("Loading worker face data...");
        addDebugLog("All models loaded successfully. Moving to load worker face data.");
        
        // Fetch worker data
        await loadWorkerFaces();
      } catch (error) {
        addDebugLog(`❌ General error in model loading process: ${error.message}`);
        console.error("Error in model loading process:", error);
        setMessage("Error loading facial recognition models. Please check console for details and refresh.");
      }
    };

    loadModels();
  }, []);

  // Handle webcam ready state
  const handleWebcamReady = () => {
    addDebugLog("Webcam is ready for use");
    setWebcamReady(true);
    setMessage(prevMessage => prevMessage === "Loading worker face data..." ? 
      "Face scanning ready. Please look at the camera." : prevMessage);
  };

  // Load worker faces from Firebase
  const loadWorkerFaces = async () => {
    try {
      addDebugLog("Starting to load worker faces from Firestore...");
      
      // Get all workers from Firestore
      const workersCollection = collection(db, "workers");
      const workerSnapshot = await getDocs(workersCollection);
      
      addDebugLog(`Retrieved ${workerSnapshot.docs.length} worker documents from Firestore`);
      
      const workersData = [];
      const labeledDescriptors = [];
      
      if (workerSnapshot.empty) {
        addDebugLog("❌ No worker records found in Firestore database");
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
        
        addDebugLog(`Processing worker: ${workerData.name}, ID: ${workerData.workerId}, Doc ID: ${workerDoc.id}`);
        
        // Extract worker ID from Firestore
        const workerIdRaw = workerData.workerId || "";
        const workerId = workerIdRaw.replace("worker_", ""); // Remove prefix if present
        addDebugLog(`Extracted worker ID: ${workerId}`);
        
        try {
          // Get face image URL from Firebase Storage
          const imagePath = `worker-faces/workerId_${workerId}.jpg`;
          addDebugLog(`Attempting to load image from storage path: ${imagePath}`);
          
          const imageUrl = await getDownloadURL(ref(storage, imagePath));
          addDebugLog(`✅ Successfully got image URL: ${imageUrl.substring(0, 50)}...`);
          
          // Load image and get face descriptor
          addDebugLog(`Fetching image for face detection...`);
          const img = await faceapi.fetchImage(imageUrl);
          addDebugLog(`Image fetched successfully, running face detection...`);
          
          const detections = await faceapi.detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();
          
          if (detections) {
            addDebugLog(`✅ Face detected in image for worker: ${workerData.name}`);
            const descriptor = detections.descriptor;
            // Use the Firestore document ID as the label for face matching
            labeledDescriptors.push(
              new faceapi.LabeledFaceDescriptors(
                workerDoc.id, // Use the full document ID as the label
                [descriptor]
              )
            );
            addDebugLog(`Added face descriptor for worker: ${workerData.name}`);
          } else {
            addDebugLog(`⚠️ No face detected in image for worker: ${workerData.name}. Check image quality.`);
            console.warn(`No face detected in image for worker: ${workerData.name}`);
          }
        } catch (error) {
          addDebugLog(`❌ Error processing worker ${workerData.name}: ${error.message}`);
          console.error(`Error loading face for worker ${workerData.workerId}:`, error);
        }
      }
      
      addDebugLog(`Processed all workers. Found ${labeledDescriptors.length} valid face descriptors out of ${workersData.length} workers.`);
      
      // Create face matcher with loaded descriptors
      if (labeledDescriptors.length > 0) {
        addDebugLog(`Creating face matcher with ${labeledDescriptors.length} descriptors`);
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
        setFaceMatcher(matcher);
        setWorkers(workersData);
        
        const statusMessage = webcamReady ? 
          `Face scanning ready. Loaded ${labeledDescriptors.length} worker faces.` : 
          `Loading webcam. Loaded ${labeledDescriptors.length} worker faces.`;
        
        setMessage(statusMessage);
        addDebugLog(`Face recognition system ready. ${statusMessage}`);
      } else {
        addDebugLog(`❌ No valid worker face data found. Check image quality and storage paths.`);
        setMessage("No worker face data found. Please ensure worker face images are uploaded to storage.");
      }
    } catch (error) {
      addDebugLog(`❌ General error loading worker faces: ${error.message}`);
      console.error("Error loading worker faces:", error);
      setMessage("Error loading worker data. Please check network connection and try again.");
    }
  };

  // Face detection and recognition function
  const detectFaces = useCallback(async () => {
    if (!isScanning || !webcamRef.current || !canvasRef.current || !faceMatcher || !webcamReady) {
      // Don't log this to avoid spamming the console
      return;
    }

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
        addDebugLog(`Detected ${detections.length} faces in webcam`);
        
        for (const detection of detections) {
          // Make sure detection has valid dimensions
          if (!detection || !detection.detection || !detection.detection.box || 
              detection.detection.box.width === null || detection.detection.box.height === null) {
            addDebugLog("⚠️ Invalid detection object skipped");
            continue;
          }
          
          const match = faceMatcher.findBestMatch(detection.descriptor);
          addDebugLog(`Face match result: ${match.label}, distance: ${match.distance.toFixed(2)}`);
          
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
              addDebugLog(`✅ Good match found for worker ID: ${match.label}`);
              const workerId = match.label;
              await markAttendance(workerId);
              return; // Exit after finding a good match
            }
          } else {
            // Draw unknown face
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { 
              label: 'Unknown', 
              boxColor: 'red' 
            });
            drawBox.draw(canvas);
            addDebugLog("⚠️ Unknown face detected");
          }
        }
      }
    } catch (error) {
      addDebugLog(`❌ Error in face detection: ${error.message}`);
      console.error("Error in face detection:", error);
    }

    // Continue scanning if no match found
    if (isScanning) {
      requestAnimationFrame(detectFaces);
    }
  }, [isScanning, faceMatcher, webcamReady]);

  // Start face detection when models and data are loaded
  useEffect(() => {
    if (modelsLoaded && faceMatcher && isScanning && webcamReady) {
      addDebugLog("Starting face detection loop");
      detectFaces();
      return () => {
        addDebugLog("Stopping face detection loop");
      };
    }
  }, [modelsLoaded, faceMatcher, isScanning, detectFaces, webcamReady]);

  // Mark attendance for matched worker
  const markAttendance = async (workerId) => {
    try {
      addDebugLog(`Marking attendance for worker ID: ${workerId}`);
      setMessage("Face matched! Processing...");
      setIsScanning(false);
      
      const workerDocRef = doc(db, "workers", workerId);
      addDebugLog(`Fetching worker document from Firestore`);
      const workerDoc = await getDoc(workerDocRef);

      if (workerDoc.exists()) {
        const workerData = workerDoc.data();
        addDebugLog(`Worker document found: ${workerData.name}`);

        // Update attendance status with timestamp
        const timestamp = new Date().toISOString();
        addDebugLog(`Updating attendance status in Firestore`);
        await updateDoc(workerDocRef, { 
          attendance: "Present",
          lastAttendanceTime: timestamp
        });

        // Set scanned worker details
        setScannedWorker({ 
          ...workerData, 
          attendance: "Present",
          timestamp: timestamp
        });
        
        setMessage(`Face recognized: ${workerData.name}`);
        addDebugLog(`✅ Attendance successfully marked for: ${workerData.name}`);
      } else {
        addDebugLog(`❌ Worker document does not exist in Firestore`);
        setScannedWorker({ error: "❌ Worker record not found!" });
        setMessage("Face recognized but worker record not found!");
      }
    } catch (error) {
      addDebugLog(`❌ Error marking attendance: ${error.message}`);
      console.error("Error marking attendance:", error);
      setScannedWorker({ error: "❌ Error marking attendance!" });
      setMessage("Error occurred while processing attendance!");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-xl bg-white p-6 rounded-lg shadow-lg text-center">
        <h2 className="text-2xl font-semibold text-gray-800">👤 Face Recognition Attendance</h2>
        
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        
        {/* Loading Progress */}
        {!modelsLoaded && modelLoadingProgress > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${modelLoadingProgress}%` }}
            ></div>
          </div>
        )}

        {/* Webcam and Canvas for Face Detection */}
        {isScanning && (
          <div className="mt-6 flex flex-col items-center relative">
            <ReactWebcam
              ref={webcamRef}
              className="w-full max-w-sm rounded-lg border border-gray-300 shadow-md"
              mirrored={true}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width: 640,
                height: 480,
                facingMode: "user"
              }}
              onUserMedia={handleWebcamReady}
            />
            <canvas 
              ref={canvasRef} 
              className="absolute top-0 left-0 right-0 mx-auto w-full max-w-sm rounded-lg"
            />
          </div>
        )}

        {/* Scanned Worker Details */}
        {scannedWorker && (
          <div className="mt-6 p-4 bg-gray-100 border rounded-lg">
            {scannedWorker.error ? (
              <h3 className="text-red-600 font-semibold">{scannedWorker.error}</h3>
            ) : (
              <>
                <h3 className="text-green-600 font-semibold">✅ Worker Identified</h3>
                <p className="text-gray-700"><strong>Name:</strong> {scannedWorker.name}</p>
                <p className="text-gray-700"><strong>Worker ID:</strong> {scannedWorker.workerId}</p>
                <p className="text-gray-700"><strong>Post:</strong> {scannedWorker.post}</p>
                <p className={`text-lg font-semibold ${scannedWorker.attendance === "Present" ? "text-green-600" : "text-red-600"}`}>
                  <strong>Attendance:</strong> {scannedWorker.attendance}
                </p>
                {scannedWorker.timestamp && (
                  <p className="text-gray-700"><strong>Time:</strong> {new Date(scannedWorker.timestamp).toLocaleTimeString()}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Debug Panel */}
        <div className="mt-6 p-2 border border-gray-200 bg-gray-50 rounded text-left">
          <h3 className="text-sm font-bold mb-1">Debug Information:</h3>
          <div className="text-xs max-h-32 overflow-y-auto">
            {debugInfo.length === 0 ? (
              <p className="text-gray-500 italic">No debug information yet</p>
            ) : (
              debugInfo.map((log, index) => (
                <div key={index} className="mb-1">{log}</div>
              ))
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            ⬅️ Back to Admin Panel
          </button>

          {scannedWorker && (
            <button
              onClick={() => {
                setIsScanning(true);
                setScannedWorker(null);
                setMessage("Face scanning ready. Please look at the camera.");
                addDebugLog("Restarting face scanning");
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              🔄 Scan Another
            </button>
          )}
          
          {!modelsLoaded && (
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
            >
              🔄 Refresh Page
            </button>
          )}
          
          <button
            onClick={() => addDebugLog("Manual check: " + (debugInfo.length > 0 ? "Debug logging working" : "No debug logs yet"))}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition"
          >
            🐛 Test Debug
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaceRecognition;