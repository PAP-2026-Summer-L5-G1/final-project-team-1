const express = require("express");
const router = express.Router();
const { getDB } = require("../db/connection");

const zipCoordinatesCache = new Map();

async function getZipCoordinates(zipcode) {
  if (zipCoordinatesCache.has(zipcode)) {
    return zipCoordinatesCache.get(zipcode);
  }

  const response = await fetch(
    "https://api.zippopotam.us/us/" + encodeURIComponent(zipcode),
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const place = data.places && data.places[0];

  if (!place) {
    return null;
  }

  const coordinates = {
    lat: Number(place.latitude),
    lng: Number(place.longitude),
  };

  zipCoordinatesCache.set(zipcode, coordinates);
  return coordinates;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  lat1 = toRadians(lat1);
  lat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(lat1) *
      Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

router.post("/", async function (req, res) {
  const {
    members,
    income,
    zipcode,
    specialGroup,
  } = req.body;

  if (!members || !income || !zipcode) {
    return res.status(400).json({
      error: "Missing required information",
    });
  }

  if (!/^\d{5}$/.test(zipcode)) {
    return res.status(400).json({ error: "Enter a valid five-digit ZIP code" });
  }

  const householdSize = Number(members);

  const incomeNumber = Number(
    String(income).replace(/[$,]/g, "")
  );

  const isSeattleZip = zipcode.startsWith("981");

  const hasSpecialGroup = specialGroup === "yes";
  const snapIncomeLimits = [
    0,
    2660,
    3607,
    4553,
    5500,
    6447,
  ];
  const mayQualifyForSnap =
    incomeNumber <= snapIncomeLimits[householdSize];

  const wicIncomeLimits = {
    1: 2461,
    2: 3337,
    3: 4212,
    4: 5088,
    5: 5964,
  };

  const qualifiesForWic =
    hasSpecialGroup &&
    isSeattleZip &&
    incomeNumber <= wicIncomeLimits[householdSize];

  let freshBucksStatus = "Possible Match";

  if (
    mayQualifyForSnap &&
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
    const userCoordinates = await getZipCoordinates(zipcode);

    if (!userCoordinates) {
      return res.status(400).json({ error: "ZIP code location was not found" });
    }

    const resources = await getDB()
      .collection("resources")
      .find({
        status: { $ne: "temporarily_closed" },
      })
      .toArray();

    const nearbyResources = resources
      .filter(function (resource) {
        return typeof resource.lat === "number" && typeof resource.lng === "number";
      })
      .map(function (resource) {
        const distance = getDistanceMiles(
          userCoordinates.lat,
          userCoordinates.lng,
          resource.lat,
          resource.lng,
        );

        return {
          ...resource,
          distanceMiles: Number(distance.toFixed(1)),
        };
      })
      .sort(function (firstResource, secondResource) {
        return firstResource.distanceMiles - secondResource.distanceMiles;
      });

    const freshBucksLocations = nearbyResources.filter(function (resource) {
      return resource.accepts_fresh_bucks === true;
    });

    const foodBankLocations = nearbyResources.filter(function (resource) {
      return resource.category === "food_bank";
    });

    const programs = [
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
      ];

      if (mayQualifyForSnap) {
        programs.push({
    id: "basic-food",
    name: "SNAP / Basic Food",
    status: "Possible Match",
  });}
  if (hasSpecialGroup && qualifiesForWic) {
  programs.push({
    id: "wic",
    name: "WIC",
    status: "Possible Match",
  });}

    res.json({
      programs,

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
