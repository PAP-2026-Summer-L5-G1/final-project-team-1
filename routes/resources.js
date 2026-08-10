const express = require("express");
const router = express.Router();
const { getDB } = require("../db/connection");

// GET /api/resources
router.get("/", async (req, res) => {
  try {
    const results = await getDB().collection("resources").find({}).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

// GET /api/resources/:id
router.get("/:id", async (req, res) => {
  try {
    const result = await getDB().collection("resources").findOne({ id: req.params.id });
    if (!result) return res.status(404).json({ error: "Resource not found" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch resource" });
  }
});

// POST /api/resources
router.post("/", async (req, res) => {
  try {
    const result = await getDB().collection("resources").insertOne(req.body);
    res.status(201).json({ _id: result.insertedId, ...req.body });
  } catch (err) {
    res.status(400).json({ error: "Failed to create resource", details: err.message });
  }
});

// PATCH /api/resources/:id
router.patch("/:id", async (req, res) => {
  try {
    const result = await getDB()
      .collection("resources")
      .findOneAndUpdate(
        { id: req.params.id },
        { $set: req.body },
        { returnDocument: "after" }
      );
    if (!result) return res.status(404).json({ error: "Resource not found" });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: "Failed to update resource", details: err.message });
  }
});

// DELETE /api/resources/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await getDB().collection("resources").deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Resource not found" });
    res.json({ message: "Deleted", id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete resource" });
  }
});

module.exports = router;
