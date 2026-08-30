import { Server, type IBus, Client } from "@shinka-rpc/core";
import outscope from "@shinka-rpc/outscope/browser-page";
import { sharedWorkerServer } from "@shinka-rpc/shared-worker";
import { clientWebSocketTransport } from "@shinka-rpc/web-socket";
import serializer from "@shinka-rpc/serializer-msgspec";
import { ReusablePromise } from "@shinka-rpc/concurrency";
import limonOpportunistic from "@shinka-rpc/limon-opportunistic";

import {
  ServerWorkbook,
  type WorkbookState,
  type Op,
} from "./lib/server-workbook";

let workbook: ServerWorkbook | null = null;

const clients = new Set<IBus<any, any>>();

const server = new Server<any, any, any>({
  outscope,
  transport: sharedWorkerServer,
  serializer,
});

server.addEventListener("error", console.error);
server.addEventListener("connect", (bus) => clients.add(bus));
server.addEventListener("disconnect", (bus) => clients.delete(bus));

const wsClientTransport = clientWebSocketTransport(
  () => new WebSocket(`${process.env.PUBLIC_WS_SERVER}/ws`),
);

const wsClient = new Client<any, any, any>({
  outscope,
  transport: wsClientTransport,
  serializer,
  limon: limonOpportunistic({}),
});

const wsConnecting = new ReusablePromise<void>();

wsClient.addEventListener("error", console.error);
wsClient.addEventListener("connect", () => wsConnecting.resolve());
wsClient.addEventListener("disconnect", () => wsConnecting.reset());

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
