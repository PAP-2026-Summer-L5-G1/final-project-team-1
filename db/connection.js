const { MongoClient, ServerApiVersion } = require("mongodb");

const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

async function connectDB() {
  if (db) return db;
  await client.connect();
  db = client.db("freshaccess");
  console.log("Connected to MongoDB");
  return db;
}

function getDB() {
  if (!db) throw new Error("Database not connected yet — call connectDB() first");
  return db;
}

module.exports = { connectDB, getDB };
