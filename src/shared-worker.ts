import { Server, Client } from "@shinka-rpc/core";
import outscope from "@shinka-rpc/outscope/browser-page";
import { sharedWorkerServer } from "@shinka-rpc/shared-worker";
import { clientWebSocketTransport } from "@shinka-rpc/web-socket";
import serializerMsgPack from "@shinka-rpc/serializer-msgspec";
import { streamGzip } from "@shinka-rpc/serializer-gzip";
import limonOpportunistic from "@shinka-rpc/limon-opportunistic";
import {
  clientRegistry,
  waitConnected,
  createSingleFlight,
} from "@shinka-rpc/scenarios";

import {
  ServerWorkbook,
  type WorkbookState,
  type Op,
} from "./lib/server-workbook";

const server = new Server({
  outscope,
  serializer: serializerMsgPack,
  transport: sharedWorkerServer,
});

server.addEventListener("error", console.error);

const clients = clientRegistry(server);

const wsClientTransport = clientWebSocketTransport(
  () => new WebSocket(`${process.env.PUBLIC_WS_SERVER}/ws`),
);

// Example high-order-serializer usage
const wsSerializer = streamGzip(serializerMsgPack, { deflate: { gzip: true } });

const wsClient = new Client({
  outscope,
  transport: wsClientTransport,
  serializer: wsSerializer,
  limon: limonOpportunistic(),
});

const wsConnecting = waitConnected(wsClient);

wsClient.addEventListener("error", console.error);

let workbook: ServerWorkbook | null = null;

const { 0: getWorkBook } = createSingleFlight({
  read: () => workbook!.state,
  reset: () => (workbook = null),
  retrieve: async () => {
    await wsConnecting;
    const data = await wsClient.request<WorkbookState>("get-data", 0);
    workbook = new ServerWorkbook(data);
    return data;
  },
});

server.onRequest("get-data", getWorkBook);

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
});

server.start();
wsClient.start().catch();
