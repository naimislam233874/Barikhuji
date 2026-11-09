// TEMPORARY DEMO DATA for the Barikhuji frontend. Delete this file (and its <script> tags) once the backend serves real listings.
// Every listing, landlord and photo below is fictional sample content. Nothing here is a real, verified property.
// Exposes ONE global: window.BK_SAMPLE (an array of properties). Dashboard preview data lives separately in
// js/data/sample-account.js (window.BK_SAMPLE_ACCOUNT). Do not merge them.
//
// Field names mirror the planned API/Mongoose Property (camelCase). Conventions:
//   id            number here; the real API will send a string (MongoDB ObjectId). Never rely on it being numeric.
//   rent, deposit numbers in BDT (no formatting)       bedrooms, bathrooms  whole numbers
//   availableFrom "YYYY-MM-DD"                          verified, featured   booleans
//   type          "Apartment" | "Room" | "Studio" | "Mess/Seat"
//   furnished     "Furnished" | "Semi-furnished" | "Unfurnished"
//   suitableFor   any of "Bachelor" | "Student" | "Family"
//   amenities     any of "Lift" | "Generator" | "Gas" | "Wi-Fi" | "Parking" | "Security" | "CCTV"
//   isDemo        true on every sample item (extra field; the real API will not send it)
// Verification flags are false on purpose: sample landlords and listings have not been checked by anyone.
// Image URLs are external Unsplash references that have NOT been verified from this file. If one fails to load,
// replace it with a local file such as "assets/img/demo-1.jpg". Missing photos are replaced by a placeholder in js/api.js.
window.BK_SAMPLE = [
  {
    id: 1, isDemo: true,
    title: "Sunny 2-Bed Flat near Dhanmondi Lake", area: "Dhanmondi", city: "Dhaka",
    rent: 28000, deposit: 56000, type: "Apartment", bedrooms: 2, bathrooms: 2, furnished: "Semi-furnished",
    suitableFor: ["Family"], amenities: ["Lift", "Generator", "Gas", "Parking"],
    availableFrom: "2026-11-01", verified: false, featured: true,
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1000",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1000",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1000"
    ],
    description: "Bright, airy flat on the 4th floor with a balcony and a quiet neighbourhood. (Demo listing, not a real property.)",
    landlord: { name: "Mr. Rahman (demo)", verified: false, responseTime: "Within 2 hours" }
  },
  {
    id: 2, isDemo: true,
    title: "Bachelor Room in Mirpur 10", area: "Mirpur", city: "Dhaka",
    rent: 9000, deposit: 18000, type: "Room", bedrooms: 1, bathrooms: 1, furnished: "Furnished",
    suitableFor: ["Bachelor", "Student"], amenities: ["Wi-Fi", "Generator", "Security"],
    availableFrom: "2026-10-25", verified: false, featured: true,
    images: ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1000"],
    description: "Clean furnished room, close to metro rail. (Demo listing, not a real property.)",
    landlord: { name: "Ms. Sultana (demo)", verified: false, responseTime: "Same day" }
  },
  {
    id: 3, isDemo: true,
    title: "Family Apartment in Gulshan 2", area: "Gulshan", city: "Dhaka",
    rent: 65000, deposit: 195000, type: "Apartment", bedrooms: 3, bathrooms: 3, furnished: "Furnished",
    suitableFor: ["Family"], amenities: ["Lift", "Generator", "Gas", "Parking", "CCTV"],
    availableFrom: "2026-12-01", verified: false, featured: true,
    images: ["https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=1000"],
    description: "Premium 3-bed with a rooftop garden access. (Demo listing, not a real property.)",
    landlord: { name: "Mr. Chowdhury (demo)", verified: false, responseTime: "Within a day" }
  },
  {
    id: 4, isDemo: true,
    title: "Student Mess Seat near Dhaka University", area: "Shahbag", city: "Dhaka",
    rent: 4500, deposit: 4500, type: "Mess/Seat", bedrooms: 1, bathrooms: 1, furnished: "Furnished",
    suitableFor: ["Student", "Bachelor"], amenities: ["Wi-Fi", "Gas"],
    availableFrom: "2026-10-20", verified: false, featured: false,
    images: ["https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1000"],
    description: "Shared room, meals optional. (Demo listing, not a real property.)",
    landlord: { name: "Mr. Karim (demo)", verified: false, responseTime: "Within a day" }
  },
  {
    id: 5, isDemo: true,
    title: "Sea-View Flat in Panchlaish", area: "Panchlaish", city: "Chattogram",
    rent: 18000, deposit: 36000, type: "Apartment", bedrooms: 2, bathrooms: 2, furnished: "Unfurnished",
    suitableFor: ["Family", "Bachelor"], amenities: ["Lift", "Gas", "Generator"],
    availableFrom: "2026-11-10", verified: false, featured: true,
    images: ["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1000"],
    description: "Quiet building with a partial hill view. (Demo listing, not a real property.)",
    landlord: { name: "Mrs. Begum (demo)", verified: false, responseTime: "Within 3 hours" }
  },
  {
    id: 6, isDemo: true,
    title: "Studio Flat in Uttara Sector 7", area: "Uttara", city: "Dhaka",
    rent: 15000, deposit: 30000, type: "Studio", bedrooms: 1, bathrooms: 1, furnished: "Furnished",
    suitableFor: ["Bachelor"], amenities: ["Wi-Fi", "Lift", "Generator", "Security"],
    availableFrom: "2026-10-30", verified: false, featured: false,
    images: ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1000"],
    description: "Compact modern studio near the airport road. (Demo listing, not a real property.)",
    landlord: { name: "Mr. Hasan (demo)", verified: false, responseTime: "Within 1 hour" }
  }
];

