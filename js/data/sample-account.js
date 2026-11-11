// TEMPORARY DEMO DATA for the Barikhuji dashboards. Delete this file (and its <script> tags) once the backend serves
// real account data. Every user, inquiry and landlord row below is fictional. Nothing here is a real account.
// Exposes ONE global: window.BK_SAMPLE_ACCOUNT. Listings live separately in js/data/sample-properties.js
// (window.BK_SAMPLE). This file only references BK_SAMPLE ids, so favorites and inquiry links open real sample pages.
//
// Shapes are exactly what js/api-account.js reads in demo mode (BK_CONFIG.USE_SAMPLE_DATA === true):
//   favoriteIds            ids matching window.BK_SAMPLE, mapped to property cards by api-account.js
//   inquiries[]            customer inquiries: { id, propertyId, propertyTitle, message, sentAt "YYYY-MM-DD", status }
//   landlord.stats         { activeListings, pendingListings, views, inquiries }
//   landlord.listings[]    { id, title, area, rent, status, views, inquiries }
//   landlord.inquiries[]   { id, propertyTitle, fromName, message, sentAt "YYYY-MM-DD" }
//   admin.stats            { users, landlords, activeListings, pendingReviews, openReports }
//   admin.pending[]        { id, title, landlordName, submittedAt "YYYY-MM-DD" }
//   admin.users[]          { id, name, email, role, status }
// Wire codes (labels are derived in api-account.js):
//   inquiry status "pending" | "replied" | "closed"
//   listing status "active" | "paused" | "pending_review" | "rejected"
//   user role       "customer" | "landlord" | "admin"
//   user status     "active" | "pending_verification" | "suspended"
// Demo mutations never change this object: removeFavorite, setListingStatus, deleteListing and reviewListing all
// return { saved: false } and the dashboards update their own local copy, so reloading always shows this state.
window.BK_SAMPLE_ACCOUNT = {
  // Demo customer. Favorite ids point at window.BK_SAMPLE so the favorites grid reuses real listing cards.
  favoriteIds: [1, 3],

  // This customer's sent inquiries. propertyId/propertyTitle link back to sample listings on property.html.
  inquiries: [
    { id: "inq-1", propertyId: 1, propertyTitle: "Sunny 2-Bed Flat near Dhanmondi Lake",
      message: "Is the flat still available from November? I would like to visit this weekend.",
      sentAt: "2026-10-18", status: "replied" },
    { id: "inq-2", propertyId: 2, propertyTitle: "Bachelor Room in Mirpur 10",
      message: "Looking for a room for two bachelors. What are the deposit terms?",
      sentAt: "2026-10-21", status: "pending" },
    { id: "inq-3", propertyId: 3, propertyTitle: "Family Apartment in Gulshan 2",
      message: "Can the rent be negotiated for a two-year lease?",
      sentAt: "2026-10-09", status: "closed" }
  ],

  // Demo landlord. Listing ids match the sample properties this landlord owns, so titles, areas and rents stay
  // consistent with the public browse pages. stats are the sums of the rows below (active = 2, pending = 1).
  landlord: {
    stats: { activeListings: 2, pendingListings: 1, views: 277, inquiries: 9 },
    listings: [
      { id: 1, title: "Sunny 2-Bed Flat near Dhanmondi Lake", area: "Dhanmondi", rent: 28000, status: "active",         views: 142, inquiries: 3 },
      { id: 2, title: "Bachelor Room in Mirpur 10",           area: "Mirpur",    rent: 9000,  status: "active",         views: 89,  inquiries: 5 },
      { id: 5, title: "Sea-View Flat in Panchlaish",          area: "Panchlaish", rent: 18000, status: "pending_review", views: 12,  inquiries: 0 },
      { id: 6, title: "Studio Flat in Uttara Sector 7",       area: "Uttara",    rent: 15000, status: "paused",         views: 34,  inquiries: 1 }
    ],
    inquiries: [
      { id: "l-inq-1", propertyTitle: "Sunny 2-Bed Flat near Dhanmondi Lake", fromName: "Tanvir Ahmed",
        message: "Is the flat still available from November?", sentAt: "2026-10-18" },
      { id: "l-inq-2", propertyTitle: "Bachelor Room in Mirpur 10", fromName: "Rakib Hassan",
        message: "Would you accept two bachelors sharing the room?", sentAt: "2026-10-21" },
      { id: "l-inq-3", propertyTitle: "Sunny 2-Bed Flat near Dhanmondi Lake", fromName: "Nusrat Jahan",
        message: "Can I visit on Friday afternoon?", sentAt: "2026-10-15" }
    ]
  },

  // Demo admin. pendingReviews matches the review queue below; activeListings counts live listings platform-wide.
  admin: {
    stats: { users: 8, landlords: 3, activeListings: 6, pendingReviews: 2, openReports: 0 },
    pending: [
      { id: 5, title: "Sea-View Flat in Panchlaish",             landlordName: "Mrs. Begum (demo)", submittedAt: "2026-10-22" },
      { id: 4, title: "Student Mess Seat near Dhaka University", landlordName: "Mr. Karim (demo)",  submittedAt: "2026-10-19" }
    ],
    users: [
      { id: "u-1", name: "Tanvir Ahmed", email: "tanvir@example.com",  role: "customer", status: "active" },
      { id: "u-2", name: "Mrs. Begum",   email: "begum@example.com",   role: "landlord", status: "active" },
      { id: "u-3", name: "Mr. Karim",    email: "karim@example.com",   role: "landlord", status: "pending_verification" },
      { id: "u-4", name: "Admin User",   email: "admin@barikhuji.com", role: "admin",    status: "active" },
      { id: "u-5", name: "Nusrat Jahan", email: "nusrat@example.com",  role: "customer", status: "suspended" }
    ]
  }
};

