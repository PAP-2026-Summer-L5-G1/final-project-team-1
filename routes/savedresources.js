const express = require("express");
const router = express.Router();
const { getDB } = require("../db/connection");
const { ObjectId } = require("mongodb");

// GET /api/saved-resources
router.get("/", async (req, res) => {
  try {
    const results = await getDB().collection("saved_resources").find({}).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch saved resources" });
  }
});

// POST /api/saved-resources
router.post("/", async (req, res) => {
  try {
    const doc = {
      resourceId: req.body.resourceId,
      note: req.body.note || "",
    };
    const result = await getDB().collection("saved_resources").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    res.status(400).json({ error: "Failed to save resource", details: err.message });
  }
});

// PATCH /api/saved-resources/:id
router.patch("/:id", async (req, res) => {
  try {
    const result = await getDB()
      .collection("saved_resources")
      .findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body },
        { returnDocument: "after" }
      );
    if (!result) return res.status(404).json({ error: "Saved resource not found" });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: "Failed to update saved resource", details: err.message });
  }
});

// DELETE /api/saved-resources/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await getDB()
      .collection("saved_resources")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Saved resource not found" });
    res.json({ message: "Removed", id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete saved resource" });
  }
});

module.exports = router;
