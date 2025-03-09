import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import ReactWebcam from "react-webcam";
import jsQR from "jsqr";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC2gGtKPH8wXRQMT_P924WgdnyZtsLxmFk",
  authDomain: "safety-equipment-1d08b.firebaseapp.com",
  projectId: "safety-equipment-1d08b",
  storageBucket: "safety-equipment-1d08b.firebasestorage.app",
  messagingSenderId: "567020346429",
  appId: "1:567020346429:web:4eb706de550698d97b5e54",
  measurementId: "G-5RZPDBJT78",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const QRScanner = () => {
  const [scannedWorker, setScannedWorker] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  const handleVideoReady = () => {
    setIsVideoReady(true);
  };

  const scanQRCode = useCallback(async () => {
    if (!isVideoReady || !webcamRef.current || !canvasRef.current) return;

    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code) {
      const workerId = code.data;
      fetchWorkerDetails(workerId);
    } else {
      requestAnimationFrame(scanQRCode);
    }
  }, [isVideoReady]);

  const fetchWorkerDetails = async (workerId) => {
    try {
      let cleanedWorkerId = workerId.replace("workerId_", "").trim();

      if (cleanedWorkerId.startsWith("worker_")) {
        cleanedWorkerId = cleanedWorkerId.replace("worker_", "");
      }

      const workerDocRef = doc(db, "workers", `worker_${cleanedWorkerId}`);
      const workerDoc = await getDoc(workerDocRef);

      if (workerDoc.exists()) {
        setScannedWorker(workerDoc.data());
      } else {
        setScannedWorker({ error: "❌ Worker Not Found!" });
      }
    } catch (error) {
      setScannedWorker({ error: "❌ Error fetching worker details!" });
    }
  };

  useEffect(() => {
    if (isVideoReady) {
      const interval = setInterval(scanQRCode, 1000);
      return () => clearInterval(interval);
    }
  }, [isVideoReady, scanQRCode]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-xl bg-white p-6 rounded-lg shadow-lg text-center">
        <h2 className="text-2xl font-semibold text-gray-800 flex items-center justify-center gap-2">
          📷 QR Code Scanner
        </h2>

        {/* Webcam */}
        <div className="mt-6 flex flex-col items-center">
          <ReactWebcam
            ref={webcamRef}
            className="w-full max-w-sm rounded-lg border border-gray-300 shadow-md"
            onUserMedia={handleVideoReady}
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Scanned Worker Details */}
        {scannedWorker && (
          <div className="mt-6 p-4 bg-gray-100 border rounded-lg">
            {scannedWorker.error ? (
              <h3 className="text-red-600 font-semibold">{scannedWorker.error}</h3>
            ) : (
              <>
                <h3 className="text-green-600 font-semibold">✅ Worker Found</h3>
                <p className="text-gray-700">
                  <strong>Name:</strong> {scannedWorker.name}
                </p>
                <p className="text-gray-700">
                  <strong>Worker ID:</strong> {scannedWorker.workerId}
                </p>
                <p className="text-gray-700">
                  <strong>Post:</strong> {scannedWorker.post}
                </p>
              </>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            ⬅️ Back to Admin Panel
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
