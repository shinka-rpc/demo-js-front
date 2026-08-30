import { useState, useRef, useMemo } from "react";
import { type Op, type Sheet } from "@fortune-sheet/core";
import { type WorkbookInstance } from "@fortune-sheet/react";

import { Client } from "@shinka-rpc/core";
import serializer from "@shinka-rpc/serializer-msgspec";
import { sharedWorkerClient } from "@shinka-rpc/shared-worker";
import type { OutScope, OutScopeEventListener } from "@shinka-rpc/outscope";

import { useOnce } from "./lib/use-once";

import { Table } from "./table";

import "./app.css";

const selfAssignUser = () => {
  const userId = Math.random().toString().slice(2);
  return [`User-${userId.slice(0, 3)}`, userId] as [string, string];
};

const Disconnected = () => (
  <div style={{ padding: 16 }}>
    <p>Failed to connect to websocket server.</p>
    <p>
      Please note that this collaboration demo connects to a local websocket
      server (ws://localhost:8081/ws).
    </p>
    <p>To make this work:</p>
    <ol>
      <li>Clone the project</li>
      <li>Run server in backend-demo/: node index.js</li>
      <li>Make sure you also have mongodb running locally</li>
      <li>Try again</li>
    </ol>
  </div>
);

const transport = sharedWorkerClient(
  () => new SharedWorker(new URL("./shared-worker.ts", import.meta.url)),
);

export default () => {
  const [data, setData] = useState<Sheet[]>();
  const clientRef = useRef<Client<any, any, any>>(null);
  const [connected, setConnected] = useState(false);
  const workbookRef = useRef<WorkbookInstance>(null);
  const user = useMemo(selfAssignUser, []);

  useOnce(() => {
    const handlers = new Set<OutScopeEventListener>();

    const add = handlers.add.bind(handlers);
    const remove = handlers.delete.bind(handlers);

    const outscope: OutScope = { add, remove };

    const client = new Client<any, any, any>({
      responseTimeout: 15_000,
      outscope,
      transport,
      serializer,
    });

    client.addEventListener("connect", () => {
      setConnected(true);
      client.request<Sheet[]>("get-data", 0).then(setData).catch(console.error);
    });
    client.addEventListener("disconnect", () => {
      setConnected(false);
    });
    client.addEventListener("error", (...args) => console.error(args));

    clientRef.current = client;

    client.start();

    client.onDataEvent("op", (data: Op[]) =>
      workbookRef.current!.applyOp(data),
    );

    return () => {
      client.stop();
      for (const cb of Array.from(handlers)) {
        cb();
        handlers.delete(cb);
      }
    };
  });

  if (!connected) return <Disconnected />;
  if (!data) return <div />;

  return (
    <Table
      data={data}
      setData={setData}
      client={clientRef.current!}
      user={user}
      workbookRef={workbookRef}
    />
  );
};
