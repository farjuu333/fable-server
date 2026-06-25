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
     const ebookCollection = db.collection("ebooks");
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

     app.post("/api/manage",async(req,res)=>{
        const manages = req.body;
        const result = await manageCollection.insertOne(manages);
        res.send(result);
     })

    
    app.get("/api/all-books", async (req, res) => {
    try {
        const { search, genre, minPrice, maxPrice, status, sort, page = 1, limit = 8 } = req.query;
        let query = {};

        // ১. Search (Title & Writer Name)
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { writerName: { $regex: search, $options: "i" } }
            ];
        }

        // ২. Filters
        if (genre) query.genre = genre;
        if (status) query.status = status;
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // ৩. Sorting
        let sortOption = {};
        if (sort === 'newest') sortOption = { _id: -1 };
        else if (sort === 'price-low') sortOption = { price: 1 };
        else if (sort === 'price-high') sortOption = { price: -1 };

        
        const pageInt = parseInt(page) || 1;
const limitInt = parseInt(limit) || 8;
const skip = (pageInt - 1) * limitInt;

const books = await manageCollection.find(query)
// const books = await ebookCollection.find(query)
    .sort(sortOption)
    .skip(skip)
    .limit(limitInt)
    .toArray();

        const total = await manageCollection.countDocuments(query);
        // const total = await ebookCollection.countDocuments(query);

        res.send({ books, totalPages: Math.ceil(total / limitInt) });
    } catch (error) {
        res.status(500).send({ message: "Error fetching data" });
    }
});


    app.get("/api/books/:id", async (req, res) => {
    try {
        const id = req.params.id;
        
        const query = { _id: new ObjectId(id) };
        const result = await manageCollection.findOne(query);
        // const result = await ebookCollection.findOne(query);
        
        if (!result) {
            return res.status(404).send({ message: "Ebook not found" });
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching ebook details" });
    }
});


app.post("/subscription", async (req, res) => {
    const { sessionId, userId, bookId, priceId,status } = req.body;
    try {
        console.log(req.body)
        res.send({})
        await subscriptionsCollection.insertOne({ sessionId,priceId, userId, bookId,status, date: new Date() });
        
        
        const result=await manageCollection.updateOne(
            { _id: new ObjectId(bookId) },
            // { _id: bookId },
            
           
            { $set: { status: "Sold" } }
        );
        console.log("Update result:", result);
        
        
        res.status(200).send({ success: true });
    } catch (error) {
        res.status(500).send({ error: "Failed to update" });
    }
});

     app.get("/ebooks", async (req, res) => {
      const { search } = req.query;
      const query = {};
      if (search && search != "undefined") {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const result = await ebookCollection.find(query).toArray();

      res.send(result);
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