// Console-only self-check (same idea as sample-properties.js). It never changes the data; it just points at typos.
(() => {
  const bad = [];
  const a = window.BK_SAMPLE_ACCOUNT;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const statNums = (o, keys, label) => keys.forEach(k => {
    if (!Number.isInteger(o[k]) || o[k] < 0) bad.push(label + "." + k + " must be a non-negative integer");
  });
  const sentDate = (o, label) => { if (!DATE.test(o.sentAt)) bad.push(label + ".sentAt must be YYYY-MM-DD"); };

  if (!Array.isArray(a.favoriteIds) || !a.favoriteIds.length) bad.push("favoriteIds must be a non-empty array");
  if (!Array.isArray(a.inquiries)) bad.push("inquiries must be an array");
  (a.inquiries || []).forEach((i, n) => {
    if (i.id === undefined) bad.push("inquiries[" + n + "].id is missing");
    if (i.propertyId === undefined) bad.push("inquiries[" + n + "].propertyId is missing");
    if (typeof i.propertyTitle !== "string" || !i.propertyTitle) bad.push("inquiries[" + n + "].propertyTitle must be a non-empty string");
    if (typeof i.message !== "string") bad.push("inquiries[" + n + "].message must be a string");
    sentDate(i, "inquiries[" + n + "]");
    if (!["pending", "replied", "closed"].includes(i.status)) bad.push("inquiries[" + n + "].status must be pending, replied or closed");
  });

  const L = a.landlord || {};
  statNums(L.stats || {}, ["activeListings", "pendingListings", "views", "inquiries"], "landlord.stats");
  (L.listings || []).forEach((l, n) => {
    if (l.id === undefined) bad.push("landlord.listings[" + n + "].id is missing");
    if (typeof l.title !== "string" || !l.title) bad.push("landlord.listings[" + n + "].title must be a non-empty string");
    if (typeof l.area !== "string") bad.push("landlord.listings[" + n + "].area must be a string");
    if (!Number.isFinite(l.rent) || l.rent <= 0) bad.push("landlord.listings[" + n + "].rent must be greater than 0");
    if (!["active", "paused", "pending_review", "rejected"].includes(l.status)) bad.push("landlord.listings[" + n + "].status is invalid: " + l.status);
    if (!Number.isInteger(l.views) || l.views < 0) bad.push("landlord.listings[" + n + "].views must be a non-negative integer");
    if (!Number.isInteger(l.inquiries) || l.inquiries < 0) bad.push("landlord.listings[" + n + "].inquiries must be a non-negative integer");
  });
  (L.inquiries || []).forEach((i, n) => {
    if (i.id === undefined) bad.push("landlord.inquiries[" + n + "].id is missing");
    if (typeof i.propertyTitle !== "string" || !i.propertyTitle) bad.push("landlord.inquiries[" + n + "].propertyTitle must be a non-empty string");
    if (typeof i.fromName !== "string" || !i.fromName) bad.push("landlord.inquiries[" + n + "].fromName must be a non-empty string");
    if (typeof i.message !== "string") bad.push("landlord.inquiries[" + n + "].message must be a string");
    sentDate(i, "landlord.inquiries[" + n + "]");
  });
  // stats must equal the rows below them, so the overview never contradicts the tables.
  if (L.listings && L.stats) {
    const sum = (k) => L.listings.reduce((s, l) => s + (l[k] || 0), 0);
    const count = (st) => L.listings.filter(l => l.status === st).length;
    if (L.stats.views !== sum("views")) bad.push("landlord.stats.views does not equal the sum of listing views");
    if (L.stats.inquiries !== sum("inquiries")) bad.push("landlord.stats.inquiries does not equal the sum of listing inquiries");
    if (L.stats.activeListings !== count("active")) bad.push("landlord.stats.activeListings does not match the listings");
    if (L.stats.pendingListings !== count("pending_review")) bad.push("landlord.stats.pendingListings does not match the listings");
  }

  const A = a.admin || {};
  statNums(A.stats || {}, ["users", "landlords", "activeListings", "pendingReviews", "openReports"], "admin.stats");
  (A.pending || []).forEach((p, n) => {
    if (p.id === undefined) bad.push("admin.pending[" + n + "].id is missing");
    if (typeof p.title !== "string" || !p.title) bad.push("admin.pending[" + n + "].title must be a non-empty string");
    if (typeof p.landlordName !== "string" || !p.landlordName) bad.push("admin.pending[" + n + "].landlordName must be a non-empty string");
    if (!DATE.test(p.submittedAt)) bad.push("admin.pending[" + n + "].submittedAt must be YYYY-MM-DD");
  });
  if (A.pending && A.stats && A.stats.pendingReviews !== A.pending.length) {
    bad.push("admin.stats.pendingReviews does not match the number of pending listings");
  }
  (A.users || []).forEach((u, n) => {
    if (u.id === undefined) bad.push("admin.users[" + n + "].id is missing");
    if (typeof u.name !== "string" || !u.name) bad.push("admin.users[" + n + "].name must be a non-empty string");
    if (typeof u.email !== "string" || !u.email) bad.push("admin.users[" + n + "].email must be a non-empty string");
    if (!["customer", "landlord", "admin"].includes(u.role)) bad.push("admin.users[" + n + "].role is invalid: " + u.role);
    if (!["active", "pending_verification", "suspended"].includes(u.status)) bad.push("admin.users[" + n + "].status is invalid: " + u.status);
  });

  // Cross-check: every favorite must resolve to a sample listing, so the favorites grid is never empty by accident.
  if (Array.isArray(a.favoriteIds) && Array.isArray(window.BK_SAMPLE)) {
    a.favoriteIds.forEach(id => {
      if (!window.BK_SAMPLE.find(p => p.id === id)) bad.push("favoriteIds contains id " + id + " which is not in BK_SAMPLE");
    });
  }
  if (bad.length) console.warn("[Barikhuji] sample-account.js problems:\n" + bad.join("\n"));
})();
