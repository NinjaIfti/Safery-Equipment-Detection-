import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom"; // ✅ Import BrowserRouter
import App from "./app"; // ✅ Ensure App.js is structured correctly
import './styles.css';


console.log("✅ React is Running!"); // Debugging check

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter> {/* ✅ Wrap the entire App in BrowserRouter */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
