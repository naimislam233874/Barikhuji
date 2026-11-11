"use strict";
const http = require("http");
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const TEST_URI = process.env.TEST_MONGODB_URI || "";
let supertest, mongoose, bcrypt, WebSocket;
try {
  supertest = require("supertest");
  mongoose = require("mongoose");
  bcrypt = require("bcryptjs");
  WebSocket = require("ws");
} catch (_) {}

const dbName = TEST_URI.replace(/^mongodb(\+srv)?:\/\/[^/]*\/?/, "").split("?")[0];
const skip = !supertest || !bcrypt || !WebSocket ? "dependencies not installed"
  : !TEST_URI ? "TEST_MONGODB_URI is not set"
  : !/test/i.test(dbName) ? 'TEST_MONGODB_URI database name must contain "test"' : false;

const API = "/api/v1", ORIGIN = "http://localhost:5500", PASSWORD = "Str0ngPass!9";
const today = new Date().toISOString().slice(0, 10);

describe("customer-landlord chat & Socket.IO (integration)", { skip }, () => {
  let app, server, io, port;
  let User, Property, Conversation, Message;
  let customer1, customer2, landlord1, landlord2, admin;
  let propDoc;

  async function signIn(portal, email) {
    const ag = supertest.agent(app);
    const csrf0 = (await ag.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    const r = await ag.post(`${API}/auth/${portal}/login`).set("Origin", ORIGIN).set("X-CSRF-Token", csrf0).send({ email, password: PASSWORD });
    assert.equal(r.status, 200);
    const cookieHeader = (r.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
    return { ag, csrf: r.body.csrfToken, cookieHeader, id: r.body.user.id };
  }
  const call = (s, method, path, body) => {
    let rq = s.ag[method](`${API}${path}`).set("Origin", ORIGIN);
    if (method !== "get") rq = rq.set("X-CSRF-Token", s.csrf);
    return body === undefined ? rq : rq.send(body);
  };

  before(async () => {
    const { loadConfig } = require("../../config/env");
    const { connectDb } = require("../../config/db");
    const { createApp } = require("../../app");
    const { initSocket } = require("../../socket");
    User = require("../../models/User");
    Property = require("../../models/Property");
    Conversation = require("../../models/Conversation");
    Message = require("../../models/Message");

    const config = loadConfig({
      NODE_ENV: "test", MONGODB_URI: TEST_URI, FRONTEND_ORIGIN: ORIGIN, BCRYPT_ROUNDS: "4",
      RATE_LIMIT_LOGIN_IP_MAX: "1000", RATE_LIMIT_LOGIN_EMAIL_MAX: "1000", RATE_LIMIT_REGISTER_MAX: "1000"
    });
    await connectDb(config.mongoUri);
    await Promise.all([User.init(), Property.init(), Conversation.init(), Message.init()]);
    await Promise.all([
      User.deleteMany({}), Property.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({}),
      mongoose.connection.collection("sessions").deleteMany({})
    ]);

    app = createApp(config);
    server = http.createServer(app);
    io = initSocket(server, config, app.sessionMiddleware);
    app.set("io", io);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const [uL1] = await User.create([
      { name: "Chat Landlord 1", email: "chat.l1@example.com", phone: "01730000001", passwordHash, role: "landlord", status: "active" },
      { name: "Chat Landlord 2", email: "chat.l2@example.com", phone: "01730000002", passwordHash, role: "landlord", status: "active" },
      { name: "Chat Customer 1", email: "chat.c1@example.com", phone: "01830000001", passwordHash, role: "customer", status: "active" },
      { name: "Chat Customer 2", email: "chat.c2@example.com", phone: "01830000002", passwordHash, role: "customer", status: "active" },
      { name: "Chat Admin", email: "chat.adm@example.com", phone: "01930000001", passwordHash, role: "admin", status: "active" }
    ]);

    landlord1 = await signIn("landlord", "chat.l1@example.com");
    landlord2 = await signIn("landlord", "chat.l2@example.com");
    customer1 = await signIn("customer", "chat.c1@example.com");
    customer2 = await signIn("customer", "chat.c2@example.com");
    admin = await signIn("admin", "chat.adm@example.com");

    propDoc = await Property.create({
      landlord: uL1._id,
      title: "Chat Test Studio in Uttara",
      description: "Clean modern studio flat close to Uttara Sector 7 main road and metro.",
      type: "Studio", furnished: "Furnished", city: "Dhaka", area: "Uttara",
      rent: 15000, deposit: 30000, bedrooms: 1, bathrooms: 1, availableFrom: today,
      suitableFor: ["Bachelor"], images: ["https://images.example.com/studio.jpg"], status: "active"
    });
  });

  after(async () => {
    if (io) io.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await Promise.all([
      User.deleteMany({}), Property.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({}),
      mongoose.connection.collection("sessions").deleteMany({})
    ]);
    await mongoose.disconnect();
  });

  test("authorization: anonymous, admin, and self-chat are rejected", async () => {
    assert.equal((await supertest(app).get(`${API}/chat/conversations`)).status, 401);
    assert.equal((await call(admin, "get", "/chat/conversations")).status, 403);
    assert.equal((await call(landlord1, "post", "/chat/conversations", { propertyId: String(propDoc._id), message: "hi" })).status, 403);
  });

  test("message persistence, chronological order, unread indicators, read status, and strict participant authorization", async () => {
    // Customer 1 starts conversation with initial message
    const start = await call(customer1, "post", "/chat/conversations", {
      propertyId: String(propDoc._id),
      message: "Hello, is this studio still available?"
    });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    const convId = start.body.conversation.id;
    assert.equal(start.body.message.body, "Hello, is this studio still available?");
    assert.ok(start.body.message.createdAt);

    // Landlord 1 sees unread count = 1 and property metadata
    const lConvs = await call(landlord1, "get", "/chat/conversations");
    assert.equal(lConvs.status, 200);
    assert.equal(lConvs.body.totalUnread, 1);
    assert.equal(lConvs.body.items[0].property.title, "Chat Test Studio in Uttara");
    assert.equal(lConvs.body.items[0].property.thumbnail, "https://images.example.com/studio.jpg");
    assert.equal(lConvs.body.items[0].unreadCount, 1);

    // Unauthorized access blocked: Customer 2 and Landlord 2 get 403
    for (const intruder of [customer2, landlord2, admin]) {
      assert.equal((await call(intruder, "get", `/chat/conversations/${convId}/messages`)).status, intruder === admin ? 403 : 403);
      assert.equal((await call(intruder, "post", `/chat/conversations/${convId}/messages`, { body: "snooping" })).status, 403);
      assert.equal((await call(intruder, "post", `/chat/conversations/${convId}/read`)).status, 403);
    }

    // Message content validation
    for (const bad of ["", "   ", "x".repeat(2001), "bad\u0000msg"]) {
      const r = await call(landlord1, "post", `/chat/conversations/${convId}/messages`, { body: bad });
      assert.equal(r.status, 422);
    }

    // Landlord marks as read and replies
    const readRes = await call(landlord1, "post", `/chat/conversations/${convId}/read`);
    assert.equal(readRes.status, 200);
    assert.equal((await call(landlord1, "get", "/chat/conversations")).body.totalUnread, 0);

    const reply = await call(landlord1, "post", `/chat/conversations/${convId}/messages`, {
      body: "Yes, it is available from next week."
    });
    assert.equal(reply.status, 201);

    // Customer 1 sees unreadCount = 1 and messages in chronological order
    const cConvs = await call(customer1, "get", "/chat/conversations");
    assert.equal(cConvs.body.totalUnread, 1);

    const history = await call(customer1, "get", `/chat/conversations/${convId}/messages`);
    assert.equal(history.status, 200);
    assert.equal(history.body.messages.length, 2);
    assert.equal(history.body.messages[0].isMine, true);
    assert.ok(history.body.messages[0].readAt); // landlord marked it read!
    assert.equal(history.body.messages[1].isMine, false);
    assert.equal(history.body.messages[1].body, "Yes, it is available from next week.");
    assert.ok(new Date(history.body.messages[0].createdAt) <= new Date(history.body.messages[1].createdAt));
  });

  test("real-time Socket.IO delivers chat:message to authenticated participant and rejects anonymous sockets", async () => {
    const convs = await call(customer1, "get", "/chat/conversations");
    const convId = convs.body.items[0].id;

    // Anonymous socket rejected with Socket.IO connect error (44...)
    const anonMsg = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`, { headers: { Origin: ORIGIN } });
      ws.on("message", data => {
        const s = data.toString();
        if (s.startsWith("0")) ws.send("40");
        else if (s.startsWith("44")) { ws.close(); resolve(s); }
      });
      ws.on("error", reject);
    });
    assert.match(anonMsg, /Authentication required/);

    // Authenticated customer socket joins conversation and receives landlord's real-time reply
    const received = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`, {
        headers: { Origin: ORIGIN, Cookie: customer1.cookieHeader }
      });
      const timer = setTimeout(() => { ws.close(); reject(new Error("Timed out waiting for chat:message")); }, 5000);
      ws.on("message", async data => {
        const s = data.toString();
        if (s.startsWith("0")) {
          ws.send("40");
        } else if (s.startsWith("40")) {
          ws.send(`42["chat:join","${convId}"]`);
          // Send message via REST from landlord1
          await call(landlord1, "post", `/chat/conversations/${convId}/messages`, { body: "Live socket ping!" });
        } else if (s.startsWith('42["chat:message"')) {
          clearTimeout(timer);
          ws.close();
          resolve(s);
        }
      });
      ws.on("error", err => { clearTimeout(timer); reject(err); });
    });

    assert.match(received, /Live socket ping!/);
  });
});
