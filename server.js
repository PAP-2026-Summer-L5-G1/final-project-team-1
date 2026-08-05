require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db/connection");

const resourceRoutes = require("./routes/resources");
const savedResourceRoutes = require("./routes/savedresources");
const matchRoutes = require("./routes/match");
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/resources", resourceRoutes);
app.use("/api/saved-resources", savedResourceRoutes);
app.use("/api/matches", matchRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
  });
