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

    app.post("/subscription", async (req, res) => {
      const { sessionId, userId, priceId } = req.body;

      const isExist = await subscriptionsCollection.findOne({ sessionId });
      if (isExist) {
        return res.json({ msg: "Already exist!" });
      }

      await subscriptionsCollection.insertOne({
        sessionId,
        userId,
        priceId,
      });

      //update user role
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { plan: "pro" } },
      );

      res.json({ msg: "Payment successfull!" });
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
