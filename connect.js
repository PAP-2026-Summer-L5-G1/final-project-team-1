require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { connectDB } = require("./db/connection");

async function connect() {
  const db = await connectDB();
  console.log("Connected to MongoDB..");

  const raw = fs.readFileSync(path.join(__dirname, "resource_db.json"), "utf-8");
  const resources = JSON.parse(raw);

  await db.collection("resources").deleteMany({});
  const result = await db.collection("resources").insertMany(resources);

  console.log(`Loaded ${result.insertedCount} resources into the database.`);
  process.exit(0);
}

connect().catch((err) => {
  console.error("Failed to load data:", err);
  process.exit(1);
});
