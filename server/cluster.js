//@ts-check
const cluster = require("cluster");
// @ts-ignore
const { setupMaster } = require("@socket.io/sticky");
const express = require('express')
const { createServer } = require('http');

const app = express()
const port = 4500
const server = createServer(app);

const WORKERS_COUNT = 4;

// @ts-ignore
if (cluster.isPrimary) {
    console.log(`Master ${process.pid} is running`);

    for (let i = 0; i < WORKERS_COUNT; i++) {
        // @ts-ignore
        cluster.fork();
    }

    // @ts-ignore
    cluster.on("exit", (worker) => {
        console.log(`Worker ${worker.process.pid} died`);
        // @ts-ignore
        cluster.fork();
    });

    setupMaster(server, {
        loadBalancingMethod: "least-connection", // either "random", "round-robin" or "least-connection"
    });

    server.listen(port, () => {
        console.log(`Server app listening on port ${port}`)
    })
} else {
    console.log(`Worker ${process.pid} started`);
    require("./index");
}