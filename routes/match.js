const express = require("express");
const router = express.Router();
const { getDB } = require("../db/connection");

router.post("/", async function (req, res) {
  const {
    members,
    income,
    zipcode,
    snap,
    specialGroup,
  } = req.body;

  if (!members || !income || !zipcode || !snap) {
    return res.status(400).json({
      error: "Missing required information",
    });
  }

  const householdSize = Number(members);

  const incomeNumber = Number(
    String(income).replace(/[$,]/g, "")
  );

  const isSeattleZip = zipcode.startsWith("981");

  const hasSpecialGroup = specialGroup === "yes";

  let freshBucksStatus = "Possible Match";

  if (
    snap === "yes" &&
    householdSize > 0 &&
    incomeNumber > 0 &&
    isSeattleZip
  ) {
    freshBucksStatus = "Strong Match";
  }

  let foodBankReason =
    "Food banks are available to everyone.";

  if (hasSpecialGroup) {
    foodBankReason =
      "Your household information may make food resources especially useful.";
  }

  try {
    const resources = await getDB()
      .collection("resources")
      .find({
        status: { $ne: "temporarily_closed" },
      })
      .toArray();

    const freshBucksLocations = resources.filter(function (resource) {
      return resource.accepts_fresh_bucks === true;
    });

    const foodBankLocations = resources.filter(function (resource) {
      return resource.category === "food_bank";
    });

    res.json({
      programs: [
        {
          id: "fresh-bucks",
          name: "Fresh Bucks",
          status: freshBucksStatus,
        },
        {
          id: "food-bank",
          name: "Food Banks",
          status: "Available to Everyone",
          reason: foodBankReason,
        },
      ],

      locations: freshBucksLocations,
      foodBankLocations: foodBankLocations,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Could not load resources",
    });
  }
});

module.exports = router;