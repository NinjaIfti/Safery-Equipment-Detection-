import React, { useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SafetyWorkflow = () => {
  // ... existing state declarations ...

  // Single declaration of advanceWorkflow using useCallback
  const advanceWorkflow = useCallback((step) => {
    setWorkflowStep(step);
    
    if (step === "face") {
      setIsScanning(true);
      setMessage("Please look at the camera for face verification.");
    } else if (step === "ppe") {
      setIsPpeScanning(true);
      setMessage("Scanning for required PPE...");
    }
  }, []);

  // Define initQRScanner first as a forward reference
  const initQRScanner = useCallback(() => {
    if (workflowStep !== "qr" || qrScanned) return;
    
    // Clean up previous instances if any
    if (qrScannerRef.current) {
      try {
        const scanner = qrScannerRef.current;
        qrScannerRef.current = null;
        
        setTimeout(() => {
          try {
            scanner.clear();
          } catch (error) {
            console.error("Error clearing previous QR scanner:", error);
          }
        }, 100);
      } catch (error) {
        console.error("Error clearing previous QR scanner:", error);
      }
    }
    
    setTimeout(() => {
      try {
        const qrElement = document.getElementById("qr-reader");
        if (!qrElement) {
          console.error("QR reader element not found");
          return;
        }
        
        qrElement.innerHTML = '';
        
        const qrScanner = new Html5QrcodeScanner(
          "qr-reader",
          { fps: 10, qrbox: 250 },
          false
        );
        
        const onScanSuccess = async (decodedText) => {
          console.log(`QR code detected: ${decodedText}`);
          
          setQrScanned(true);
          setMessage(`QR code detected: ${decodedText}. Verifying...`);
          
          const workerId = decodedText.replace("worker_", "");
          setQrWorkerId(workerId);
          
          const scannerRef = qrScannerRef.current;
          qrScannerRef.current = null;
          
          setTimeout(() => {
            if (scannerRef) {
              try {
                scannerRef.clear();
              } catch (error) {
                console.error("Error clearing scanner:", error);
              }
            }
            
            verifyWorker(workerId);
          }, 100);
        };
        
        const onScanFailure = (error) => {
          // Silently handle scan failures
        };
        
        qrScanner.render(onScanSuccess, onScanFailure);
        qrScannerRef.current = qrScanner;
        
        console.log("QR scanner initialized");
        setMessage("Please scan worker QR code");
      } catch (error) {
        console.error("Error initializing QR scanner:", error);
        setMessage(`Error initializing QR scanner: ${error.message}`);
      }
    }, 100);
  }, [workflowStep, qrScanned]);

  // Define resetWorkflow
  const resetWorkflow = useCallback(() => {
    setIsScanning(false);
    setIsPpeScanning(false);
    
    if (qrScannerRef.current) {
      const scanner = qrScannerRef.current;
      qrScannerRef.current = null;
      
      try {
        setTimeout(() => {
          try {
            scanner.clear();
          } catch (error) {
            console.error("Error clearing QR scanner during reset:", error);
          }
          
          setWorkflowStep("qr");
          setQrScanned(false);
          setQrWorkerId(null);
          setScannedWorker(null);
          setPpeResults(null);
          setPpeCompliance(false);
          setPpeMessage("");
          setMessage("Start by scanning the worker QR code.");
          
          setTimeout(() => {
            initQRScanner();
          }, 300);
        }, 100);
      } catch (error) {
        console.error("Error in resetWorkflow:", error);
      }
    } else {
      setWorkflowStep("qr");
      setQrScanned(false);
      setQrWorkerId(null);
      setScannedWorker(null);
      setPpeResults(null);
      setPpeCompliance(false);
      setPpeMessage("");
      setMessage("Start by scanning the worker QR code.");
      
      setTimeout(() => {
        initQRScanner();
      }, 300);
    }
  }, [initQRScanner]);

  // Define verifyWorker function
  const verifyWorker = async (workerId) => {
    try {
      const workerDocRef = doc(db, "workers", `worker_${workerId}`);
      const workerDoc = await getDoc(workerDocRef);
      
      if (workerDoc.exists()) {
        const workerData = workerDoc.data();
        setMessage(`Worker identified: ${workerData.name}. Proceeding to face verification...`);
        
        setTimeout(() => {
          advanceWorkflow("face");
        }, 1500);
      } else {
        setMessage(`Error: Worker with ID ${workerId} not found in database.`);
        setTimeout(resetWorkflow, 3000);
      }
    } catch (error) {
      console.error("Error verifying worker:", error);
      setMessage(`Error: ${error.message}`);
      setTimeout(resetWorkflow, 3000);
    }
  };

  // ... rest of your existing code (effects, state declarations, and JSX) ...

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 p-6">
      {/* Your component JSX here */}
    </div>
  );
};

export default SafetyWorkflow; 