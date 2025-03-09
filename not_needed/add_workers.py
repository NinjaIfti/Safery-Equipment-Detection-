import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
cred = credentials.Certificate("serviceAccountKey.json")  
firebase_admin.initialize_app(cred)
db = firestore.client()

# List of workers to add
workers = [
    {
        "worker_id": "worker_001",
        "name": "John Doe",
        "post": "Electrician",
        
    },
    {
        "worker_id": "worker_002",
        "name": "Jane Smith",
        "post": "Supervisor",
        
    }
]

# Insert data into Firestore
for worker in workers:
    db.collection("workers").document(worker["worker_id"]).set(worker)
    print(f"✅ Added Worker: {worker['name']} ({worker['worker_id']})")

print("🎯 All workers added successfully!")
