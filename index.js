const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// MongoDB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ktqos2d.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // collections
    const usersCollection = client.db("melodyDB").collection("users");
    const classesCollection = client.db("melodyDB").collection("classes");
    const paymentCollection = client.db("melodyDB").collection("payments");
    const selectedClassesCollection = client
      .db("melodyDB")
      .collection("selectedClasses");

    // jwt
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        res.status(403).send({ error: true, message: "forbidden Access" });
      }
      next();
    };
    // verify Instructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "instructor") {
        res.status(403).send({ error: true, message: "forbidden Access" });
      }
      next();
    };
    // verify student
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "student") {
        res.status(403).send({ error: true, message: "forbidden Access" });
      }
      next();
    };

    // users functionalities
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // instructors
    app.get("/users/instructors", async (req, res) => {
      const query = { role: "instructor" };
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // check and create new user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // change the users role
    app.patch(
      "/users/change-role",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.query.email;
        const role = req.query.role;
        const filter = { email: email };
        const updateDoc = {
          $set: {
            role: role,
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // find out is the user a admin or not
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send([]);
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role === "admin") {
        const result = { admin: user?.role === "admin" };
        res.send(result);
      } else if (user?.role === "instructor") {
        const result = { instructor: user?.role === "instructor" };
        res.send(result);
      } else {
        const result = { student: user?.role === "student" };
        res.send(result);
      }
    });

    // get all the classes from collection

    app.get("/classes", verifyToken, verifyAdmin, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    // get only approved classes
    app.get("/approved-classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classesCollection
        .find(query, { sort: { totalEnrolled: -1 } })
        .toArray();
      res.send(result);
    });

    // find out specific instructors classes
    app.get(
      "/classes/:email",
      verifyToken,
      verifyInstructor,
      async (req, res) => {
        const email = req.params.email;
        const query = { instructorEmail: email };
        const result = await classesCollection.find(query).toArray();

        res.send(result);
      }
    );

    // add a new class by an instructor
    app.post("/classes", verifyToken, verifyInstructor, async (req, res) => {
      const classData = req.body;
      const result = await classesCollection.insertOne(classData);
      res.send(result);
    });

    // adding a status to the class data
    app.patch("/classes/status", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.query.id;
      const status = req.query.status;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // adding a feedback to the class data
    app.patch(
      "/classes/feedback/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const feedback = req.body.feedback;
        console.log(feedback);
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            feedback: feedback,
          },
        };
        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // update classes data by instructor
    // TODO: have to uncomment this
    // app.patch(
    //   "/classes/:id",
    //   verifyToken,
    //   verifyInstructor,
    //   async (req, res) => {
    //     const id = req.params.id;
    //     const data = req.body.feedback;
    //     console.log(feedback)
    //     const filter = { _id : new ObjectId(id) };
    //     const updateDoc = {
    //       $set: {
    //         ...data
    //       }
    //     };
    //     const result = await classesCollection.updateOne(filter, updateDoc);
    //     res.send(result);
    //   }
    // );

    // API's for get the selected classes
    app.get(
      "/my-classes/:email",
      verifyToken,
      verifyStudent,
      async (req, res) => {
        const email = req.params.email;
        const query = { email: email };
        const result = await selectedClassesCollection.find(query).toArray();
        res.send(result);
      }
    );

    // add classes in selectedClassesCollection
    app.post("/my-classes", verifyToken, verifyStudent, async (req, res) => {
      const newSelectedClass = req.body;
      const result = await selectedClassesCollection.insertOne(
        newSelectedClass
      );
      res.send(result);
    });

    // API's for delete a selected class
    app.delete(
      "/my-classes/:id",
      verifyToken,
      verifyStudent,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await selectedClassesCollection.deleteOne(query);
        res.send(result);
      }
    );

    // payment-intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // API's for payments
    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const paymentInfo = await paymentCollection.insertOne(payment);
    
      const selectedClassId = {_id : new ObjectId(payment.selectedClassId)}
      const classId = {_id : new ObjectId(payment.classId)}

      const updateDoc = {
        $inc: { totalEnroll: 1, seats: -1 }
      };
      
      // Delete the item from selectedClassesCollection
      const deleteResult = await selectedClassesCollection.deleteOne(selectedClassId);
    
      // Increase totalEnrolled and decrease seats in classCollection
      const updateResult = await classesCollection.updateOne(
        classId,
        updateDoc
      );
    
      res.send({ paymentInfo, deleteResult, updateResult });
    });
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("too much hot so stay home and learn something new. Enjoy!!");
});

app.listen(port, () => {
  console.log(`MelodyMakers server is running on port ${port}`);
});
