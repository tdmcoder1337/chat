const express = require("express")
const http = require("http")
const path = require("path")
const {Server} = require("socket.io")
const cors = require("cors")
const { log } = require("console")

const app = express()
app.use(express.static(path.join(__dirname)))
const server = http.createServer(app)       
const io = new Server(server)

app.get("/", (req, res)=>{
    res.sendFile(path.join(__dirname, "index.html"))
})

io.on("connection", (socket)=>{
    console.log("Foydalanuvchi ulandi:", socket.id)

    socket.on("message_from_client", (text)=>{
        console.log("Xabar kelib tushdi:", text)
        io.emit("message_from_server", text)
    })

    socket.on("disconnect", ()=>{
        console.log("Foydalanuvchi uzildi:", socket.id)
    })
})

server.listen("3000", ()=>{
    console.log("Server 3000-portda ishga tushdi")
})

