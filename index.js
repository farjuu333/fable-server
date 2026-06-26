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
  console.log("Payload content:", payload);
  req.user = payload;
   next()
} catch (error) {
  return res.status(403).json({message:"Forbidden"});
}
}

// const authorizeAdmin = (req, res, next) => {
//   console.log("User in authorizeAdmin:", req.user);
//   if (req.user && req.user.role === "admin") {
//     next();
//   } else {
//     return res.status(403).json({ message: "Forbidden: Admins only" });
//   }
// };

// async function run() {
//   try {
//     await client.connect();

client.connect(()=>{
  console.log('connecting to MOngo db')

}).catch(console.dir)

    const db = client.db(process.env.AUTH_DB_NAME);
    const subscriptionsCollection = db.collection("subscriptions");
    const userCollection = db.collection("user");
    const manageCollection = db.collection("manage");
    const bookmarksCollection = db.collection("bookmarks");
    const transactionsCollection = db.collection("transactions"); 




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
// app.post("/subscription", async (req, res) => {
//     const { sessionId, userId, bookId, priceId,status,emailFromMetadata } = req.body;
//     try {
//         console.log(req.body)
//         res.send({})
//         await subscriptionsCollection.insertOne({ sessionId,priceId, userId,emailFromMetadata, bookId,status, date: new Date() });
//         const result=await manageCollection.updateOne(
//             { _id: new ObjectId(bookId) },
//            { $set: { status: "Sold" } }
//         );
//         console.log("Update result:", result);
//         res.status(200).send({ success: true });
//     } catch (error) {
//         res.status(500).send({ error: "Failed to update" });
//     }
// });


app.post("/subscription", async (req, res) => {
    const { sessionId, userId, bookId, priceId, status, emailFromMetadata, title, amount } = req.body;
    
    try {
        
        const transaction = {
            transactionId: sessionId,
            type: "subscription",
            userId: userId,
            userEmail: emailFromMetadata,
            ebook: new ObjectId(bookId),
            ebookTitle: title || "Ebook Subscription",
            amount: amount, 
            createdAt: new Date()
        };

      
        await subscriptionsCollection.insertOne({ 
            sessionId, 
            priceId, 
            userId, 
            emailFromMetadata, 
            bookId, 
            status, 
            date: new Date() 
        });

        
        await transactionsCollection.insertOne(transaction);

        
        const result = await manageCollection.updateOne(
            { _id: new ObjectId(bookId) },
            { $set: { status: "Sold", soldBy: emailFromMetadata } } 
        );

        console.log("Subscription & Transaction recorded. Update result:", result);
        
        res.status(200).json({ success: true, message: "Subscription and transaction recorded successfully" });

    } catch (error) {
        console.error("❌ Subscription Error:", error);
        res.status(500).json({ error: "Failed to process subscription" });
    }
});

