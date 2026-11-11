"use strict";
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Property = require("../models/Property");
const asyncHandler = require("../utils/asyncHandler");

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const BAD_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function validateMessageText(raw) {
  if (typeof raw !== "string") return { error: "Message must be text." };
  const body = raw.trim();
  if (!body) return { error: "Message cannot be empty." };
  if (BAD_CHARS.test(body)) return { error: "Message contains unsupported characters." };
  if (body.length > 2000) return { error: "Message must be at most 2000 characters." };
  return { value: body };
}

function serializeConversation(c, viewerId) {
  const viewerStr = String(viewerId);
  const custId = String(c.customer && c.customer._id ? c.customer._id : c.customer);
  const landId = String(c.landlord && c.landlord._id ? c.landlord._id : c.landlord);
  const isCustomer = custId === viewerStr;
  const prop = c.property && typeof c.property === "object" ? c.property : null;
  const other = isCustomer ? c.landlord : c.customer;

  return {
    id: String(c._id),
    propertyId: prop ? String(prop._id) : String(c.property || ""),
    property: prop ? {
      id: String(prop._id),
      title: prop.title || "Property",
      area: prop.area || "",
      city: prop.city || "",
      rent: Number(prop.rent) || 0,
      thumbnail: Array.isArray(prop.images) && prop.images[0] ? prop.images[0] : "",
      status: prop.status || ""
    } : {
      id: String(c.property || ""),
      title: "Removed listing",
      area: "", city: "", rent: 0, thumbnail: "", status: ""
    },
    counterpart: {
      id: isCustomer ? landId : custId,
      name: other && other.name ? other.name : (isCustomer ? "Landlord" : "Customer"),
      role: isCustomer ? "landlord" : "customer",
      verified: isCustomer ? !!(other && other.status === "active") : false
    },
    lastMessageText: c.lastMessageText || "",
    lastMessageAt: c.lastMessageAt || c.updatedAt,
    lastMessageSender: c.lastMessageSender ? String(c.lastMessageSender) : null,
    unreadCount: isCustomer ? (c.customerUnread || 0) : (c.landlordUnread || 0)
  };
}

function serializeMessage(m, viewerId) {
  return {
    id: String(m._id),
    conversationId: String(m.conversation),
    senderId: String(m.sender),
    isMine: String(m.sender) === String(viewerId),
    body: m.body,
    readAt: m.readAt || null,
    createdAt: m.createdAt
  };
}

async function loadConversationForParticipant(convId, userId) {
  if (!OBJECT_ID.test(String(convId))) return { status: 404, message: "Conversation not found." };
  const conv = await Conversation.findById(convId)
    .populate("property", "title area city rent images status")
    .populate("customer", "name")
    .populate("landlord", "name status");
  if (!conv) return { status: 404, message: "Conversation not found." };

  const uid = String(userId);
  const custId = String(conv.customer && conv.customer._id ? conv.customer._id : conv.customer);
  const landId = String(conv.landlord && conv.landlord._id ? conv.landlord._id : conv.landlord);
  if (uid !== custId && uid !== landId) {
    return { status: 403, message: "You do not have permission to access this conversation." };
  }
  return { conv, isCustomer: uid === custId, custId, landId };
}

function emitChatEvent(req, convId, recipientId, senderId, event, payload) {
  const io = req.app && req.app.get("io");
  if (!io) return;
  io.to(`conv:${convId}`).to(`user:${recipientId}`).to(`user:${senderId}`).emit(event, payload);
}

// GET /api/v1/chat/conversations
const listConversations = asyncHandler(async (req, res) => {
  const filter = req.user.role === "customer"
    ? { customer: req.user._id }
    : { landlord: req.user._id };

  const docs = await Conversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .populate("property", "title area city rent images status")
    .populate("customer", "name")
    .populate("landlord", "name status")
    .limit(100)
    .lean();

  const items = docs.map(c => serializeConversation(c, req.user._id));
  const totalUnread = items.reduce((s, c) => s + (c.unreadCount || 0), 0);
  res.json({ items, total: items.length, totalUnread });
});

