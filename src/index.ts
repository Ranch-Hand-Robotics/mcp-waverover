import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import http from 'http';
const axios = require('axios');

const server = new McpServer({
  name: "Wave Rover",
  description: "WaveRover is a mobile robot platform designed for educational and research purposes. It uses a differential drive system which can drive by setting the speed of the left and right wheels, or you can specify a rotational and linear velocity.",
  version: "1.0.0"
});

class Rover {
    public id: string;
    public ip: string;

    constructor(id: string, ip: string) {
        this.id = id;
        this.ip = ip;
    }
}



// Define tools
const roverConnections = new Map<string, Rover>();

server.tool("Connect",
    "Connects to a rover by its IP address",
    { ip: z.string() },
    async ({ ip }) => {
        const roverId = `rover${roverConnections.size + 1}`;
        const rover = new Rover(roverId, ip);
        roverConnections.set(roverId, rover);
        return {
            content: [{ type: "text", text: `Connected to: ${ip} with ID: ${roverId}` }]
        };
    }
);

server.tool("Speed",
  "Sets the speed of the left and right wheels",

  { id: z.string(), leftWheelSpeed: z.number(), rightWheelSpeed: z.number() },
  async ({ id, leftWheelSpeed, rightWheelSpeed }) => {
    
    let rover = roverConnections.get(id);
    if (!rover) {
        throw new Error(`Rover with ID ${id} not found`);
    }
    const command = JSON.stringify({ T: 1, L: leftWheelSpeed, R: rightWheelSpeed });
    const url = `http://${rover.ip}/js?json=${command}`;
    await axios.get(url);

    return {content: [{ type: "text", text: `Left wheel speed: ${leftWheelSpeed}, Right wheel speed: ${rightWheelSpeed}` }]}
  }
);

server.tool("PWM",
  "Sets the raw PWM values for the left and right motors",
    { id: z.string(), L: z.number(), R: z.number() },
    async ({ id, L, R }) => {
    
        let rover = roverConnections.get(id);
        if (!rover) {
            throw new Error(`Rover with ID ${id} not found`);
        }
        const command = JSON.stringify({ T: 11, L: L, R: R });
        const url = `http://${rover.ip}/js?json=${command}`;
        await axios.get(url);
    
        return {content: [{ type: "text", text: `Left wheel speed: ${L}, Right wheel speed: ${R}` }]}
      }
    );

server.tool("cmd_vel",
  "Sets the linear and angular velocity of the rover",
  { id: z.string(), L: z.number(), R: z.number() },
  async ({ id, L, R }) => {
    
    let rover = roverConnections.get(id);
    if (!rover) {
        throw new Error(`Rover with ID ${id} not found`);
    }
    const command = JSON.stringify({ T: 13, X: L, Z: R });
    const url = `http://${rover.ip}/js?json=${command}`;
    await axios.get(url);

    return {content: [{ type: "text", text: `Velocity: ${L}, Rotation: ${R}` }]}
  }
);

server.tool("Screen",
  "Allows the user to write text to the rover's screen",
  { id: z.string(), lineNum: z.number(), Text: z.string() },
  async ({ id, lineNum, Text }) => {
    
    let rover = roverConnections.get(id);
    if (!rover) {
        throw new Error(`Rover with ID ${id} not found`);
    }
    const command = JSON.stringify({"T":3,"lineNum":lineNum,"Text":Text});
    const url = `http://${rover.ip}/js?json=${command}`;
    await axios.get(url);

    return {content: [{ type: "text", text: `Line Number: ${lineNum}, Text: ${Text}` }]}
  }
);

server.tool("IMU",
  "Returns IMU data",
  {id: z.string()},
  async ({id}) => {
    let rover = roverConnections.get(id);
    if (!rover) {
        throw new Error(`Rover with ID ${id} not found`);
    }
    const command = JSON.stringify({"T":126});
    const url = `http://${rover.ip}/js?json=${command}`;
    let result = await axios.get(url);

    return {content: [{ type: "text", text: `result${result.data}` }]}
  }
);

const app = express();

const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  const clientId = req.query.clientId as string || req.headers["client-id"] as string || "defaultClientId";
  if (!clientId) {
    res.status(400).send("clientId query parameter is required");
    return;
  }
  const transport = new SSEServerTransport("/messages", res);
  transports.set(clientId, transport);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const clientId = req.query.clientId as string || req.headers["client-id"] as string || "defaultClientId";
  if (!clientId) {
    res.status(400).send("clientId query parameter is required");
    return;
  }
  const transport = transports.get(clientId);
  if (!transport) {
    res.status(404).send("Transport not found for clientId");
    return;
  }
  await transport.handlePostMessage(req, res);
});

const port = process.argv[2] ? parseInt(process.argv[2]) : 3000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});