// user purchase data
app.get("/api/dashboard/user/purchases", async (req, res) => {
  try {
    const {email} = req.query;
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

// Bookmark API
app.get("/api/bookmarks", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const user = await userCollection.findOne({ email: email });
    if (!user) return res.status(404).json({ error: "User not found" });
    const bookmarks = await bookmarksCollection 
      .find({ userId: user._id.toString() })
      .toArray();

    if (bookmarks.length === 0) return res.json([]);

    const ebookIds = bookmarks.map(b => b.ebookId);

    const bookmarkedBooks = await manageCollection
      .find({
        $or: [
          { _id: { $in: ebookIds } }, 
          { _id: { $in: ebookIds.map(id => {
              try { return new ObjectId(id); } catch { return null; }
          }).filter(id => id !== null) } } 
        ]
      })
      .toArray();

    res.json(bookmarkedBooks);
  } catch (err) {
    console.error("Error fetching bookmarks:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// add book mark
app.post("/api/bookmarks", async (req, res) => {
  try {
    const { email, ebookId } = req.body;
    
    
    const user = await userCollection.findOne({ email: email });
    if (!user) return res.status(404).json({ error: "User not found" });

    
    const exists = await bookmarksCollection.findOne({ userId: user._id.toString(), ebookId });
    if (exists) return res.status(400).json({ message: "Already bookmarked" });

    
    await bookmarksCollection.insertOne({ userId: user._id.toString(), ebookId, createdAt: new Date() });
    res.status(201).json({ message: "Bookmarked successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete bookmark
app.delete("/api/bookmarks", async (req, res) => {
  try {
    const { email, ebookId } = req.query;

    const user = await userCollection.findOne({ email: email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const result = await bookmarksCollection.findOneAndDelete({ 
        userId: user._id.toString(), 
        ebookId 
    });

    if (!result) return res.status(404).json({ message: "Bookmark not found" });
    res.json({ message: "Bookmark removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Writer's sales history-
app.get("/api/dashboard/writer/sales", async (req, res) => {
  try {
    const { writerEmail } = req.query; 
    if (!writerEmail) return res.status(400).json({ error: "Writer email is required" });

    
    const writerBooks = await manageCollection
      .find({ writerEmail: writerEmail }) 
      .toArray();

    if (writerBooks.length === 0) return res.json([]);

    const bookIds = writerBooks.map(book => book._id.toString());

    
    const sales = await subscriptionsCollection
      .find({ 
        bookId: { $in: bookIds },
        status: "Sold"
      })
      .toArray();

    res.json(sales);
  } catch (err) {
    console.error("Error fetching sales:", err);
    res.status(500).json({ error: err.message });
  }
});


// user role and logic admin
app.put("/api/dashboard/users/role", async (req, res) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session || session.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized access: Admins only" });
    }
    const { email, role } = req.body;
    const db = client.db(process.env.AUTH_DB_NAME);
    const result = await db.collection("user").updateOne(
      { email }, 
      { $set: { role } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "Role updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// users for admin dashboard
app.get("/api/dashboard/users",  async (req, res) => {
  try {
  
      const users = await userCollection.find({}).toArray();
    const safeUsers = users.map(({ password, ...user }) => ({
      _id: user._id,
      name: user.name,
      email: user.email, 
      role: user.role
    }));
  res.json(safeUsers);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// admin delete users
app.delete("/api/dashboard/users",  async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const result = await userCollection.deleteOne({ email: email });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: err.message });
  }
});


// Get Dashboard Stats 
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const totalEbooks = await manageCollection.countDocuments({ status: "published" });
    const totalSold = await manageCollection.countDocuments({ status: "Sold" });
    const revenue = await manageCollection.aggregate([
      { $match: { status: "Sold" } },
      { $group: { _id: null, total: { $sum: "$price" } } }
    ]).toArray();

    res.json({
      totalEbooks,
      totalSold,
      totalRevenue: revenue[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: err.message });
  }
});


// Admin: Get all ebooks (published + unpublished)
app.get("/api/admin/books",  async (req, res) => {
  try {
    // Sort by _id: -1 is equivalent to createdAt: -1 for MongoDB ObjectIds
    const ebooks = await manageCollection.find({}).sort({ _id: -1 }).toArray();
    res.json(ebooks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Toggle publish/unpublish
app.put("/api/admin/books/:id/toggle-status",  async (req, res) => {
  try {
    const id = req.params.id;
    const ebook = await manageCollection.findOne({ _id: new ObjectId(id) });
    
    if (!ebook) return res.status(404).json({ error: "Not found" });

    const newStatus = ebook.status === "published" ? "unpublished" : "published";
    
    await manageCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: newStatus } }
    );
    
    res.json({ ...ebook, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete ebook
app.delete("/api/admin/books/:id",  async (req, res) => {
  try {
    const id = req.params.id;
    const result = await manageCollection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    
    res.json({ message: "Ebook deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// complete purchase
app.post("/api/complete-purchase", async (req, res) => {
      try {
        const { session_id } = req.body;
        if (!session_id) return res.status(400).json({ error: "No session_id provided" });

        const session = await stripe.checkout.sessions.retrieve(session_id);
        const bookId = session.metadata?.bookId;
        const email = session.metadata?.userEmail || session.customer_details?.email || "unknown@email.com";
        const amount = session.amount_total / 100;
        const title = session.metadata?.title || "Ebook";

        if (!bookId) return res.status(400).json({ error: "No ebookId in metadata" });

        // Ebook update
        await manageCollection.updateOne(
          { _id: new ObjectId(ebookId) },
          { $set: { sold: true, userEmail: email, status: "Sold" } }
        );

        // Transaction save
        const transaction = {
          transactionId: session.id,
          type: "purchase",
          userEmail: email,
          ebook: new ObjectId(bookId),
          ebookTitle: title,
          amount: amount,
          createdAt: new Date()
        };
        await transactionsCollection.insertOne(transaction);

        res.json({ success: true, message: "Purchase completed" });
      } catch (err) {
        console.error("❌ Complete Purchase Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // 2. Get All Transactions (Admin)
    app.get("/api/dashboard/transactions",  async (req, res) => {
      try {
        const transactions = await transactionsCollection.find({})
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();
        res.json(transactions);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });



      // await client.db("admin").command({ ping: 1 });
     console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
//   } finally {
//     // Ensures that the client will close when you finish/error
//     // await client.close();
//   }
// }
// run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
module.exports=app;
