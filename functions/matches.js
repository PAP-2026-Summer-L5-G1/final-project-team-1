const { MongoClient, ServerApiVersion } = require("mongodb");

let client;
let db;
const zipCoordinatesCache = new Map();

async function getDB() {
  if (db) return db;

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  client = new MongoClient(process.env.MONGO_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  db = client.db("freshaccess");
  return db;
}

async function getZipCoordinates(zipcode) {
  if (zipCoordinatesCache.has(zipcode)) {
    return zipCoordinatesCache.get(zipcode);
  }

  const response = await fetch(
    "https://api.zippopotam.us/us/" + encodeURIComponent(zipcode),
  );

  if (!response.ok) return null;

  const data = await response.json();
  const place = data.places && data.places[0];
  if (!place) return null;

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
  const radiusMiles = 3958.8;
  const latitudeDifference = toRadians(lat2 - lat1);
  const longitudeDifference = toRadians(lon2 - lon1);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.sin(longitudeDifference / 2) ** 2 *
      Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2));

  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const { members, income, zipcode, specialGroup } = requestBody;
  if (!members || !income || !zipcode) {
    return json(400, { error: "Missing required information" });
  }

  if (!/^\d{5}$/.test(zipcode)) {
    return json(400, { error: "Enter a valid five-digit ZIP code" });
  }

  const householdSize = Number(members);
  const incomeNumber = Number(String(income).replace(/[$,]/g, ""));
  const isSeattleZip = zipcode.startsWith("981");
  const hasSpecialGroup = specialGroup === "yes";
  const snapIncomeLimits = [0, 2660, 3607, 4553, 5500, 6447];
  const wicIncomeLimits = { 1: 2461, 2: 3337, 3: 4212, 4: 5088, 5: 5964 };
  const mayQualifyForSnap = incomeNumber <= snapIncomeLimits[householdSize];
  const qualifiesForWic =
    hasSpecialGroup &&
    isSeattleZip &&
    incomeNumber <= wicIncomeLimits[householdSize];

  const freshBucksStatus =
    mayQualifyForSnap && householdSize > 0 && incomeNumber > 0 && isSeattleZip
      ? "Strong Match"
      : "Possible Match";

  const foodBankReason = hasSpecialGroup
    ? "Your household information may make food resources especially useful."
    : "Food banks are available to everyone.";

  try {
    const userCoordinates = await getZipCoordinates(zipcode);
    if (!userCoordinates) {
      return json(400, { error: "ZIP code location was not found" });
    }

    const resources = await (await getDB())
      .collection("resources")
      .find({ status: { $ne: "temporarily_closed" } })
      .toArray();

    const nearbyResources = resources
      .filter((resource) => typeof resource.lat === "number" && typeof resource.lng === "number")
      .map((resource) => ({
        ...resource,
        distanceMiles: Number(
          getDistanceMiles(
            userCoordinates.lat,
            userCoordinates.lng,
            resource.lat,
            resource.lng,
          ).toFixed(1),
        ),
      }))
      .sort((first, second) => first.distanceMiles - second.distanceMiles);

    const programs = [
      { id: "fresh-bucks", name: "Fresh Bucks", status: freshBucksStatus },
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
      });
    }

    if (hasSpecialGroup && qualifiesForWic) {
      programs.push({
        id: "wic",
        name: "WIC",
        status: "Possible Match",
        reason:
          "Your household includes children or a pregnant person, so WIC may be worth exploring.",
      });
    }

    return json(200, {
      programs,
      locations: nearbyResources.filter((resource) => resource.accepts_fresh_bucks === true),
      foodBankLocations: nearbyResources.filter((resource) => resource.category === "food_bank"),
    });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Could not load resources" });
  }
};