// Console-only self-check. It never changes the data; it just points at typos in demo listings.
(() => {
  const TYPES = ["Apartment", "Room", "Studio", "Mess/Seat"], FURN = ["Furnished", "Semi-furnished", "Unfurnished"];
  const SUIT = ["Bachelor", "Student", "Family"], AMEN = ["Lift", "Generator", "Gas", "Wi-Fi", "Parking", "Security", "CCTV"];
  const seen = new Set(), bad = [];
  window.BK_SAMPLE.forEach((p, i) => {
    const w = m => bad.push(`#${i} (id ${p.id}): ${m}`);
    if (seen.has(p.id)) w("duplicate id"); seen.add(p.id);
    ["title", "area", "city", "description"].forEach(k => { if (!p[k] || typeof p[k] !== "string") w(k + " must be a non-empty string"); });
    ["rent", "deposit", "bedrooms", "bathrooms"].forEach(k => { if (!Number.isFinite(p[k]) || p[k] < 0) w(k + " must be a non-negative number"); });
    if (!(p.rent > 0)) w("rent must be greater than 0");
    if (!TYPES.includes(p.type)) w("unknown type " + p.type);
    if (!FURN.includes(p.furnished)) w("unknown furnished " + p.furnished);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.availableFrom)) w("availableFrom must be YYYY-MM-DD");
    if (!Array.isArray(p.suitableFor) || !p.suitableFor.length || p.suitableFor.some(s => !SUIT.includes(s))) w("bad suitableFor");
    if (!Array.isArray(p.amenities) || p.amenities.some(a => !AMEN.includes(a))) w("bad amenities");
    if (!Array.isArray(p.images) || !p.images.length || p.images.some(u => typeof u !== "string" || !u)) w("images must be a non-empty array of URLs");
    if (typeof p.verified !== "boolean" || typeof p.featured !== "boolean") w("verified/featured must be booleans");
    if (!p.landlord || !p.landlord.name) w("landlord.name is missing");
  });
  if (bad.length) console.warn("[Barikhuji] sample-properties.js problems:\n" + bad.join("\n"));
})();
