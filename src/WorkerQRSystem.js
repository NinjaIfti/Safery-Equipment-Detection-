
import React, { useState, useRef, useEffect } from "react";
import { storage, db } from './firebase';  
import QRCode from "qrcode"; 
import { useNavigate } from "react-router-dom";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";  
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  setDoc, 
  doc, 
  deleteDoc, 
  updateDoc 
} from "firebase/firestore";


const WorkerQRSystemWithAttendance = () => {
  const navigate = useNavigate();
  const [worker, setWorker] = useState({ name: "", workerId: "", post: "" });
  const [workers, setWorkers] = useState([]);
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [updateFaceOnly, setUpdateFaceOnly] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const fileInputRef = useRef(null);
  const qrCanvasRef = useRef(null);

  // Fetch workers from Firestore when the component mounts
  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const q = query(collection(db, "workers"), orderBy("workerId"));
      const querySnapshot = await getDocs(q);
      const workersData = querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }));
      setWorkers(workersData);
    } catch (error) {
      console.error("Error fetching workers: ", error);
    }
  };

  const handleChange = (e) => {
    setWorker({ ...worker, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      
      // Create preview of the selected image
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearForm = () => {
    setWorker({ name: "", workerId: "", post: "" });
    setImageFile(null);
    setImagePreview(null);
    setEditingWorkerId(null);
    setUpdateFaceOnly(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const generateQRCodeWithBorder = (workerId) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
  
      const qrCodeSize = 300;
      const canvasSize = qrCodeSize + 40;
      canvas.width = canvasSize;
      canvas.height = canvasSize;
  
      // Draw white background (border area)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasSize, canvasSize);
  
      // Generate the QR code using the qrcode library
      QRCode.toCanvas(
        canvas, 
        `worker_${workerId}`, 
        { 
          width: qrCodeSize,
          margin: 1,
          color: {
            dark: "#000000",
            light: "#ffffff"
          }
        }, 
        (error) => {
          if (error) {
            reject(error);
          } else {
            // Convert canvas to blob
            canvas.toBlob((blob) => {
              resolve(blob);
            }, "image/png");
          }
        }
      );
    });
  };

  const uploadFaceImage = async (workerId) => {
    if (!imageFile) return null;
    
    const faceStorageRef = ref(storage, `worker-faces/workerId_${workerId}.jpg`);
    await uploadBytes(faceStorageRef, imageFile);
    return await getDownloadURL(faceStorageRef);
  };

  const handleUpdateFaceOnly = async (workerId) => {
    if (!imageFile) {
      window.alert("Please select a face image to upload");
      return;
    }

    setIsUploading(true);
    try {
      // Find the worker to update
      const workerToUpdate = workers.find(w => w.workerId === workerId);
      if (!workerToUpdate) {
        throw new Error("Worker not found");
      }

      // Upload the new face image
      const faceDownloadURL = await uploadFaceImage(workerId);
      
      // Update just the face image URL in Firestore
      const docId = `worker_${workerId}`;
      await setDoc(doc(db, "workers", docId), {
        ...workerToUpdate,
        faceImageURL: faceDownloadURL
      });

      // Refresh worker list
      await fetchWorkers();
      clearForm();
      window.alert(`Face image for worker ${workerId} updated successfully`);
    } catch (error) {
      console.error("Error updating face image: ", error);
      window.alert(`Error updating face image: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUpdateFaceOnly(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      let qrDownloadURL = "";
      let faceDownloadURL = "";

      // Check if we're updating an existing worker
      const existingWorker = workers.find(w => w.workerId === worker.workerId);
      
      // Generate and upload QR code
      const qrBlob = await generateQRCodeWithBorder(worker.workerId);
      const qrStorageRef = ref(storage, `qr_codes/workerId_${worker.workerId}.png`);
      await uploadBytes(qrStorageRef, qrBlob);
      qrDownloadURL = await getDownloadURL(qrStorageRef);

      // Upload face image if provided
      if (imageFile) {
        faceDownloadURL = await uploadFaceImage(worker.workerId);
      } else if (existingWorker && existingWorker.faceImageURL) {
        // Keep existing face image URL if no new image is provided
        faceDownloadURL = existingWorker.faceImageURL;
      }

      // Save worker details with the QR code URL and face image URL to Firestore
      const updatedWorker = { 
        ...worker, 
        qrCodeURL: qrDownloadURL, 
        faceImageURL: faceDownloadURL,
        updatedAt: new Date().toISOString()
      };
      
      const docId = `worker_${worker.workerId}`;
      await setDoc(doc(db, "workers", docId), updatedWorker);

      // Refresh worker list
      await fetchWorkers();
      clearForm();
      
      window.alert(existingWorker ? "Worker updated successfully" : "Worker added successfully");
    } catch (error) {
      console.error("Error saving worker: ", error);
      window.alert(`Error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (workerId) => {
    // Using window.confirm instead of global confirm
    if (!window.confirm(`Are you sure you want to delete worker with ID: ${workerId}?`)) {
      return;
    }

    setIsUploading(true);
    try {
      // Delete QR code from storage (won't fail if it doesn't exist)
      try {
        const qrStorageRef = ref(storage, `qr_codes/workerId_${workerId}.png`);
        await deleteObject(qrStorageRef);
      } catch (err) {
        console.log("QR image doesn't exist or already deleted:", err);
      }

      // Delete face image from storage (won't fail if it doesn't exist)
      try {
        const faceStorageRef = ref(storage, `worker-faces/workerId_${workerId}.jpg`);
        await deleteObject(faceStorageRef);
      } catch (err) {
        console.log("Face image doesn't exist or already deleted:", err);
      }

      // Delete worker from Firestore
      const workerDocRef = doc(db, "workers", `worker_${workerId}`);
      await deleteDoc(workerDocRef);

      // Update local state
      setWorkers(workers.filter((worker) => worker.workerId !== workerId));
      window.alert(`Worker with ID: ${workerId} deleted successfully`);
    } catch (error) {
      console.error("Error deleting worker: ", error);
      window.alert(`Error deleting worker: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditWorker = (w) => {
    setWorker({
      name: w.name,
      workerId: w.workerId,
      post: w.post
    });
    setEditingWorkerId(w.workerId);
    setImagePreview(w.faceImageURL || null);
  };

  const handleUpdateFaceClick = (w) => {
    setWorker({
      name: w.name,
      workerId: w.workerId,
      post: w.post
    });
    setEditingWorkerId(w.workerId);
    setUpdateFaceOnly(true);
    setImagePreview(w.faceImageURL || null);
    // Scroll to the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Format timestamp for display
  const formatTime = (timestamp) => {
    if (!timestamp) return "-";
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
    } catch (e) {
      return "Invalid date";
    }
  };

  // Get today's date for filtering attendance records
  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD format
  };

  // Check if attendance date is from today
  const isAttendanceFromToday = (timestamp) => {
    if (!timestamp) return false;
    
    try {
      const today = getTodayDateString();
      const attendanceDate = new Date(timestamp).toISOString().split('T')[0];
      return today === attendanceDate;
    } catch (e) {
      return false;
    }
  };

  // Reset all attendance records
  const resetAllAttendance = async () => {
    if (!window.confirm("Are you sure you want to reset attendance for all workers?")) {
      return;
    }
    
    setIsUploading(true);
    try {
      // Update each worker document to reset attendance
      for (const worker of workers) {
        const workerDocRef = doc(db, "workers", worker.id);
        await updateDoc(workerDocRef, { 
          attendance: "Absent",
          lastAttendanceTime: null
        });
      }
      
      // Refresh worker list
      await fetchWorkers();
      window.alert("All attendance records have been reset successfully");
    } catch (error) {
      console.error("Error resetting attendance:", error);
      window.alert(`Error resetting attendance: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center py-8" style={{ backgroundImage: "url('/images/bg.jpg')" }}>
      <div className="w-full max-w-4xl bg-white bg-opacity-90 p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          👷 Admin - Worker Attendance System
        </h2>

        {/* Attendance Report Button */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowAttendance(!showAttendance)}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-1"
          >
            {showAttendance ? "🔽 Hide Attendance" : "🔼 Show Attendance"} 
          </button>
        </div>

        {/* Attendance Report Section */}
        {showAttendance && (
          <div className="mb-6 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">📊 Today's Attendance Report</h3>
              <button
                onClick={resetAllAttendance}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition"
              >
                Reset All Attendance
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white rounded-lg">
                <thead>
                  <tr className="bg-gray-100 text-gray-800">
                    <th className="px-4 py-2 text-left">Worker</th>
                    <th className="px-4 py-2 text-left">ID</th>
                    <th className="px-4 py-2 text-left">Post</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => {
                    const isPresent = w.attendance === "Present" && isAttendanceFromToday(w.lastAttendanceTime);
                    return (
                      <tr key={w.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2 flex items-center">
                          {w.faceImageURL && (
                            <img 
                              src={w.faceImageURL} 
                              alt={w.name} 
                              className="h-8 w-8 object-cover rounded-full mr-2"
                            />
                          )}
                          {w.name}
                        </td>
                        <td className="px-4 py-2">{w.workerId}</td>
                        <td className="px-4 py-2">{w.post}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            isPresent 
                              ? "bg-green-100 text-green-800" 
                              : "bg-red-100 text-red-800"
                          }`}>
                            {isPresent ? "Present" : "Absent"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {isPresent ? formatTime(w.lastAttendanceTime) : "-"}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {isPresent ? (w.attendanceMethod || "Face Recognition") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {workers.length === 0 && (
                    <tr className="border-t">
                      <td colSpan="6" className="p-4 text-center text-gray-500">
                        No workers found. Add workers to view attendance.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Attendance Summary */}
            <div className="mt-4 flex gap-6 justify-center">
              <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-center">
                <span className="text-lg font-semibold text-green-700">
                  {workers.filter(w => w.attendance === "Present" && isAttendanceFromToday(w.lastAttendanceTime)).length}
                </span>
                <p className="text-sm text-green-600">Present</p>
              </div>
              <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-center">
                <span className="text-lg font-semibold text-red-700">
                  {workers.filter(w => w.attendance !== "Present" || !isAttendanceFromToday(w.lastAttendanceTime)).length}
                </span>
                <p className="text-sm text-red-600">Absent</p>
              </div>
              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-center">
                <span className="text-lg font-semibold text-blue-700">
                  {workers.length}
                </span>
                <p className="text-sm text-blue-600">Total Workers</p>
              </div>
            </div>
          </div>
        )}

        {/* Worker Form */}
        <form onSubmit={updateFaceOnly ? () => handleUpdateFaceOnly(editingWorkerId) : handleSubmit} className="flex flex-col gap-4 mb-6">
          {!updateFaceOnly && (
            <>
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
            </>
          )}
          
          {/* File Input for Face Image Upload with Preview */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="text-md font-semibold mb-2">
              {updateFaceOnly ? "Update Worker Face Image" : "Upload Worker Face Image"}
            </h3>
            
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="p-2 w-full border rounded-lg"
                />
              </div>
              
              {/* Image Preview */}
              {imagePreview && (
                <div className="flex-shrink-0">
                  <div className="h-24 w-24 relative border rounded overflow-hidden">
                    <img 
                      src={imagePreview} 
                      alt="Face Preview" 
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setImageFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-between">
            <button
              type="submit"
              disabled={isUploading}
              className={`py-2 px-4 text-white font-semibold rounded-lg transition ${
                isUploading ? "bg-gray-400" : 
                updateFaceOnly ? "bg-blue-500 hover:bg-blue-600" :
                editingWorkerId ? "bg-orange-500 hover:bg-orange-600" : 
                "bg-green-500 hover:bg-green-600"
              }`}
            >
              {isUploading ? "Processing..." : 
               updateFaceOnly ? "📸 Update Face Image Only" :
               editingWorkerId ? "✏️ Update Worker" : 
               "➕ Add Worker & Generate QR"}
            </button>
            
            <button
              type="button"
              onClick={clearForm}
              className="py-2 px-4 bg-gray-400 text-white font-semibold rounded-lg hover:bg-gray-500 transition"
            >
              ❌ Cancel
            </button>
          </div>
        </form>

        {/* Worker List */}
        <h3 className="text-xl font-semibold text-gray-700 mb-2">📋 Worker List</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse bg-white bg-opacity-90 rounded-lg shadow-lg">
            <thead>
              <tr className="bg-gray-100 text-gray-800 text-sm">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Worker ID</th>
                <th className="p-2 text-left">Post</th>
                <th className="p-2 text-left">Face Image</th>
                <th className="p-2 text-left">QR Code</th>
                <th className="p-2 text-left">Attendance</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const isPresent = w.attendance === "Present" && isAttendanceFromToday(w.lastAttendanceTime);
                return (
                  <tr key={w.workerId} className="border-t hover:bg-gray-50 text-sm">
                    <td className="p-2">{w.name}</td>
                    <td className="p-2">{w.workerId}</td>
                    <td className="p-2">{w.post}</td>
                    <td className="p-2 whitespace-nowrap">
                      {w.faceImageURL ? (
                        <div className="flex items-center gap-2">
                          <img 
                            src={w.faceImageURL} 
                            alt="Face" 
                            className="h-8 w-8 object-cover rounded-full border"
                          />
                          <a
                            href={w.faceImageURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-xs"
                          >
                            View
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">No Image</span>
                      )}
                    </td>
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
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        isPresent 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {isPresent ? "Present" : "Absent"}
                      </span>
                      {isPresent && w.lastAttendanceTime && (
                        <div className="text-xs text-gray-500 mt-1">
                          {formatTime(w.lastAttendanceTime)}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditWorker(w)}
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
                        </div>
                        <button
                          onClick={() => handleUpdateFaceClick(w)}
                          className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition"
                        >
                          📸 Update Face
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {workers.length === 0 && (
                <tr className="border-t">
                  <td colSpan="7" className="p-4 text-center text-gray-500">
                    No workers found. Add a worker to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Buttons for Navigation */}
        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => navigate("/scan")}
            className="py-2 px-4 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition"
          >
             👤 Face Recognition
          </button>
        
        </div>
      </div>
    </div>
  );
};

export default WorkerQRSystemWithAttendance;