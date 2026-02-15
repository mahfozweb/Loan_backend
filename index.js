const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 4000;
// middleware///

app.use(cors());
app.use(express.json());

// v5i8kLOLOd2rwu0L
// KrishiDBUser

const uri =
  "mongodb+srv://KrishiDBUser:v5i8kLOLOd2rwu0L@cluster0.sgnnmzs.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Connect the client to the server	(optional starting in v4.7)
// await client.connect();
const cropsDB = client.db("cropsDB");
const cropsCollection = cropsDB.collection("crops");
const usersCollection = cropsDB.collection("users");
const interestCollection = cropsDB.collection("interest");
const blogsCollection = cropsDB.collection("blogs");
const featureCollection = cropsDB.collection("featureCrops");
// crops api Get
app.get("/crops", async (req, res) => {
  const result = await cropsCollection.find().toArray();
  res.send(result);
  // .sort({ postedAt: -1 }) .limit(6)
});

// latest crops api
app.get("/latest-crops", async (req, res) => {
  const data = await cropsCollection
    .find()
    .sort({ postedAt: -1 }) // sort descending
    .limit(1)
    .toArray();

  console.log(data);
  res.send(data);
});

// search api
app.get("/search", async (req, res) => {
  const search_text = req.query.search;
  const result = await cropsCollection
    .find({ name: { $regex: search_text, $options: "i" } })
    .toArray();
  res.send(result);
});

// crops api post
app.post("/crops", async (req, res) => {
  const newCrops = req.body;
  const result = await cropsCollection.insertOne(newCrops);
  res.send(result);
  console.log(newCrops);
});

// crops details page
app.get("/crops/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await cropsCollection.findOne(query);
  res.send(result);
  console.log("need users with id", id);
});
// my post data get
app.get("/mypost", async (req, res) => {
  const email = req.query.email;
  let query = {};

  if (email) {
    // query.owner.ownerEmail = email;
    query = { "owner.ownerEmail": email };
  }
  console.log(query);

  const result = await cropsCollection.find(query).toArray();
  res.send(result);
});
// interest api post

app.post("/interest", async (req, res) => {
  const newInterest = req.body;
  const result = await interestCollection.insertOne(newInterest);
  res.send(result);
  console.log(newInterest);
});
// interest api get
app.get("/interest/:cropId", async (req, res) => {
  const cropId = req.params.cropId;
  const result = await interestCollection.find({ cropId: cropId }).toArray();
  res.send(result);
  // .sort({ postedAt: -1 }) .limit(6)
});
// to see my interest page
app.get("/myInterest/:email", async (req, res) => {
  const email = req.params.email;
  const data = await interestCollection.find({ email }).toArray();
  res.send(data);
});

// edit crop page
app.get("/edit-crop/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await cropsCollection.findOne(query);
  res.send(result);
  console.log("need users with id", id);
});

// users api post
app.post("/users", async (req, res) => {
  const newUsers = req.body;
  const result = await usersCollection.insertOne(newUsers);
  res.send(result);
  console.log(newUsers);
});

// update crop
app.put("/update/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    const objectId = new ObjectId(id);

    const filter = { _id: objectId };
    const update = { $set: data };

    const result = await cropsCollection.updateOne(filter, update);
    res.send(result);
  } catch (error) {
    console.error("error fixed data:", error);
    res.status(500).send({ error: "see update error" });
  }
});

// delete
app.delete("/delete/:id", async (req, res) => {
  const id = req.params.id;
  const result = await cropsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// status update

app.put("/interest/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { status: status },
    };

    const result = await interestCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    console.error(" interest status:", error);
    res.status(500).send({ error: " interest status" });
  }
});

// blogs
app.get("/blogs", async (req, res) => {
  const result = await blogsCollection.find().toArray();

  res.send(result);
});

// feature crops///
app.get("/feature", async (req, res) => {
  const result = await featureCollection.find().toArray();

  res.send(result);
});

app.listen(port, () => {
  console.log(`krishi server is running on the port ${port}`);
});
