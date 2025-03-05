import React from "react";
import ReactDOM from "react-dom/client";
import WorkerQRSystem from "./WorkerQRSystem"; // Ensure the correct path

console.log("✅ React is Running!"); // Debugging check

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <WorkerQRSystem />
  </React.StrictMode>
);
