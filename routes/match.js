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

function getDistanceMiles(userLat, userLng, resourceLat, resourceLng) {
  const earthRadiusMiles = 3958.8;

  const latDifference = resourceLat - userLat;
  const lngDifference = resourceLng - userLng;

  const latDifferenceRadians = toRadians(latDifference);
  const lngDifferenceRadians = toRadians(lngDifference);

  const userLatRadians = toRadians(userLat);
  const resourceLatRadians = toRadians(resourceLat);

  const a =
    Math.sin(latDifferenceRadians / 2) *
      Math.sin(latDifferenceRadians / 2) +
    Math.cos(userLatRadians) *
      Math.cos(resourceLatRadians) *
      Math.sin(lngDifferenceRadians / 2) *
      Math.sin(lngDifferenceRadians / 2);

  const distanceRadians = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceMiles = earthRadiusMiles * distanceRadians;

  return distanceMiles;
}

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

  if (!/^\d{5}$/.test(zipcode)) {
    return res.status(400).json({ error: "Enter a valid five-digit ZIP code" });
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
