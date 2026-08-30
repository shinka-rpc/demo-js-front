type CellEntry = {
  r: number;
  c: number;
  v: any;
};

type Sheet = {
  id: string;
  name: string;
  celldata: CellEntry[];
  [key: string]: any;
};

export type WorkbookState = Sheet[];

export type Op = {
  op:
    | "replace"
    | "remove"
    | "add"
    | "insertRowCol"
    | "deleteRowCol"
    | "addSheet"
    | "deleteSheet";
  id?: string;
  path: (string | number)[];
  value?: any;
};

export const createSheet = (name: string) =>
  ({
    id: Math.random().toString().slice(2),
    name,
    celldata: [],
  }) satisfies Sheet;

export class ServerWorkbook {
  public readonly state: WorkbookState;

  private readonly sheetIndex: Map<string, Sheet>;
  private readonly cellIndex: Map<string, Map<string, CellEntry>>;

  constructor(initialState: WorkbookState) {
    this.state = initialState;
    this.sheetIndex = new Map();
    this.cellIndex = new Map();

    for (const sheet of this.state) {
      this.sheetIndex.set(sheet.id, sheet);
      this.rebuildCellIndex(sheet);
    }
  }

  public getSheet(sheetId: string): Sheet | undefined {
    return this.sheetIndex.get(sheetId);
  }

  public getState(): WorkbookState {
    return this.state;
  }

  public applyOps(ops: Op[]): void {
    for (const op of ops) {
      this.applySingleOp(op);
    }
  }

  private applySingleOp(op: Op): void {
    switch (op.op) {
      case "replace":
        this.applyReplace(op);
        break;
      case "remove":
        this.applyRemove(op);
        break;
      case "add":
        this.applyAdd(op);
        break;
      case "addSheet":
        this.addSheet(op);
        break;
      case "deleteSheet":
        this.deleteSheet(op);
        break;
      case "insertRowCol":
        this.insertRowCol(op);
        break;
      case "deleteRowCol":
        this.deleteRowCol(op);
        break;
      default:
        break;
    }
  }

  private rebuildCellIndex(sheet: Sheet): void {
    const index = new Map<string, CellEntry>();
    for (const cell of sheet.celldata ?? []) {
      index.set(`${cell.r}:${cell.c}`, cell);
    }
    this.cellIndex.set(sheet.id, index);
  }

  private getSheetCells(sheetId: string): CellEntry[] {
    const sheet = this.sheetIndex.get(sheetId);
    if (!sheet) return [];
    if (!sheet.celldata) {
      sheet.celldata = [];
    }
    return sheet.celldata;
  }

  private getCellKey(r: number, c: number): string {
    return `${r}:${c}`;
  }

  private applyReplace(op: Op): void {
    if (!op.id) return;
    const sheet = this.sheetIndex.get(op.id);
    if (!sheet) return;

    const path = [...op.path];
    if (path[0] === "data") {
      const [_, row, col] = path as [string, number, number];
      const cells = this.getSheetCells(op.id);
      const key = this.getCellKey(row, col);

      const existing = cells.find((cell) => cell.r === row && cell.c === col);
      if (existing) {
        existing.v = op.value;
      } else {
        cells.push({ r: row, c: col, v: op.value });
      }

      const rowIndex = this.cellIndex.get(op.id) ?? new Map();
      rowIndex.set(key, { r: row, c: col, v: op.value });
      this.cellIndex.set(op.id, rowIndex);
      return;
    }

    // fallback for other property paths
    const valuePath = [...op.path];
    let target: any = sheet;

    for (let i = 0; i < valuePath.length - 1; i += 1) {
      const key = valuePath[i];
      if (target == null) return;
      target = target[key];
    }

    const last = valuePath[valuePath.length - 1];
    if (target == null) return;
    target[last] = op.value;
  }

