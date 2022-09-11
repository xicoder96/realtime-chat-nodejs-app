//@ts-check
const express = require('express')
const { createServer } = require('http');
const { Server } = require("socket.io");
const { createClient } = require("redis")
const { createAdapter } = require('@socket.io/redis-adapter');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const app = express()
const server = createServer(app);
const io = new Server(server);
const port = 4500

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
// Routing
app.use(express.static(path.join(__dirname, 'public')));

// @ts-ignore
// @ts-ignore
app.get("/stream/live-feed", (req, res) => {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);
    sendResponse(res);
});


let count = 0;
function sendResponse(res) {
    const message = { msg: "hello", timestamp: Date.now(), count: ++count }
    res.write(`data: ${JSON.stringify(message)}\n\n`)
    setTimeout(() => sendResponse(res), 1000)
}

const pubClient = createClient({ url: "redis://127.0.0.1:6379" });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));

pubClient.connect()

let numUsers = 0;

const crypto = require("crypto");
const randomId = () => crypto.randomBytes(8).toString("hex");

const { RedisSessionStore } = require("./sessionStore");
const sessionStore = new RedisSessionStore(pubClient);
const { RedisMessageStore } = require("./messageStore");
const { setupWorker } = require("@socket.io/sticky");

// @ts-ignore
const messageStore = new RedisMessageStore(pubClient);

io.on('connection', async (socket) => {
    let addedUser = false;
    const messages = await messageStore.findMessagesForUser("ALL");

    // Load previous chat history
    socket.emit('load history', messages.map(element => {
        return {
            username: element.from,
            message: element.content,
            timestamp: element.timestamp
        }
    }))

    // when the client emits 'new message', this listens and executes
    socket.on('new message', (data) => {
        // Save data in Redis for history
        const message = {
            content: data,
            // @ts-ignore
            from: `${socket.username}`,
            to: "ALL",
            id: randomId(),
            timestamp: Date.now()
        };
        messageStore.saveMessage(message);
        // we tell the client to execute 'new message'
        socket.broadcast.emit('new message', {
            // @ts-ignore
            username: socket.username,
            message: data,
            timestamp: Date.now()
        });
    });

    // when the client emits 'add user', this listens and executes
    socket.on('add user', (username) => {
        if (addedUser) return;

        // we store the username in the socket session for this client
        // @ts-ignore
        socket.username = username;
        ++numUsers;
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers
        });
        // echo globally (all clients) that a person has connected
        socket.broadcast.emit('user joined', {
            // @ts-ignore
            username: socket.username,
            numUsers: numUsers,
            timestamp: Date.now()
        });
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', () => {
        socket.broadcast.emit('typing', {
            // @ts-ignore
            username: socket.username,
            timestamp: Date.now()
        });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing', {
            // @ts-ignore
            username: socket.username,
            timestamp: Date.now()
        });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', async () => {
        if (addedUser) {
            --numUsers;

            // Distroy the chat history when user count === 0
            if (numUsers < 1) {
                await messageStore.clearMemory()
            }

            // echo globally that this client has left
            socket.broadcast.emit('user left', {
                // @ts-ignore
                username: socket.username,
                numUsers: numUsers,
                timestamp: Date.now()
            });
        }
    });
});

server.listen(port, () => {
    console.log(`Server app listening on port ${port}`)
})