// POST /api/v1/chat/conversations
const startOrGetConversation = asyncHandler(async (req, res) => {
  const src = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const propertyId = typeof src.propertyId === "string" ? src.propertyId.trim() : "";
  if (!OBJECT_ID.test(propertyId)) {
    return res.status(404).json({ message: "Property not found." });
  }

  // Optional initial message validation BEFORE creating conversation.
  let initialBody = null;
  if (src.message !== undefined && src.message !== null && String(src.message).trim() !== "") {
    const check = validateMessageText(src.message);
    if (check.error) return res.status(422).json({ message: check.error, errors: { message: check.error } });
    initialBody = check.value;
  }

  // Look up existing conversation for this customer + property first.
  let conv = await Conversation.findOne({ property: propertyId, customer: req.user._id });
  let created = false;

  if (!conv) {
    const property = await Property.findOne({ _id: propertyId, status: "active" }).select("_id landlord status").lean();
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }
    if (String(property.landlord) === String(req.user._id)) {
      return res.status(403).json({ message: "You cannot message yourself." });
    }

    try {
      conv = await Conversation.create({
        property: property._id,
        customer: req.user._id,
        landlord: property.landlord,
        lastMessageAt: new Date()
      });
      created = true;
    } catch (err) {
      if (err && err.code === 11000) {
        conv = await Conversation.findOne({ property: property._id, customer: req.user._id });
      } else {
        throw err;
      }
    }
  }

  if (String(conv.customer) === String(conv.landlord)) {
    return res.status(403).json({ message: "You cannot message yourself." });
  }

  let createdMsg = null;
  if (initialBody) {
    const recipientId = conv.landlord;
    createdMsg = await Message.create({
      conversation: conv._id,
      sender: req.user._id,
      recipient: recipientId,
      body: initialBody
    });
    conv = await Conversation.findByIdAndUpdate(
      conv._id,
      {
        $set: {
          lastMessageText: initialBody.slice(0, 300),
          lastMessageAt: createdMsg.createdAt,
          lastMessageSender: req.user._id
        },
        $inc: { landlordUnread: 1 }
      },
      { new: true }
    );
  }

  const populated = await Conversation.findById(conv._id)
    .populate("property", "title area city rent images status")
    .populate("customer", "name")
    .populate("landlord", "name status")
    .lean();

  const serializedConv = serializeConversation(populated, req.user._id);
  const serializedMsg = createdMsg ? serializeMessage(createdMsg, req.user._id) : null;

  if (createdMsg) {
    emitChatEvent(req, String(conv._id), String(conv.landlord), String(req.user._id), "chat:message", {
      conversationId: String(conv._id),
      message: {
        id: String(createdMsg._id),
        conversationId: String(conv._id),
        senderId: String(req.user._id),
        body: createdMsg.body,
        readAt: null,
        createdAt: createdMsg.createdAt
      }
    });
  }

  res.status(created ? 201 : 200).json({
    conversation: serializedConv,
    ...(serializedMsg ? { message: serializedMsg } : {})
  });
});

// GET /api/v1/chat/conversations/:id/messages
const getMessages = asyncHandler(async (req, res) => {
  const result = await loadConversationForParticipant(req.params.id, req.user._id);
  if (result.status) return res.status(result.status).json({ message: result.message });

  const docs = await Message.find({ conversation: result.conv._id })
    .sort({ createdAt: 1, _id: 1 })
    .limit(500)
    .lean();

  res.json({
    conversation: serializeConversation(result.conv, req.user._id),
    messages: docs.map(m => serializeMessage(m, req.user._id))
  });
});

// POST /api/v1/chat/conversations/:id/messages
const sendMessage = asyncHandler(async (req, res) => {
  const check = validateMessageText(req.body && req.body.body !== undefined ? req.body.body : (req.body && req.body.message));
  if (check.error) {
    return res.status(422).json({ message: check.error, errors: { body: check.error } });
  }

  const result = await loadConversationForParticipant(req.params.id, req.user._id);
  if (result.status) return res.status(result.status).json({ message: result.message });

  if (result.custId === result.landId) {
    return res.status(403).json({ message: "You cannot message yourself." });
  }

  const recipientId = result.isCustomer ? result.landId : result.custId;
  const unreadField = result.isCustomer ? "landlordUnread" : "customerUnread";

  const msg = await Message.create({
    conversation: result.conv._id,
    sender: req.user._id,
    recipient: recipientId,
    body: check.value
  });

  await Conversation.updateOne(
    { _id: result.conv._id },
    {
      $set: {
        lastMessageText: check.value.slice(0, 300),
        lastMessageAt: msg.createdAt,
        lastMessageSender: req.user._id
      },
      $inc: { [unreadField]: 1 }
    }
  );

  emitChatEvent(req, String(result.conv._id), recipientId, String(req.user._id), "chat:message", {
    conversationId: String(result.conv._id),
    message: {
      id: String(msg._id),
      conversationId: String(result.conv._id),
      senderId: String(req.user._id),
      body: msg.body,
      readAt: null,
      createdAt: msg.createdAt
    }
  });

  res.status(201).json({ message: serializeMessage(msg, req.user._id) });
});

// POST /api/v1/chat/conversations/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const result = await loadConversationForParticipant(req.params.id, req.user._id);
  if (result.status) return res.status(result.status).json({ message: result.message });

  const now = new Date();
  const unreadField = result.isCustomer ? "customerUnread" : "landlordUnread";
  const otherId = result.isCustomer ? result.landId : result.custId;

  await Promise.all([
    Message.updateMany(
      { conversation: result.conv._id, recipient: req.user._id, readAt: null },
      { $set: { readAt: now } }
    ),
    Conversation.updateOne(
      { _id: result.conv._id },
      { $set: { [unreadField]: 0 } }
    )
  ]);

  emitChatEvent(req, String(result.conv._id), otherId, String(req.user._id), "chat:read", {
    conversationId: String(result.conv._id),
    readerId: String(req.user._id),
    readAt: now
  });

  res.json({ ok: true, readAt: now });
});

module.exports = {
  listConversations,
  startOrGetConversation,
  getMessages,
  sendMessage,
  markAsRead,
  validateMessageText
};