  private applyAdd(op: Op): void {
    if (!op.id) return;
    const sheet = this.sheetIndex.get(op.id);
    if (!sheet) return;

    const path = [...op.path];
    if (path[0] === "data") {
      const [_, row, col] = path as [string, number, number];
      const cells = this.getSheetCells(op.id);
      const key = this.getCellKey(row, col);

      const existing = cells.find((cell) => cell.r === row && cell.c === col);
      if (existing) {
        existing.v = op.value;
      } else {
        cells.push({ r: row, c: col, v: op.value });
      }

      const rowIndex = this.cellIndex.get(op.id) ?? new Map();
      rowIndex.set(key, { r: row, c: col, v: op.value });
      this.cellIndex.set(op.id, rowIndex);
      return;
    }

    const targetPath = [...op.path];
    let target: any = sheet;

    for (let i = 0; i < targetPath.length - 1; i += 1) {
      const key = targetPath[i];
      if (target == null) return;
      if (target[key] == null) {
        target[key] = Array.isArray(targetPath[i + 1]) ? [] : {};
      }
      target = target[key];
    }

    const last = targetPath[targetPath.length - 1];
    if (target == null) return;

    if (Array.isArray(target)) {
      target.push(op.value);
    } else {
      target[last] = op.value;
    }
  }

  private applyRemove(op: Op): void {
    if (!op.id) return;
    const sheet = this.sheetIndex.get(op.id);
    if (!sheet) return;

    const path = [...op.path];
    if (path[0] === "data") {
      const [_, row, col] = path as [string, number, number];
      const cells = this.getSheetCells(op.id);
      const next = cells.filter((cell) => !(cell.r === row && cell.c === col));
      sheet.celldata = next;

      const rowIndex = this.cellIndex.get(op.id) ?? new Map();
      rowIndex.delete(this.getCellKey(row, col));
      this.cellIndex.set(op.id, rowIndex);
      return;
    }

    const targetPath = [...op.path];
    let target: any = sheet;

    for (let i = 0; i < targetPath.length - 1; i += 1) {
      const key = targetPath[i];
      if (target == null) return;
      target = target[key];
    }

    const last = targetPath[targetPath.length - 1];
    if (target == null) return;

    if (Array.isArray(target)) {
      const index = Number(last);
      if (!Number.isNaN(index)) {
        target.splice(index, 1);
      }
    } else {
      delete target[last];
    }
  }

  private addSheet(op: Op): void {
    const sheet = op.value as Sheet | undefined;
    if (!sheet || !sheet.id) return;

    this.state.push(sheet);
    this.sheetIndex.set(sheet.id, sheet);
    this.rebuildCellIndex(sheet);
  }

  private deleteSheet(op: Op): void {
    if (!op.id) return;

    const index = this.state.findIndex((sheet) => sheet.id === op.id);
    if (index < 0) return;

    const [removed] = this.state.splice(index, 1);
    if (removed) {
      this.sheetIndex.delete(removed.id);
      this.cellIndex.delete(removed.id);
    }
  }

  private insertRowCol(op: Op): void {
    const value = op.value as
      | {
          id: string;
          type: "row" | "column";
          index: number;
          count: number;
          direction: "lefttop" | "rightbottom";
        }
      | undefined;

    if (!value || !op.id) return;

    const sheet = this.sheetIndex.get(op.id);
    if (!sheet) return;

    const cells = this.getSheetCells(op.id);

    const offset = value.direction === "rightbottom" ? 1 : 0;
    const start = value.index + offset;

    for (const cell of [...cells]) {
      if (value.type === "row") {
        if (cell.r >= start && cell.r < start + value.count) {
          cell.r += value.count;
        } else if (cell.r >= start) {
          cell.r += value.count;
        }
      } else {
        if (cell.c >= start && cell.c < start + value.count) {
          cell.c += value.count;
        } else if (cell.c >= start) {
          cell.c += value.count;
        }
      }
    }

    this.rebuildCellIndex(sheet);
  }

  private deleteRowCol(op: Op): void {
    const value = op.value as
      | {
          id: string;
          type: "row" | "column";
          start: number;
          end: number;
        }
      | undefined;

    if (!value || !op.id) return;

    const sheet = this.sheetIndex.get(op.id);
    if (!sheet) return;

    const cells = this.getSheetCells(op.id);
    const next: CellEntry[] = [];

    for (const cell of cells) {
      if (value.type === "row") {
        if (cell.r >= value.start && cell.r <= value.end) {
          continue;
        }
        if (cell.r > value.end) {
          cell.r -= value.end - value.start + 1;
        }
      } else {
        if (cell.c >= value.start && cell.c <= value.end) {
          continue;
        }
        if (cell.c > value.end) {
          cell.c -= value.end - value.start + 1;
        }
      }
      next.push(cell);
    }

    sheet.celldata = next;
    this.rebuildCellIndex(sheet);
  }
}
