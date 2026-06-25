// const dns = require('node:dns');
// dns.setServers(['1.1.1.1', '1.0.0.1']); 

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();


const uri = process.env.MONGODB_URI;
const { createRemoteJWKSet, jwtVerify } = require("jose");
const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});



const JWKS = createRemoteJWKSet(
new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
)


const verifyToken = async(req,res,next)=>{
  const authHeader = req?.headers.authorization;
  if(!authHeader){
    return res.status(401).json({message : "Unauthorized"});
  }
  const token = authHeader.split(" ")[1]
  if(!token){
    return res.status(401).json({message : "Unauthorized"});
  }

  try {
    const {payload}=await jwtVerify(token,JWKS)
  console.log (payload)
   next()
} catch (error) {
  return res.status(403).json({message:"Forbidden"});
}


}

async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.AUTH_DB_NAME);
    const subscriptionsCollection = db.collection("subscriptions");
    const userCollection = db.collection("user");
    const manageCollection = db.collection("manage");





     app.get('/api/manage',async(req,res)=>{
        const query = {};
         if (req.query.bookId) {
        query.bookId = req.query.bookId;
    }
    if (req.query.status) {
        query.status = req.query.status;
    }
     const cursor = manageCollection.find(query);
    const result = await cursor.toArray();
    res.send(result);

     })
    //  add a book in dashboard/writer/add 
     app.post("/api/manage",async(req,res)=>{
        const manages = req.body;
        const result = await manageCollection.insertOne(manages);
        res.send(result);
     })

    // get all books in browsebook router
    app.get("/api/all-books", async (req, res) => {
    try {
        const { search, genre, minPrice, maxPrice, status, sort, page = 1, limit = 8 } = req.query;
        let query = {};

        // . Search (Title & Writer Name)
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { writerName: { $regex: search, $options: "i" } }
            ];
        }

        // . Filters
        if (genre) query.genre = genre;
        if (status) query.status = status;
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // . Sorting
        let sortOption = {};
        if (sort === 'newest') sortOption = { _id: -1 };
        else if (sort === 'price-low') sortOption = { price: 1 };
        else if (sort === 'price-high') sortOption = { price: -1 };

        
        const pageInt = parseInt(page) || 1;
        const limitInt = parseInt(limit) || 8;
        const skip = (pageInt - 1) * limitInt;
        const books = await manageCollection.find(query)

            .sort(sortOption)
            .skip(skip)
            .limit(limitInt)
            .toArray();

        const total = await manageCollection.countDocuments(query);
    res.send({ books, totalPages: Math.ceil(total / limitInt) });
    } catch (error) {
        res.status(500).send({ message: "Error fetching data" });
    }
});

// get book details page 
    app.get("/api/books/:id", async (req, res) => {
    try {
        const id = req.params.id;
        
        const query = { _id: new ObjectId(id) };
        const result = await manageCollection.findOne(query);
        if (!result) {
            return res.status(404).send({ message: "Ebook not found" });
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching ebook details" });
    }
});
// get 6 books featuresection homepage
app.get("/api/featured-books", async (req, res) => {
  try {
    const ebooks = await manageCollection
  .find({ status: { $regex: /^published$/i } })
  .sort({ _id: -1 })
  .limit(6)
  .toArray();
    console.log("Featured Ebooks Found:", ebooks.length);
    res.json(ebooks);
  } catch (err) {
    console.error("Error in featured-books:", err);
    res.status(500).json({ error: err.message });
  }
});

// purchase book user update status user card 
app.post("/subscription", async (req, res) => {
    const { sessionId, userId, bookId, priceId,status } = req.body;
    try {
        console.log(req.body)
        res.send({})
        await subscriptionsCollection.insertOne({ sessionId,priceId, userId, bookId,status, date: new Date() });
        const result=await manageCollection.updateOne(
            { _id: new ObjectId(bookId) },
           { $set: { status: "Sold" } }
        );
        console.log("Update result:", result);
        res.status(200).send({ success: true });
    } catch (error) {
        res.status(500).send({ error: "Failed to update" });
    }
});


// user purchase data
app.get("/api/dashboard/user/purchases", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await userCollection.findOne({ email: email });
    if (!user) return res.status(404).json({ error: "User not found" });

    
    const purchases = await subscriptionsCollection
      .find({ userId: user._id.toString() })
      .toArray();

    if (purchases.length === 0) return res.json([]);

    
    const bookIds = purchases.map(p => p.bookId);

    const purchasedBooks = await manageCollection
      .find({
        $or: [
          { _id: { $in: bookIds } }, 
          { _id: { $in: bookIds.map(id => {
              try { return new ObjectId(id); } catch { return null; }
          }).filter(id => id !== null) } } 
        ]
      })
      .toArray();

    res.json(purchasedBooks);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

      await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
