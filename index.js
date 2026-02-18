require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

// MongoDB connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Verify JWT Middleware
const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    // await client.connect();
    const db = client.db("loanLinkDB");
    const usersCollection = db.collection("users");
    const loansCollection = db.collection("loans");
    const applicationsCollection = db.collection("applications");
    const paymentsCollection = db.collection("payments");

    // --- AUTH API ---
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: true });
    });

    app.post('/logout', async (req, res) => {
      res.clearCookie('token', {
        maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: true });
    });

    // --- VERIFY MIDDLEWARES ---
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    const verifyManager = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isManager = user?.role === 'manager' || user?.role === 'admin';
      if (!isManager) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    // --- USER API ---
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
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
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role, status: user?.status });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
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
      const id = req.params.id;
      const { role, status, reason } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role,
          status,
          suspendReason: reason || null
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // --- LOAN API ---
    app.get('/loans', async (req, res) => {
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
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loansCollection.findOne(query);
      res.send(result);
    });

    app.post('/loans', verifyToken, verifyManager, async (req, res) => {
      const loan = req.body;
      const result = await loansCollection.insertOne({
        ...loan,
        createdAt: new Date()
      });
      res.send(result);
    });

    app.put('/loans/:id', verifyToken, verifyManager, async (req, res) => {
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
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loansCollection.deleteOne(query);
      res.send(result);
    });

    // --- APPLICATION API ---
    app.get('/applications', verifyToken, async (req, res) => {
      const email = req.user.email;
      const role = req.query.role;
      const status = req.query.status;

      let query = {};
      if (role === 'borrower') query.borrowerEmail = email;
      if (status) query.status = status;

      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/applications', verifyToken, async (req, res) => {
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
      const id = req.params.id;
      const query = { _id: new ObjectId(id), status: 'pending' };
      const result = await applicationsCollection.deleteOne(query);
      res.send(result);
    });

    // --- PAYMENT API (Stripe) ---
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
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
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);

      // Update application fee status
      const query = { _id: new ObjectId(payment.applicationId) };
      const updateDoc = { $set: { feeStatus: 'paid' } };
      await applicationsCollection.updateOne(query, updateDoc);

      res.send(result);
    });

    app.get('/payments/:applicationId', verifyToken, async (req, res) => {
      const id = req.params.applicationId;
      const result = await paymentsCollection.findOne({ applicationId: id });
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB & Routes ready!");

  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('LoanLink Server is running');
});

app.listen(port, () => {
  console.log(`LoanLink is running on port: ${port}`);
});

module.exports = app;
