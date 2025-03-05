import React, { useState, useRef, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";  
import { getFirestore, collection, getDocs, query, orderBy, setDoc, doc, deleteDoc } from "firebase/firestore";  
import QRCode from "qrcode"; // Import qrcode library

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
      style={{
        padding: "20px",
        maxWidth: "800px",
        margin: "auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h2>👷 Admin - Worker QR Code System</h2>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <input
          type="text"
          name="name"
          placeholder="Worker Name"
          value={worker.name}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="workerId"
          placeholder="Worker ID"
          value={worker.workerId}
          onChange={handleChange}
          required
          disabled={editingWorkerId !== null} // Disable editing the workerId
        />
        <input
          type="text"
          name="post"
          placeholder="Post"
          value={worker.post}
          onChange={handleChange}
          required
        />
        <button
          type="submit"
          style={{
            padding: "10px",
            background: editingWorkerId ? "orange" : "green",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {editingWorkerId ? "✏️ Update Worker" : "➕ Add Worker & Generate QR"}
        </button>
      </form>

      <h3>📋 Worker List</h3>
      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: "20px" }}
      >
        <thead>
          <tr style={{ background: "#f4f4f4", textAlign: "left" }}>
            <th>Name</th>
            <th>Worker ID</th>
            <th>Post</th>
            <th>QR Code</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((w) => (
            <tr key={w.workerId}>
              <td>{w.name}</td>
              <td>{w.workerId}</td>
              <td>{w.post}</td>
              <td>
                {w.qrCodeURL ? (
                  <a
                    href={w.qrCodeURL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🔍 View QR
                  </a>
                ) : (
                  "No QR"
                )}
              </td>
              <td>
                <button
                  onClick={() => {
                    setWorker(w);
                    setEditingWorkerId(w.workerId);
                  }}
                  style={{
                    marginRight: "10px",
                    background: "orange",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleDelete(w.workerId)}
                  style={{
                    background: "red",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  🗑 Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WorkerQRSystem;
