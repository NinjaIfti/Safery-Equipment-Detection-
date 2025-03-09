import React, { useState, useRef, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";  
import { getFirestore, collection, getDocs, query, orderBy, setDoc, doc, deleteDoc } from "firebase/firestore";  
import QRCode from "qrcode"; // Import qrcode library
import { useNavigate } from "react-router-dom"; // ✅ Import useNavigate



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
const storage = getStorage(app);
const db = getFirestore(app);

const WorkerQRSystem = () => {
  const navigate = useNavigate();
  const [worker, setWorker] = useState({ name: "", workerId: "", post: "" });
  const [workers, setWorkers] = useState([]);
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const qrCanvasRef = useRef(null); // Ref for the canvas to draw QR code with a border

  // Fetch workers from Firestore when the component mounts
  useEffect(() => {
    const fetchWorkers = async () => {
      const q = query(collection(db, "workers"), orderBy("workerId"));
      const querySnapshot = await getDocs(q);
      const workersData = querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }));
      setWorkers(workersData);
    };

    fetchWorkers();
  }, []);

  const handleChange = (e) => {
    setWorker({ ...worker, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Generate QR code and add white border, then upload the image
    const qrImageUrl = await generateQRCodeWithBorder(worker.workerId);

    // Upload QR code to Firebase Storage
    const qrStorageRef = ref(storage, `qr_codes/workerId_${worker.workerId}.png`);
    await uploadString(qrStorageRef, qrImageUrl, "data_url");

    // Get the download URL of the uploaded QR code
    const qrDownloadURL = await getDownloadURL(qrStorageRef);

    // Save worker details with the QR code URL to Firestore
    const updatedWorker = { ...worker, qrCodeURL: qrDownloadURL };
    const docId = `worker_${worker.workerId}`;
    await setDoc(doc(db, "workers", docId), updatedWorker);

    // Fetch updated worker list
    const q = query(collection(db, "workers"), orderBy("workerId"));
    const querySnapshot = await getDocs(q);
    const workersData = querySnapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));
    setWorkers(workersData);

    setWorker({ name: "", workerId: "", post: "" });
    setEditingWorkerId(null);
  };
  const handleDelete = async (workerId) => {
    try {
      // Create a reference to the QR image in Firebase Storage using the new naming convention
      const qrStorageRef = ref(storage, `qr_codes/workerId_${workerId}.png`);
  
      // Delete the QR image from Firebase Storage
      await deleteObject(qrStorageRef);
  
      // Delete the worker from Firestore using the workerId as the document ID
      const workerDocRef = doc(db, "workers", `worker_${workerId}`);
      await deleteDoc(workerDocRef);
  
      // Remove the worker from the state
      setWorkers(workers.filter((worker) => worker.workerId !== workerId));
      console.log(`🗑 Worker and QR code deleted with ID: ${workerId}`);
    } catch (error) {
      console.error("❌ Error deleting worker: ", error);
    }
  };
  

  // Function to generate QR code with a white border
  const generateQRCodeWithBorder = (workerId) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const qrCodeSize = 300; // Adjust the size of the QR code

      // Set the canvas size to include the border (40px extra space for border)
      const canvasSize = qrCodeSize + 40;
      canvas.width = canvasSize;
      canvas.height = canvasSize;

      // Draw white background (border area)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // Generate the QR code using the qrcode library
      QRCode.toCanvas(canvas, `worker_${workerId}`, { width: qrCodeSize }, (error) => {
        if (error) {
          reject(error);
        } else {
          // QR code is generated on canvas, now resolve the canvas to data URL
          const dataUrl = canvas.toDataURL("image/png");
          resolve(dataUrl);
        }
      });
    });
  };

  
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center"
      style={{ backgroundImage: "url('/images/bg.jpg')" }}
    >
      <div className="w-full max-w-3xl bg-white bg-opacity-90 p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          👷 Admin - Worker QR Code System
        </h2>
  
        {/* Worker Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mb-6">
          <input
            type="text"
            name="name"
            placeholder="Worker Name"
            value={worker.name}
            onChange={handleChange}
            required
            className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="text"
            name="workerId"
            placeholder="Worker ID"
            value={worker.workerId}
            onChange={handleChange}
            required
            disabled={editingWorkerId !== null}
            className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-200"
          />
          <input
            type="text"
            name="post"
            placeholder="Post"
            value={worker.post}
            onChange={handleChange}
            required
            className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            className={`py-2 px-4 text-white font-semibold rounded-lg transition ${
              editingWorkerId ? "bg-orange-500 hover:bg-orange-600" : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {editingWorkerId ? "✏️ Update Worker" : "➕ Add Worker & Generate QR"}
          </button>
        </form>
  
        {/* Worker List */}
        <h3 className="text-xl font-semibold text-gray-700">📋 Worker List</h3>
        <div className="overflow-x-auto mt-4">
          <table className="w-full min-w-[600px] border-collapse bg-white bg-opacity-90 rounded-lg shadow-lg">
            <thead>
              <tr className="bg-gray-100 text-gray-800 text-sm">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Worker ID</th>
                <th className="p-2 text-left">Post</th>
                <th className="p-2 text-left">QR Code</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.workerId} className="border-t hover:bg-gray-50 text-sm">
                  <td className="p-2">{w.name}</td>
                  <td className="p-2">{w.workerId}</td>
                  <td className="p-2">{w.post}</td>
                  <td className="p-2 whitespace-nowrap">
                    {w.qrCodeURL ? (
                      <a
                        href={w.qrCodeURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        🔍 View QR
                      </a>
                    ) : (
                      <span className="text-gray-500">No QR</span>
                    )}
                  </td>
                  <td className="p-2 flex gap-1">
                    <button
                      onClick={() => {
                        setWorker(w);
                        setEditingWorkerId(w.workerId);
                      }}
                      className="px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 transition"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(w.workerId)}
                      className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
                    >
                      🗑 Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  
        {/* Centered QR Scanner Button */}
        <div className="flex justify-center mt-6">
          <button
            onClick={() => navigate("/scan")}
            className="py-2 px-4 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition"
          >
            📷 Go to QR Scanner
          </button>
        </div>
      </div>
    </div>
  );
  
  };
  
  
  
  
  



export default WorkerQRSystem;
