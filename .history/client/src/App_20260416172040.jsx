import { useEffect, useRef, useState } from "react"
import { io } from "socket.io-client"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000"

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })
}

export default function App() {
  const socketRef = useRef(null)
  const [isConnected, setIsConnected] = useState(false)
  const [authOpen, setAuthOpen] = useState(true)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [pendingLogin, setPendingLogin] = useState("")
  const [currentUser, setCurrentUser] = useState(null)
  const [messages, setMessages] = useState([])

  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [authError, setAuthError] = useState("")

  const [text, setText] = useState("")
  const [imageData, setImageData] = useState("")
  const [imageName, setImageName] = useState("")
  const [chatError, setChatError] = useState("")

  const listRef = useRef(null)

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"]
    })
    socketRef.current = socket

    const onConnect = () => {
      setIsConnected(true)
    }

    const onDisconnect = () => {
      setIsConnected(false)
    }

    const onConnectError = () => {
      setIsConnected(false)
      setAuthError("Serverga ulanishda xatolik. Backend ishlab turganini tekshiring.")
    }

    const onAuthSuccess = (user) => {
      setCurrentUser(user)
      setAuthOpen(false)
      setRegisterOpen(false)
      setAuthError("")
      setChatError("")
    }

    const onRegisterNeed = ({ login: nextLogin }) => {
      setPendingLogin(nextLogin)
      setRegisterOpen(true)
      setAuthError("Bu login topilmadi. Ro'yxatdan o'ting.")
    }

    const onAuthError = (message) => {
      setAuthError(message)
      setChatError(message)
    }

    const onMessage = (msg) => {
      setMessages((prev) => [...prev, msg])
    }

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("connect_error", onConnectError)
    socket.on("auth_success", onAuthSuccess)
    socket.on("auth_register_required", onRegisterNeed)
    socket.on("auth_error", onAuthError)
    socket.on("message_from_server", onMessage)

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onConnectError)
      socket.off("auth_success", onAuthSuccess)
      socket.off("auth_register_required", onRegisterNeed)
      socket.off("auth_error", onAuthError)
      socket.off("message_from_server", onMessage)
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const fullName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : ""
  const displayName = currentUser ? currentUser.firstName || currentUser.login || "" : ""

  const handleLogin = () => {
    setAuthError("")
    setRegisterOpen(false)

    if (!login.trim() || !password.trim()) {
      setAuthError("Login va parolni kiriting.")
      return
    }

    const cleanLogin = login.trim()
    setPendingLogin(cleanLogin)
    if (!socketRef.current || !isConnected) {
      setAuthError("Serverga ulanmagan. Avval backendni ishga tushiring.")
      return
    }

    socketRef.current.emit("auth_login", { login: cleanLogin, password: password.trim() })
  }

  const handleRegister = () => {
    setAuthError("")
    if (!pendingLogin || !password.trim() || !firstName.trim() || !lastName.trim()) {
      setAuthError("Ro'yxatdan o'tish uchun barcha maydonlarni to'ldiring.")
      return
    }

    if (!socketRef.current || !isConnected) {
      setAuthError("Serverga ulanmagan. Avval backendni ishga tushiring.")
      return
    }

    socketRef.current.emit("auth_register", {
      login: pendingLogin,
      password: password.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim()
    })
  }

  const handleImage = (event) => {
    setChatError("")
    const file = event.target.files && event.target.files[0]

    if (!file) {
      setImageData("")
      setImageName("")
      return
    }

    if (!file.type.startsWith("image/")) {
      setChatError("Faqat rasm yuklang.")
      event.target.value = ""
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setChatError("Rasm 2MB dan kichik bo'lsin.")
      event.target.value = ""
      return
    }

    setImageName(file.name)
    const reader = new FileReader()
    reader.onload = () => setImageData(String(reader.result || ""))
    reader.readAsDataURL(file)
  }

  const sendMessage = () => {
    setChatError("")

    if (!currentUser) {
      setChatError("Avval tizimga kiring.")
      return
    }

    const cleanText = text.trim()
    if (!cleanText && !imageData) {
      setChatError("Xabar yoki rasm yuboring.")
      return
    }

    if (!socketRef.current || !isConnected) {
      setChatError("Serverga ulanmagan. Xabar yuborib bo'lmaydi.")
      return
    }

    socketRef.current.emit("message_from_client", { text: cleanText, image: imageData })
    setText("")
    setImageData("")
    setImageName("")

    const picker = document.getElementById("imageInput")
    if (picker) picker.value = ""
  }

  return (
    <>
      {authOpen && (
        <div className="overlay">
          <div className="auth-card">
            <h2>Tizimga kirish</h2>
            <p>Login va parol kiriting. Akkaunt bo'lmasa ro'yxatdan o'tish ochiladi.</p>
            <div className="form">
              <input className="input" placeholder="Login" maxLength="30" value={login} onChange={(e) => setLogin(e.target.value)} />
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
                <p>Akkaunt topilmadi. Ro'yxatdan o'ting:</p>
                <div className="form">
                  <input className="input" placeholder="Ism" maxLength="30" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <input className="input" placeholder="Familya" maxLength="30" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  <button className="btn auth-btn" onClick={handleRegister}>Ro'yxatdan o'tish</button>
                </div>
              </div>
            )}

            <div className="error">{authError}</div>
          </div>
        </div>
      )}

      <main className="app">
        <header className="topbar">
          <h1 className="title">React Live Chat</h1>
          {currentUser && <span className="me">Siz: {fullName}</span>}
        </header>

        <ul className="messages" ref={listRef}>
          {messages.map((msg, i) => {
            const mine = msg.fullName === fullName
            return (
              <li key={`${msg.createdAt || "time"}-${i}`} className={`bubble ${mine ? "self" : ""}`}>
                <div className="meta">
                  <strong>{msg.fullName || "Noma'lum"}</strong>
                  <span>{formatTime(msg.createdAt || Date.now())}</span>
                </div>
                {msg.text && <p className="text">{msg.text}</p>}
                {msg.image && <img className="msg-image" src={msg.image} alt="Yuklangan rasm" />}
              </li>
            )
          })}
        </ul>

        <section className="composer">
          <input
            className="input"
            placeholder="Xabar yozing..."
            maxLength="1000"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />

          <div className="row">
            <label className="btn btn-file" htmlFor="imageInput">Rasm (ixtiyoriy)</label>
            <input id="imageInput" type="file" accept="image/*" hidden onChange={handleImage} />
            <span className="small">{imageName}</span>
            <button className="btn btn-send" onClick={sendMessage}>Yuborish</button>
          </div>

          <div className="error">{chatError}</div>
        </section>
      </main>
    </>
  )
}
