import { Server, Client } from "@shinka-rpc/core";
import outscope from "@shinka-rpc/outscope/browser-page";
import { sharedWorkerServer } from "@shinka-rpc/shared-worker";
import { clientWebSocketTransport } from "@shinka-rpc/web-socket";
import serializer from "@shinka-rpc/serializer-msgspec";
import limonOpportunistic from "@shinka-rpc/limon-opportunistic";
import { clientRegistry, waitConnected } from "@shinka-rpc/scenarios";

import {
  ServerWorkbook,
  type WorkbookState,
  type Op,
} from "./lib/server-workbook";

let workbook: ServerWorkbook | null = null;

const server = new Server<any, any, any>({
  outscope,
  transport: sharedWorkerServer,
  serializer,
});

server.addEventListener("error", console.error);

const clients = clientRegistry(server);

const wsClientTransport = clientWebSocketTransport(
  () => new WebSocket(`${process.env.PUBLIC_WS_SERVER}/ws`),
);

const wsClient = new Client<any, any, any>({
  outscope,
  transport: wsClientTransport,
  serializer,
  limon: limonOpportunistic(),
});

const wsConnecting = waitConnected(wsClient);

wsClient.addEventListener("error", console.error);

server.onRequest("get-data", async () => {
  if (workbook) return workbook.state;
  await wsConnecting;
  const data = await wsClient.request<WorkbookState>("get-data", 0);
  workbook = new ServerWorkbook(data);
  return data;
});

server.onDataEvent("op", (ops: Op[], bus) => {
  if (!workbook) return;
  workbook.applyOps(ops);
  for (const client of clients) if (bus !== client) client.dataEvent("op", ops);
  wsClient.dataEvent("op", ops);
});

wsClient.onDataEvent("op", (ops: Op[]) => {
  if (!workbook) return;
  workbook.applyOps(ops);
  for (const client of clients) client.dataEvent("op", ops);
  wsClient.dataEvent("op", ops);
});

server.start();
wsClient.start();
