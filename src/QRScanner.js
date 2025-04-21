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
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [showAttendanceTable, setShowAttendanceTable] = useState(false);
  
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  // Load face-api models
  useEffect(() => {
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
          setModelLoadingProgress(33);
          setMessage("Loading facial recognition models (1/3)...");
          console.log("✅ SSD Mobilenet model loaded");
        } catch (error) {
          console.error("Error loading SSD Mobilenet model:", error);
          setMessage(`Error loading SSD Mobilenet model. Check that ${MODEL_URL}/ssd_mobilenetv1_model-* files exist.`);
          return;
        }
        
        try {
          await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
          setModelLoadingProgress(66);
          setMessage("Loading facial recognition models (2/3)...");
          console.log("✅ Face Landmark model loaded");
        } catch (error) {
          console.error("Error loading Face Landmark model:", error);
          setMessage(`Error loading Face Landmark model. Check that ${MODEL_URL}/face_landmark_68_model-* files exist.`);
          return;
        }
        
        try {
          await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
          setModelLoadingProgress(100);
          setMessage("Loading facial recognition models (3/3)...");
          console.log("✅ Face Recognition model loaded");
        } catch (error) {
          console.error("Error loading Face Recognition model:", error);
          setMessage(`Error loading Face Recognition model. Check that ${MODEL_URL}/face_recognition_model-* files exist.`);
          return;
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
  }, []);

  // Handle webcam ready state
  const handleWebcamReady = () => {
    console.log("Webcam is ready");
    setWebcamReady(true);
    setMessage(prevMessage => prevMessage === "Loading worker face data..." ? 
      "Face scanning ready. Please look at the camera." : prevMessage);
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
    if (!isScanning || !webcamRef.current || !canvasRef.current || !faceMatcher || !webcamReady) return;

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
  }, [isScanning, faceMatcher, webcamReady]);

  // Start face detection when models and data are loaded
  useEffect(() => {
    if (modelsLoaded && faceMatcher && isScanning && webcamReady) {
      detectFaces();
      return () => {};
    }
  }, [modelsLoaded, faceMatcher, isScanning, detectFaces, webcamReady]);

  // Mark attendance for matched worker
  const markAttendance = async (workerId) => {
    try {
      setMessage("Face matched! Processing...");
      setIsScanning(false);
      
      const workerDocRef = doc(db, "workers", workerId);
      const workerDoc = await getDoc(workerDocRef);

      if (workerDoc.exists()) {
        const workerData = workerDoc.data();

        // Update attendance status with timestamp
        const timestamp = new Date().toISOString();
        await updateDoc(workerDocRef, { 
          attendance: "Present",
          lastAttendanceTime: timestamp
        });

        // Set scanned worker details
        const updatedWorkerData = { 
          ...workerData, 
          id: workerId,
          attendance: "Present",
          timestamp: timestamp
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
        
        setMessage(`Face recognized: ${workerData.name}`);
        console.log(`✅ Attendance marked for: ${workerData.name}`);
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
      <div className="w-full max-w-2xl bg-white p-6 rounded-lg shadow-lg text-center">
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
              </div>
            </div>
          </div>
        )}

        {scannedWorker && scannedWorker.error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="text-red-600 font-semibold">{scannedWorker.error}</h3>
          </div>
        )}

        {/* Attendance Records Table */}
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

          {scannedWorker && (
            <button
              onClick={() => {
                setIsScanning(true);
                setScannedWorker(null);
                setMessage("Face scanning ready. Please look at the camera.");
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
          
          {attendanceRecords.length > 0 && (
            <button
              onClick={() => setShowAttendanceTable(!showAttendanceTable)}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
            >
              {showAttendanceTable ? "🔽 Hide Attendance" : "🔼 Show Attendance"} 
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FaceRecognition;