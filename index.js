require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://loan-backend-steel.vercel.app',
    'https://microloanlink.firebaseapp.com',
    'https://microloanlink.web.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Initialize Stripe Safely
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn("STRIPE_SECRET_KEY is missing. Payment routes will fail.");
}

// MongoDB Connection
const uri = process.env.MONGODB_URI;
let db;
let usersCollection;
let loansCollection;
let applicationsCollection;
let paymentsCollection;

if (uri) {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  // Lazy connection for Serverless
  try {
    db = client.db("loanLinkDB");
    usersCollection = db.collection("users");
    loansCollection = db.collection("loans");
    applicationsCollection = db.collection("applications");
    paymentsCollection = db.collection("payments");
    console.log("MongoDB collections initialized.");
  } catch (error) {
    console.error("Error initializing MongoDB collections:", error);
  }
} else {
  console.error("MONGODB_URI is missing! Database features will not work.");
}

// Verify JWT Middleware
const verifyToken = (req, res, next) => {
  let token = req?.cookies?.token;

  // Fallback to Authorization header (Bearer token)
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  if (!process.env.ACCESS_TOKEN_SECRET) {
    console.error("ACCESS_TOKEN_SECRET missing");
    return res.status(500).send({ message: 'Server Configuration Error' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

// Role Verification Middlewares
const verifyAdmin = async (req, res, next) => {
  const email = req.user.email;
  if (!usersCollection) return res.status(500).send({ message: 'Database not initialized' });
  const user = await usersCollection.findOne({ email });
  const isAdmin = user?.role === 'admin';
  if (!isAdmin) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  next();
};

const verifyManager = async (req, res, next) => {
  const email = req.user.email;
  if (!usersCollection) return res.status(500).send({ message: 'Database not initialized' });
  const user = await usersCollection.findOne({ email });
  const isManager = user?.role === 'manager' || user?.role === 'admin';
  if (!isManager) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  next();
};

// --- ROUTES ---

app.get('/', (req, res) => {
  res.send('LoanLink Server is running');
});

// Auth API
app.post('/jwt', async (req, res) => {
  const user = req.body;
  if (!process.env.ACCESS_TOKEN_SECRET) return res.status(500).send({ message: 'Token Secret missing' });
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  }).send({ success: true, token });
});

app.post('/logout', async (req, res) => {
  res.clearCookie('token', {
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  }).send({ success: true });
});

// User API
app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
  if (!usersCollection) return res.status(500).send({ message: 'Database disconnected' });
  const { search } = req.query;
  let query = {};
  if (search) {
    query = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    };
  }
  const result = await usersCollection.find(query).toArray();
  res.send(result);
});

app.get('/user/role/:email', async (req, res) => {
  if (!usersCollection) return res.status(500).send({ message: 'Database disconnected' });
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  res.send({ role: user?.role, status: user?.status });
});

app.post('/users', async (req, res) => {
  if (!usersCollection) return res.status(500).send({ message: 'Database disconnected' });
  const user = req.body;
  const existingUser = await usersCollection.findOne({ email: user.email });
  if (existingUser) {
    return res.send({ message: 'user already exists', insertedId: null });
  }
  const result = await usersCollection.insertOne({
    ...user,
    role: user.role || 'borrower',
    status: 'active',
    createdAt: new Date()
  });
  res.send(result);
});

app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!usersCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.id;
  const { role, status, reason } = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: {} };
  if (role) updateDoc.$set.role = role;
  if (status) updateDoc.$set.status = status;
  if (reason !== undefined) updateDoc.$set.suspendReason = reason || null;

  const result = await usersCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// Loan API
app.get('/loans', async (req, res) => {
  if (!loansCollection) return res.status(500).send({ message: 'Database disconnected' });
  const { search, category, home } = req.query;
  let query = {};
  if (search) query.title = { $regex: search, $options: 'i' };
  if (category) query.category = category;
  if (home === 'true') query.showOnHome = true;

  const cursor = loansCollection.find(query);
  if (home === 'true') cursor.limit(6);

  const result = await cursor.toArray();
  res.send(result);
});

