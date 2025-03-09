import React from "react";
import { Routes, Route } from "react-router-dom"; // ✅ Import Routes and Route
import WorkerQRSystem from "./WorkerQRSystem";
import QRScanner from "./QRScanner";

function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkerQRSystem />} />
      <Route path="/scan" element={<QRScanner />} />
    </Routes>
  );
}

export default App;
