require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 4000;

// middleware
app.use(cors());
app.use(express.json());

// MongoDB connection URI
const uri = process.env.MONGODB_URI;

let client;
if (uri) {
  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });
}

async function run() {
  try {
    if (!client) {
      console.warn("MongoDB Client not initialized! Check your MONGODB_URI environment variable.");
      return;
    }
    // Connect the client to the server
    await client.connect();

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}
run().catch(console.dir);

// Root Route
app.get("/", (req, res) => {
  res.send("Loan Backend Server is running!");
});

// Sample API Route
app.get("/api", (req, res) => {
  res.json({
    message: "Loan Backend API is working!",
    database: uri ? "Connected/Attempting" : "URI Missing in Env"
  });
});

// Export for Vercel
module.exports = app;

// Listen only if running on local
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
