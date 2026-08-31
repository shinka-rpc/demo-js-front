import { useRef, useCallback, type Ref, useMemo } from "react";
import {
  type Sheet,
  type Op,
  type Selection,
  // colors,
} from "@fortune-sheet/core";
import { Workbook, type WorkbookInstance } from "@fortune-sheet/react";
import type { Client } from "@shinka-rpc/core";
import "@fortune-sheet/react/dist/index.css";

// import { hashCode } from "./lib/hash-code";

export type TableProps = {
  data: Sheet[];
  client: Client<any, any, any>;
  workbookRef: Ref<WorkbookInstance>;
  setData: (val: Sheet[]) => void;
  user: [string, string];
};

export const Table = ({
  data,
  workbookRef,
  setData,
  client,
  user: { 0: username, 1: userId },
}: TableProps) => {
  const lastSelection = useRef<any>(null);

  const onOp = useCallback((data: Op[]) => client.dataEvent("op", data), []);

  const onChange = useCallback((d: Sheet[]) => {
    setData(d);
  }, []);

  const hooks = useMemo(() => {
    const afterSelectionChange = (_sheetId: string, selection: Selection) => {
      const s = {
        r: selection.row[0],
        c: selection.column[0],
      };
      if (
        lastSelection.current?.r === s.r &&
        lastSelection.current?.c === s.c
      ) {
        return;
      }
      lastSelection.current = s;
      // socket.send(
      //   JSON.stringify({
      //     req: "addPresences",
      //     data: [
      //       {
      //         sheetId,
      //         username,
      //         userId,
      //         color: colors[Math.abs(hashCode(userId)) % colors.length],
      //         selection: s,
      //       },
      //     ],
      //   }),
      // );
    };
    return { afterSelectionChange };
  }, [userId, username]);

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <Workbook
        ref={workbookRef}
        // {...args}
        data={data}
        onChange={onChange}
        onOp={onOp}
        hooks={hooks}
      />
    </div>
  );
};