app.get('/loans/:id', async (req, res) => {
  if (!loansCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.id;
  const result = await loansCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.post('/loans', verifyToken, verifyManager, async (req, res) => {
  if (!loansCollection) return res.status(500).send({ message: 'Database disconnected' });
  const loan = req.body;
  const result = await loansCollection.insertOne({
    ...loan,
    createdAt: new Date()
  });
  res.send(result);
});

app.put('/loans/:id', verifyToken, verifyManager, async (req, res) => {
  if (!loansCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const options = { upsert: true };
  const updatedLoan = req.body;
  delete updatedLoan._id;
  const updateDoc = { $set: updatedLoan };
  const result = await loansCollection.updateOne(filter, updateDoc, options);
  res.send(result);
});

app.delete('/loans/:id', verifyToken, verifyManager, async (req, res) => {
  if (!loansCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.id;
  const result = await loansCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// Application API
app.get('/applications', verifyToken, async (req, res) => {
  if (!applicationsCollection) return res.status(500).send({ message: 'Database disconnected' });
  const email = req.user.email;
  const role = req.query.role;
  const status = req.query.status;

  let query = {};
  if (role === 'borrower') query.email = email;
  if (status) query.status = status;

  const result = await applicationsCollection.find(query).toArray();
  res.send(result);
});

app.post('/applications', verifyToken, async (req, res) => {
  if (!applicationsCollection) return res.status(500).send({ message: 'Database disconnected' });
  const application = req.body;
  const result = await applicationsCollection.insertOne({
    ...application,
    status: 'pending',
    feeStatus: 'unpaid',
    appliedAt: new Date()
  });
  res.send(result);
});

app.patch('/applications/status/:id', verifyToken, verifyManager, async (req, res) => {
  if (!applicationsCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.id;
  const { status } = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      status,
      updatedAt: new Date(),
      ...(status === 'approved' && { approvedAt: new Date() })
    },
  };
  const result = await applicationsCollection.updateOne(filter, updateDoc);
  res.send(result);
});

app.patch('/applications/stage/:id', verifyToken, verifyManager, async (req, res) => {
  if (!applicationsCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.id;
  const { stage } = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      stage,
      updatedAt: new Date()
    },
  };
  const result = await applicationsCollection.updateOne(filter, updateDoc);
  res.send(result);
});

app.delete('/applications/:id', verifyToken, async (req, res) => {
  if (!applicationsCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.id;
  const query = { _id: new ObjectId(id), status: 'pending' };
  const result = await applicationsCollection.deleteOne(query);
  res.send(result);
});

// Payment API
app.post('/create-payment-intent', verifyToken, async (req, res) => {
  if (!stripe) return res.status(500).send({ message: "Stripe is not configured" });
  const { amount } = req.body;
  const amountInCent = parseInt(amount * 100);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCent,
    currency: 'usd',
    payment_method_types: ['card']
  });
  res.send({ clientSecret: paymentIntent.client_secret });
});

app.post('/payments', verifyToken, async (req, res) => {
  if (!paymentsCollection) return res.status(500).send({ message: 'Database disconnected' });
  const payment = req.body;
  const result = await paymentsCollection.insertOne(payment);

  const query = { _id: new ObjectId(payment.applicationId) };
  const updateDoc = { $set: { feeStatus: 'paid' } };
  await applicationsCollection.updateOne(query, updateDoc);

  res.send(result);
});

app.get('/payments/:applicationId', verifyToken, async (req, res) => {
  if (!paymentsCollection) return res.status(500).send({ message: 'Database disconnected' });
  const id = req.params.applicationId;
  const result = await paymentsCollection.findOne({ applicationId: id });
  res.send(result);
});

app.listen(port, () => {
  console.log(`LoanLink is running on port: ${port}`);
});

module.exports = app;
