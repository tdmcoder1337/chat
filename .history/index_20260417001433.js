const express = require("express")
const http = require("http")
const path = require("path")
const fs = require("fs")
const { Server } = require("socket.io")
const bcrypt = require("bcryptjs")
const mongoose = require("mongoose")



const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || "0.0.0.0"
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/yozishmalar_tarixi"

const app = express()
const clientDist = path.join(__dirname, "client", "dist")

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
} else {
  app.use(express.static(path.join(__dirname)))
}

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: "*" }
})

const userSchema = new mongoose.Schema(
  {
    login: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "" }
  },
  { timestamps: true }
)

const directMessageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },
    image: { type: String, default: "" }
  },
  { timestamps: true }
)

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }]
  },
  { timestamps: true }
)

const groupMessageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },
    image: { type: String, default: "" }
  },
  { timestamps: true }
)

const User = mongoose.model("User", userSchema)
const DirectMessage = mongoose.model("DirectMessage", directMessageSchema)
const Group = mongoose.model("Group", groupSchema)
const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema)

app.get("/", (req, res) => {
  if (fs.existsSync(clientDist)) {
    res.sendFile(path.join(clientDist, "index.html"))
    return
  }
  res.sendFile(path.join(__dirname, "index.html"))
})

function clean(value, max = 100) {
  return String(value || "").trim().slice(0, max)
}

function userRoom(userId) {
  return `user:${String(userId)}`
}

function asId(value) {
  try {
    return new mongoose.Types.ObjectId(String(value))
  } catch {
    return null
  }
}

function safeImage(value) {
  if (typeof value !== "string") return ""
  const image = value.trim()
  if (!image) return ""
  if (!image.startsWith("data:image/")) return ""
  if (image.length > 3_000_000) return ""
  return image
}

function serializeUser(user) {
  return {
    id: String(user._id),
    login: user.login,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    avatar: user.avatar || "",
    bio: user.bio || ""
  }
}

function serializeGroup(group) {
  const members = (group.members || []).map((member) => ({
    id: String(member._id),
    login: member.login,
    firstName: member.firstName,
    lastName: member.lastName,
    fullName: `${member.firstName} ${member.lastName}`.trim()
  }))

  return {
    id: String(group._id),
    name: group.name,
    ownerId: String(group.owner),
    members
  }
}

function normalizeDirectMessage(message) {
  return {
    id: String(message._id),
    fromId: String(message.from._id),
    toId: String(message.to._id),
    text: message.text || "",
    image: message.image || "",
    createdAt: message.createdAt,
    sender: {
      id: String(message.from._id),
      login: message.from.login,
      fullName: `${message.from.firstName} ${message.from.lastName}`.trim()
    }
  }
}

function normalizeGroupMessage(message) {
  return {
    id: String(message._id),
    groupId: String(message.group),
    text: message.text || "",
    image: message.image || "",
    createdAt: message.createdAt,
    sender: {
      id: String(message.sender._id),
      login: message.sender.login,
      fullName: `${message.sender.firstName} ${message.sender.lastName}`.trim()
    }
  }
}

async function buildBootstrap(userId) {
  const meId = asId(userId)
  if (!meId) return { users: [], groups: [] }

  const [users, groups] = await Promise.all([
    User.find({ _id: { $ne: meId } }).sort({ firstName: 1, lastName: 1 }).lean(),
    Group.find({ members: meId })
      .populate("members", "login firstName lastName")
      .sort({ updatedAt: -1 })
      .lean()
  ])

  return {
    users: users.map(serializeUser),
    groups: groups.map(serializeGroup)
  }
}

async function emitBootstrapToUser(userId) {
  try {
    const payload = await buildBootstrap(userId)
    io.to(userRoom(userId)).emit("chat_bootstrap", payload)
  } catch {
    io.to(userRoom(userId)).emit("auth_error", "Chat ma'lumotlarini yuklashda xatolik.")
  }
}

async function emitBootstrapToUsers(userIds) {
  const uniqueIds = [...new Set((userIds || []).map((id) => String(id)))]
  await Promise.all(uniqueIds.map((id) => emitBootstrapToUser(id)))
}

