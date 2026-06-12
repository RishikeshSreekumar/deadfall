import path from "node:path";
import type { Node } from "ts-morph";
import type { ComponentInfo } from "./components.js";

/** Stable key for a declaration node: absolute file path + start offset. */
export function declKey(decl: Node): string {
  return `${decl.getSourceFile().getFilePath()}:${decl.getStart()}`;
}

/**
 * Holds every detected component and indexes them for fast lookup during edge
 * resolution — by declaration node and by `${relFile}#${name}` id.
 */
export class ComponentRegistry {
  private readonly byDecl = new Map<string, ComponentInfo>();
  private readonly byId = new Map<string, ComponentInfo>();
  private readonly byName = new Map<string, ComponentInfo[]>();
  /** Absolute file path -> its default-exported component. */
  private readonly byDefault = new Map<string, ComponentInfo>();

  constructor(public readonly root: string) {}

  add(info: ComponentInfo): void {
    this.byDecl.set(declKey(info.decl), info);
    this.byId.set(info.id, info);
    const list = this.byName.get(info.name) ?? [];
    list.push(info);
    this.byName.set(info.name, list);
    if (info.isDefaultExport) {
      this.byDefault.set(info.decl.getSourceFile().getFilePath(), info);
    }
  }

  /** The default-exported component of a file, if any (absolute path). */
  defaultExportOf(absFile: string): ComponentInfo | undefined {
    return this.byDefault.get(absFile);
  }

  /** Every tracked declaration (components + glue). */
  all(): ComponentInfo[] {
    return [...this.byId.values()];
  }

  /** Only the actual React components (the subset reported to the user). */
  components(): ComponentInfo[] {
    return [...this.byId.values()].filter((c) => c.isComponent);
  }

  byDeclKey(key: string): ComponentInfo | undefined {
    return this.byDecl.get(key);
  }

  byComponentId(id: string): ComponentInfo | undefined {
    return this.byId.get(id);
  }

  /** Look up by the component's defining file + exported name. */
  byFileAndName(absFile: string, name: string): ComponentInfo | undefined {
    const rel = path.relative(this.root, absFile).split(path.sep).join("/");
    return this.byId.get(`${rel}#${name}`);
  }
}
