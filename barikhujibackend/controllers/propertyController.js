"use strict";
const asyncHandler = require("../utils/asyncHandler");
const { parsePropertyQuery } = require("../utils/propertyQuery");
const { toPublicProperty, PUBLIC_FIELDS, LANDLORD_FIELDS } = require("../utils/propertySerializer");

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Public, read-only. Factory so tests can pass a fake model; in the app it loads the real one.
function createPropertyController(PropertyModel) {
  const Property = PropertyModel || require("../models/Property");
  const withLandlord = { path: "landlord", select: LANDLORD_FIELDS };

  // GET /properties -> { items, total, page, pages }
  const list = asyncHandler(async (req, res) => {
    const { filter, sort, page, limit, errors } = parsePropertyQuery(req.query);
    if (Object.keys(errors).length) return res.status(422).json({ message: Object.values(errors)[0], errors });

    const [docs, total] = await Promise.all([
      Property.find(filter).select(PUBLIC_FIELDS).sort(sort).skip((page - 1) * limit).limit(limit).populate(withLandlord).lean(),
      Property.countDocuments(filter)
    ]);
    res.json({ items: docs.map(toPublicProperty), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  });

  // GET /properties/:id -> one listing. Pending, paused, rejected, malformed and unknown ids are all the same 404,
  // so nobody can tell that an unpublished listing exists.
  const get = asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const notFound = () => res.status(404).json({ message: "Property not found." });
    if (!OBJECT_ID.test(id)) return notFound();

    const doc = await Property.findOne({ _id: id, status: "active" }).select(PUBLIC_FIELDS).populate(withLandlord).lean();
    if (!doc) return notFound();

    // Feeds "Total views" on the landlord dashboard. timestamps:false so a page view does not change updatedAt. Failure is ignored.
    await Property.updateOne({ _id: id, status: "active" }, { $inc: { views: 1 } }, { timestamps: false }).catch(() => {});
    res.json(toPublicProperty(doc));
  });

  return { list, get };
}

module.exports = createPropertyController;