io.on("connection", (socket) => {
  socket.on("auth_login", async (payload = {}) => {
    const login = clean(payload.login, 30).toLowerCase()
    const password = clean(payload.password, 60)

    if (!login || !password) {
      socket.emit("auth_error", "Login va parol majburiy.")
      return
    }

    const existing = await User.findOne({ login }).lean().catch(() => null)
    if (!existing) {
      socket.emit("auth_register_required", { login })
      return
    }

    const match = await bcrypt.compare(password, existing.passwordHash).catch(() => false)
    if (!match) {
      socket.emit("auth_error", "Parol noto'g'ri.")
      return
    }

    socket.data.user = serializeUser(existing)
    socket.join(userRoom(existing._id))

    socket.emit("auth_success", socket.data.user)
    await emitBootstrapToUser(existing._id)
  })

  socket.on("auth_register", async (payload = {}) => {
    const firstName = clean(payload.firstName, 30)
    const lastName = clean(payload.lastName, 30)
    const login = clean(payload.login, 30).toLowerCase()
    const password = clean(payload.password, 60)
    const avatar = safeImage(payload.avatar)
    const bio = clean(payload.bio, 220)

    if (!firstName || !lastName || !login || !password) {
      socket.emit("auth_error", "Ro'yxatdan o'tish uchun barcha maydonlarni to'ldiring.")
      return
    }

    const existing = await User.findOne({ login }).lean().catch(() => null)
    if (existing) {
      socket.emit("auth_error", "Bu login band. Boshqasini tanlang.")
      return
    }

    const passwordHash = await bcrypt.hash(password, 10).catch(() => "")
    if (!passwordHash) {
      socket.emit("auth_error", "Parolni saqlashda xatolik bo'ldi.")
      return
    }

    const created = await User.create({ firstName, lastName, login, passwordHash, avatar, bio }).catch(() => null)
    if (!created) {
      socket.emit("auth_error", "Foydalanuvchini saqlashda xatolik bo'ldi.")
      return
    }

    socket.data.user = serializeUser(created)
    socket.join(userRoom(created._id))

    socket.emit("auth_success", socket.data.user)
    await emitBootstrapToUser(created._id)
  })

  socket.on("profile_update", async (payload = {}) => {
    if (!socket.data.user) {
      socket.emit("auth_error", "Avval tizimga kiring.")
      return
    }

    const meId = asId(socket.data.user.id)
    if (!meId) return

    const avatar = safeImage(payload.avatar)
    const bio = clean(payload.bio, 220)

    const updated = await User.findByIdAndUpdate(
      meId,
      { avatar, bio },
      { new: true, runValidators: true }
    ).lean().catch(() => null)

    if (!updated) {
      socket.emit("profile_error", "Profilni yangilashda xatolik bo'ldi.")
      return
    }

    socket.data.user = serializeUser(updated)
    socket.emit("profile_update_success", socket.data.user)

    const allUserIds = await User.distinct("_id").catch(() => [])
    await emitBootstrapToUsers(allUserIds)
  })

  socket.on("direct_history", async ({ peerId } = {}) => {
    if (!socket.data.user) {
      socket.emit("auth_error", "Avval tizimga kiring.")
      return
    }

    const meId = asId(socket.data.user.id)
    const otherId = asId(peerId)
    if (!meId || !otherId) return

    const messages = await DirectMessage.find({
      $or: [
        { from: meId, to: otherId },
        { from: otherId, to: meId }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate("from", "login firstName lastName")
      .populate("to", "login firstName lastName")
      .lean()
      .catch(() => [])

    socket.emit("direct_history", {
      peerId: String(otherId),
      messages: messages.map(normalizeDirectMessage)
    })
  })

  socket.on("direct_send", async (payload = {}) => {
    if (!socket.data.user) {
      socket.emit("auth_error", "Avval tizimga kiring.")
      return
    }

    const meId = asId(socket.data.user.id)
    const otherId = asId(payload.peerId)
    const text = clean(payload.text, 2000)
    const image = safeImage(payload.image)
    if (!meId || !otherId || (!text && !image)) return

    const peerUser = await User.findById(otherId).lean().catch(() => null)
    if (!peerUser) {
      socket.emit("auth_error", "Tanlangan user topilmadi.")
      return
    }

    const created = await DirectMessage.create({
      from: meId,
      to: otherId,
      text,
      image
    }).catch(() => null)
    if (!created) {
      socket.emit("auth_error", "Xabar yuborishda xatolik bo'ldi.")
      return
    }

    const message = {
      id: String(created._id),
      fromId: String(meId),
      toId: String(otherId),
      text,
      image,
      createdAt: created.createdAt,
      sender: {
        id: socket.data.user.id,
        login: socket.data.user.login,
        fullName: socket.data.user.fullName
      }
    }

    io.to(userRoom(meId)).to(userRoom(otherId)).emit("direct_message", message)
  })

  socket.on("group_create", async (payload = {}) => {
    if (!socket.data.user) {
      socket.emit("auth_error", "Avval tizimga kiring.")
      return
    }

    const meId = asId(socket.data.user.id)
    const name = clean(payload.name, 60)
    const candidateIds = Array.isArray(payload.memberIds) ? payload.memberIds : []
    const parsedCandidateIds = candidateIds.map(asId).filter(Boolean).map(String)
    const allMemberIds = [...new Set([String(meId), ...parsedCandidateIds])]

    if (!name || allMemberIds.length < 2) {
      socket.emit("auth_error", "Guruh nomi va kamida 2 ta user kerak.")
      return
    }

    const users = await User.find({ _id: { $in: allMemberIds } }, "_id").lean().catch(() => [])
    if (users.length !== allMemberIds.length) {
      socket.emit("auth_error", "Ba'zi userlar topilmadi.")
      return
    }

    const group = await Group.create({
      name,
      owner: meId,
      members: allMemberIds
    }).catch(() => null)

    if (!group) {
      socket.emit("auth_error", "Guruh yaratishda xatolik.")
      return
    }

    await emitBootstrapToUsers(allMemberIds)
  })

  socket.on("group_add_member", async (payload = {}) => {
    if (!socket.data.user) {
      socket.emit("auth_error", "Avval tizimga kiring.")
      return
    }

    const meId = asId(socket.data.user.id)
    const groupId = asId(payload.groupId)
    const newUserId = asId(payload.userId)
    if (!meId || !groupId || !newUserId) return

    const group = await Group.findById(groupId).lean().catch(() => null)
    if (!group) {
      socket.emit("auth_error", "Guruh topilmadi.")
      return
    }

    const isMember = (group.members || []).map(String).includes(String(meId))
    if (!isMember) {
      socket.emit("auth_error", "Bu guruhga qo'shish uchun a'zo bo'lishingiz kerak.")
      return
    }

    await Group.updateOne({ _id: groupId }, { $addToSet: { members: newUserId }, $set: { updatedAt: new Date() } }).catch(() => null)

    const refreshed = await Group.findById(groupId).lean().catch(() => null)
    if (!refreshed) return
    const ids = (refreshed.members || []).map(String)
    await emitBootstrapToUsers(ids)
  })

  socket.on("group_history", async ({ groupId } = {}) => {
    if (!socket.data.user) {
      socket.emit("auth_error", "Avval tizimga kiring.")
      return
    }

    const meId = asId(socket.data.user.id)
    const groupObjectId = asId(groupId)
    if (!meId || !groupObjectId) return

    const group = await Group.findById(groupObjectId).lean().catch(() => null)
    if (!group) return
    const isMember = (group.members || []).map(String).includes(String(meId))
    if (!isMember) return

    const messages = await GroupMessage.find({ group: groupObjectId })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate("sender", "login firstName lastName")
      .lean()
      .catch(() => [])

    socket.emit("group_history", {
      groupId: String(groupObjectId),
      messages: messages.map(normalizeGroupMessage)
    })
  })

  socket.on("group_send", async (payload = {}) => {
    if (!socket.data.user) {
      socket.emit("auth_error", "Avval tizimga kiring.")
      return
    }

    const meId = asId(socket.data.user.id)
    const groupId = asId(payload.groupId)
    const text = clean(payload.text, 2000)
    const image = safeImage(payload.image)
    if (!meId || !groupId || (!text && !image)) return

    const group = await Group.findById(groupId).lean().catch(() => null)
    if (!group) return
    const memberIds = (group.members || []).map(String)
    if (!memberIds.includes(String(meId))) {
      socket.emit("auth_error", "Bu guruhga xabar yubora olmaysiz.")
      return
    }

    const created = await GroupMessage.create({
      group: groupId,
      sender: meId,
      text,
      image
    }).catch(() => null)

    if (!created) {
      socket.emit("auth_error", "Guruhga xabar yuborishda xatolik.")
      return
    }

    await Group.updateOne({ _id: groupId }, { $set: { updatedAt: new Date() } }).catch(() => null)

    const message = {
      id: String(created._id),
      groupId: String(groupId),
      text,
      image,
      createdAt: created.createdAt,
      sender: {
        id: socket.data.user.id,
        login: socket.data.user.login,
        fullName: socket.data.user.fullName
      }
    }

    for (const memberId of memberIds) {
      io.to(userRoom(memberId)).emit("group_message", message)
    }
  })
})

async function start() {
  try {
    await mongoose.connect(MONGO_URI)
    console.log(`MongoDB ulandi: ${MONGO_URI}`)

    server.listen(PORT, HOST, () => {
      console.log(`Server ishga tushdi: http://${HOST}:${PORT}`)
    })
  } catch (error) {
    console.error("MongoDB ulanish xatosi:", error.message)
    process.exit(1)
  }
}



app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

start()
