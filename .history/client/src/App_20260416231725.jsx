import { useEffect, useMemo, useRef, useState } from "react"
import { io } from "socket.io-client"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:3000`

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })
}

function toMessageWithFlag(message, myId) {
  return {
    ...message,
    isMine: message.sender?.id === myId
  }
}

export default function App() {
  const socketRef = useRef(null)
  const messagesRef = useRef(null)
  const myIdRef = useRef("")

  const [isConnected, setIsConnected] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [authOpen, setAuthOpen] = useState(true)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [pendingLogin, setPendingLogin] = useState("")
  const [authError, setAuthError] = useState("")

  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [registerAvatar, setRegisterAvatar] = useState("")
  const [registerAvatarName, setRegisterAvatarName] = useState("")
  const [registerBio, setRegisterBio] = useState("")
  const [profileAvatar, setProfileAvatar] = useState("")
  const [profileAvatarName, setProfileAvatarName] = useState("")
  const [profileBio, setProfileBio] = useState("")

  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [activeTab, setActiveTab] = useState("direct")
  const [selectedDirectId, setSelectedDirectId] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState("")

  const [directMessagesMap, setDirectMessagesMap] = useState({})
  const [groupMessagesMap, setGroupMessagesMap] = useState({})

  const [composerText, setComposerText] = useState("")
  const [composerImage, setComposerImage] = useState("")
  const [composerImageName, setComposerImageName] = useState("")
  const [chatError, setChatError] = useState("")

  const [groupName, setGroupName] = useState("")
  const [newGroupMemberIds, setNewGroupMemberIds] = useState([])
  const [groupAddUserId, setGroupAddUserId] = useState("")

  const myId = currentUser?.id || ""

  useEffect(() => {
    myIdRef.current = myId
  }, [myId])

  useEffect(() => {
    if (currentUser) {
      setProfileAvatar(currentUser.avatar || "")
      setProfileBio(currentUser.bio || "")
      setProfileAvatarName("")
    }
  }, [currentUser])

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] })
    socketRef.current = socket

    const onConnect = () => {
      setIsConnected(true)
      setAuthError("")
    }
    const onDisconnect = () => {
      setIsConnected(false)
    }
    const onConnectError = () => {
      setIsConnected(false)
      setAuthError("Serverga ulanib bo'lmadi. Backendni tekshiring.")
    }

    const onAuthSuccess = (user) => {
      setCurrentUser(user)
      setAuthOpen(false)
      setRegisterOpen(false)
      setAuthError("")
      setChatError("")
    }

    const onRegisterRequired = ({ login: missingLogin }) => {
      setPendingLogin(missingLogin || "")
      setRegisterOpen(true)
      setAuthError("Bu login topilmadi. Ro'yxatdan o'ting.")
    }

    const onAuthError = (message) => {
      setAuthError(message || "Xatolik yuz berdi.")
      setChatError(message || "Xatolik yuz berdi.")
    }

    const onBootstrap = ({ users: nextUsers = [], groups: nextGroups = [] } = {}) => {
      setUsers(nextUsers)
      setGroups(nextGroups)

      setSelectedDirectId((prev) => {
        if (prev && nextUsers.some((u) => u.id === prev)) return prev
        return nextUsers[0]?.id || ""
      })

      setSelectedGroupId((prev) => {
        if (prev && nextGroups.some((g) => g.id === prev)) return prev
        return nextGroups[0]?.id || ""
      })
    }

    const onDirectHistory = ({ peerId, messages = [] } = {}) => {
      if (!peerId || !myIdRef.current) return
      setDirectMessagesMap((prev) => ({
        ...prev,
        [peerId]: messages.map((m) => toMessageWithFlag(m, myIdRef.current))
      }))
    }

    const onDirectMessage = (message) => {
      if (!myIdRef.current) return
      const peerId = message.fromId === myIdRef.current ? message.toId : message.fromId
      if (!peerId) return
      setDirectMessagesMap((prev) => ({
        ...prev,
        [peerId]: [...(prev[peerId] || []), toMessageWithFlag(message, myIdRef.current)]
      }))
    }

    const onGroupHistory = ({ groupId, messages = [] } = {}) => {
      if (!groupId || !myIdRef.current) return
      setGroupMessagesMap((prev) => ({
        ...prev,
        [groupId]: messages.map((m) => toMessageWithFlag(m, myIdRef.current))
      }))
    }

    const onGroupMessage = (message) => {
      if (!myIdRef.current || !message.groupId) return
      setGroupMessagesMap((prev) => ({
        ...prev,
        [message.groupId]: [...(prev[message.groupId] || []), toMessageWithFlag(message, myIdRef.current)]
      }))
    }

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("connect_error", onConnectError)
    socket.on("auth_success", onAuthSuccess)
    socket.on("auth_register_required", onRegisterRequired)
    socket.on("auth_error", onAuthError)
    socket.on("profile_update_success", onAuthSuccess)
    socket.on("profile_error", (message) => setChatError(message || "Profilni yangilashda xato."))
    socket.on("chat_bootstrap", onBootstrap)
    socket.on("direct_history", onDirectHistory)
    socket.on("direct_message", onDirectMessage)
    socket.on("group_history", onGroupHistory)
    socket.on("group_message", onGroupMessage)

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!currentUser || !socketRef.current || !isConnected) return
    if (activeTab !== "direct" || !selectedDirectId) return
    socketRef.current.emit("direct_history", { peerId: selectedDirectId })
  }, [activeTab, selectedDirectId, currentUser, isConnected])

  useEffect(() => {
    if (!currentUser || !socketRef.current || !isConnected) return
    if (activeTab !== "group" || !selectedGroupId) return
    socketRef.current.emit("group_history", { groupId: selectedGroupId })
  }, [activeTab, selectedGroupId, currentUser, isConnected])

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [directMessagesMap, groupMessagesMap, selectedDirectId, selectedGroupId, activeTab])

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedDirectId) || null,
    [users, selectedDirectId]
  )
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  )

  const currentMessages = useMemo(() => {
    if (activeTab === "direct" && selectedDirectId) {
      return directMessagesMap[selectedDirectId] || []
    }
    if (activeTab === "group" && selectedGroupId) {
      return groupMessagesMap[selectedGroupId] || []
    }
    return []
  }, [activeTab, selectedDirectId, selectedGroupId, directMessagesMap, groupMessagesMap])

  const groupCandidates = useMemo(() => {
    if (!selectedGroup) return []
    const memberIds = new Set((selectedGroup.members || []).map((m) => m.id))
    return users.filter((u) => !memberIds.has(u.id))
  }, [users, selectedGroup])

  const ensureSocketConnected = () => {
    if (!socketRef.current) return false
    if (socketRef.current.connected) return true
    socketRef.current.connect?.()
    return false
  }

  const handleLogin = () => {
    setAuthError("")
    setRegisterOpen(false)
    if (!login.trim() || !password.trim()) {
      setAuthError("Login va parol kiriting.")
      return
    }

    const cleanLogin = login.trim().toLowerCase()
    setPendingLogin(cleanLogin)

    if (!ensureSocketConnected()) {
      setAuthError("Serverga ulanmagan. Birozdan keyin qayta urinib ko'ring.")
    }

    socketRef.current.emit("auth_login", { login: cleanLogin, password: password.trim() })
  }

  const handleRegister = () => {
    setAuthError("")
    const cleanLogin = (pendingLogin || login).trim().toLowerCase()
    if (!cleanLogin || !password.trim() || !firstName.trim() || !lastName.trim()) {
      setAuthError("Ro'yxatdan o'tish maydonlarini to'ldiring.")
      return
    }

    if (!ensureSocketConnected()) {
      setAuthError("Serverga ulanmagan. Birozdan keyin qayta urinib ko'ring.")
    }

    socketRef.current.emit("auth_register", {
      login: cleanLogin,
      password: password.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      avatar: registerAvatar,
      bio: registerBio
    })
  }

  const handleProfileUpdate = () => {
    setChatError("")
    if (!socketRef.current || !isConnected || !currentUser) {
      setChatError("Serverga ulanmagan yoki login qilingan yo'q.")
      return
    }
    socketRef.current.emit("profile_update", {
      avatar: profileAvatar,
      bio: profileBio
    })
  }

  const handleComposerImage = (event) => {
    setChatError("")
    const file = event.target.files && event.target.files[0]
    if (!file) {
      setComposerImage("")
      setComposerImageName("")
      return
    }

    if (!file.type.startsWith("image/")) {
      setChatError("Faqat rasm fayl yuboring.")
      event.target.value = ""
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setChatError("Rasm 2MB dan kichik bo'lsin.")
      event.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setComposerImage(String(reader.result || ""))
      setComposerImageName(file.name)
    }
    reader.readAsDataURL(file)
  }

  const handleRegisterAvatar = (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file) {
      setRegisterAvatar("")
      setRegisterAvatarName("")
      return
    }

    if (!file.type.startsWith("image/")) {
      setAuthError("Profilga faqat rasm yuklang.")
      event.target.value = ""
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setAuthError("Profil rasmi 2MB dan kichik bo'lsin.")
      event.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setRegisterAvatar(String(reader.result || ""))
      setRegisterAvatarName(file.name)
    }
    reader.readAsDataURL(file)
  }

  const handleProfileAvatar = (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file) {
      setProfileAvatar("")
      setProfileAvatarName("")
      return
    }

    if (!file.type.startsWith("image/")) {
      setChatError("Profilga faqat rasm yuklang.")
      event.target.value = ""
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setChatError("Profil rasmi 2MB dan kichik bo'lsin.")
      event.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setProfileAvatar(String(reader.result || ""))
      setProfileAvatarName(file.name)
    }
    reader.readAsDataURL(file)
  }

  const clearComposer = () => {
    setComposerText("")
    setComposerImage("")
    setComposerImageName("")
    const picker = document.getElementById("composerImageInput")
    if (picker) picker.value = ""
  }

  const sendCurrentMessage = () => {
    setChatError("")
    if (!currentUser) {
      setChatError("Avval tizimga kiring.")
      return
    }
    if (!socketRef.current || !isConnected) {
      setChatError("Serverga ulanmagan.")
      return
    }

    const text = composerText.trim()
    if (!text && !composerImage) {
      setChatError("Xabar yoki rasm yuboring.")
      return
    }

    if (activeTab === "direct") {
      if (!selectedDirectId) {
        setChatError("User tanlang.")
        return
      }
      socketRef.current.emit("direct_send", {
        peerId: selectedDirectId,
        text,
        image: composerImage
      })
      clearComposer()
      return
    }

    if (activeTab === "group") {
      if (!selectedGroupId) {
        setChatError("Guruh tanlang.")
        return
      }
      socketRef.current.emit("group_send", {
        groupId: selectedGroupId,
        text,
        image: composerImage
      })
      clearComposer()
    }
  }

  const createGroup = () => {
    setChatError("")
    if (!groupName.trim()) {
      setChatError("Guruh nomini kiriting.")
      return
    }
    if (newGroupMemberIds.length === 0) {
      setChatError("Kamida bitta user tanlang.")
      return
    }
    if (!socketRef.current || !isConnected) {
      setChatError("Serverga ulanmagan.")
      return
    }
    socketRef.current.emit("group_create", {
      name: groupName.trim(),
      memberIds: newGroupMemberIds
    })
    setGroupName("")
    setNewGroupMemberIds([])
  }

  const addUserToGroup = () => {
    if (!selectedGroupId || !groupAddUserId) return
    if (!socketRef.current || !isConnected) {
      setChatError("Serverga ulanmagan.")
      return
    }
    socketRef.current.emit("group_add_member", {
      groupId: selectedGroupId,
      userId: groupAddUserId
    })
    setGroupAddUserId("")
  }

  return (
    <>
      {authOpen && (
        <div className="overlay">
          <div className="auth-card">
            <h2>Tizimga kirish</h2>
            <p>Login orqali kiring. Topilmasa ro'yxatdan o'ting.</p>
            <div className="form">
              <input
                className="input"
                placeholder="Login"
                maxLength="30"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Parol"
                maxLength="60"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <button className="btn auth-btn" onClick={handleLogin}>Kirish</button>
            </div>

            {registerOpen && (
              <div className="register">
                <p>Akkaunt topilmadi, ro'yxatdan o'ting:</p>
                <div className="form">
                  <input
                    className="input"
                    placeholder="Ism"
                    maxLength="30"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Familya"
                    maxLength="30"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                  <label className="btn btn-file" htmlFor="registerAvatarInput">
                    Profil rasmi
                  </label>
                  <input
                    id="registerAvatarInput"
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleRegisterAvatar}
                  />
                  <span className="small">{registerAvatarName || "Rasm yoki Avatar tanlanmagan"}</span>
                  <textarea
                    className="input"
                    placeholder="Bio (ixtiyoriy)"
                    value={registerBio}
                    maxLength={220}
                    onChange={(e) => setRegisterBio(e.target.value)}
                  />
                  <button className="btn auth-btn" onClick={handleRegister}>Ro'yxatdan o'tish</button>
                </div>
              </div>
            )}

            <div className="error">{authError}</div>
          </div>
        </div>
      )}

      <main className="app app-wide">
        <aside className="sidebar">
          {currentUser && (
            <div className="profile-panel">
              <div className="profile-card">
                <img
                  className="avatar avatar-lg"
                  src={currentUser.avatar || "https://via.placeholder.com/96?text=User"}
                  alt="Profil"
                />
                <div>
                  <strong>{currentUser.fullName}</strong>
                  <span>@{currentUser.login}</span>
                  <p>{currentUser.bio || "Bio yozilmagan."}</p>
                </div>
              </div>
              <div className="profile-editor">
                <label className="btn btn-file" htmlFor="profileAvatarInput">
                  Avatar yangilash
                </label>
                <input
                  id="profileAvatarInput"
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleProfileAvatar}
                />
                <textarea
                  className="input"
                  placeholder="Bio yangilang (ixtiyoriy)"
                  value={profileBio}
                  maxLength={220}
                  onChange={(e) => setProfileBio(e.target.value)}
                />
                <button className="btn btn-send" onClick={handleProfileUpdate}>Profilni saqlash</button>
              </div>
            </div>
          )}

          <div className="tabs">
            <button
              className={`tab-btn ${activeTab === "direct" ? "active" : ""}`}
              onClick={() => setActiveTab("direct")}
            >
              Userlar
            </button>
            <button
              className={`tab-btn ${activeTab === "group" ? "active" : ""}`}
              onClick={() => setActiveTab("group")}
            >
              Guruhlar
            </button>
          </div>

          {activeTab === "direct" && (
            <ul className="list">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    className={`list-item ${selectedDirectId === u.id ? "active" : ""}`}
                    onClick={() => setSelectedDirectId(u.id)}
                  >
                    <div className="user-item">
                      <img
                        className="avatar avatar-sm"
                        src={u.avatar || "https://via.placeholder.com/40?text=U"}
                        alt={u.fullName}
                      />
                      <div>
                        <strong>{u.fullName}</strong>
                        <span>@{u.login}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {activeTab === "group" && (
            <>
              <ul className="list">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      className={`list-item ${selectedGroupId === g.id ? "active" : ""}`}
                      onClick={() => setSelectedGroupId(g.id)}
                    >
                      <strong>{g.name}</strong>
                      <span>{(g.members || []).length} a'zo</span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="group-maker">
                <h4>Yangi Guruh</h4>
                <input
                  className="input"
                  placeholder="Guruh nomi"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
                <select
                  className="input"
                  multiple
                  value={newGroupMemberIds}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((o) => o.value)
                    setNewGroupMemberIds(values)
                  }}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} (@{u.login})
                    </option>
                  ))}
                </select>
                <button className="btn btn-send" onClick={createGroup}>Guruh yaratish</button>
              </div>
            </>
          )}
        </aside>

        <section className="chat-panel">
          <header className="topbar">
            <h1 className="title">
              {activeTab === "direct"
                ? selectedUser?.fullName || "User tanlang"
                : selectedGroup?.name || "Guruh tanlang"}
            </h1>
            <span className="me">
              {isConnected ? "Online" : "Offline"} | {currentUser?.firstName || currentUser?.login || ""}
            </span>
          </header>

          {activeTab === "group" && selectedGroup && (
            <div className="group-tools">
              <span>Guruhga user qo'shish:</span>
              <select
                className="input"
                value={groupAddUserId}
                onChange={(e) => setGroupAddUserId(e.target.value)}
              >
                <option value="">User tanlang</option>
                {groupCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} (@{u.login})
                  </option>
                ))}
              </select>
              <button className="btn btn-file" onClick={addUserToGroup}>Qo'shish</button>
            </div>
          )}

          <ul className="messages" ref={messagesRef}>
            {currentMessages.map((m) => (
              <li key={m.id} className={`bubble ${m.isMine ? "self" : ""}`}>
                <div className="meta">
                  <strong>{m.sender?.fullName || "Noma'lum"}</strong>
                  <span>{formatTime(m.createdAt)}</span>
                </div>
                {m.text && <p className="text">{m.text}</p>}
                {m.image && <img className="msg-image" src={m.image} alt="xabar rasmi" />}
              </li>
            ))}
          </ul>

          <section className="composer">
            <input
              className="input"
              placeholder="Xabar yozing..."
              maxLength="2000"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCurrentMessage()}
            />

            <div className="row">
              <label className="btn btn-file" htmlFor="composerImageInput">Rasm</label>
              <input
                id="composerImageInput"
                type="file"
                accept="image/*"
                hidden
                onChange={handleComposerImage}
              />
              <span className="small">{composerImageName}</span>
              <button className="btn btn-send" onClick={sendCurrentMessage}>Yuborish</button>
            </div>

            <div className="error">{chatError}</div>
          </section>
        </section>
      </main>
    </>
  )
}
