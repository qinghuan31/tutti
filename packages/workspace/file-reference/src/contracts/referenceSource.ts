import type {
  WorkspaceFileReferencePreview,
  WorkspaceFileReferenceScope
} from "./index.ts";

/**
 * Reference Source Services 契约。
 *
 * 设计见 docs/architecture/agent-reference-source-services.md。
 * 把「+」文件引用弹窗从单一数据源升级为可插拔的多源服务层:
 * 本地文件 / 应用内产物 / 任务中心产物,每个一个 ReferenceSourceService。
 */

/**
 * 不透明、源内作用域的节点句柄。
 * picker 永不解析 nodeId —— 只整体持有、原样回传给所属源。
 */
export interface NodeRef {
  /** "workspace-file" | "app-artifact" | "task-artifact" ... */
  sourceId: string;
  /** 源内不透明标识。本地源 = path;应用产物源 = 编码后的 app/group/file 句柄。 */
  nodeId: string;
}

/** 统一树节点。identity = NodeRef。folder 可有子节点,file 不可。 */
export interface ReferenceNode {
  ref: NodeRef;
  kind: "folder" | "file";
  displayName: string;
  /** folder 是否可下钻(懒加载箭头)。 */
  hasChildren?: boolean;
  /** 可选数量,如 app group 的 referenceCount。 */
  childCount?: number | null;
  sizeBytes?: number | null;
  mtimeMs?: number | null;
  mimeType?: string | null;
}

/** 所有源操作的上下文。 */
export type ReferenceScope = WorkspaceFileReferenceScope;

export interface ListChildrenInput {
  /** null = 该源根层级。 */
  node: NodeRef | null;
  /** 续页游标;本地源恒不返回。 */
  cursor?: string | null;
  /** 当前层过滤(可选)。协议层只过滤直接子项,非递归。 */
  filter?: string | null;
  signal?: AbortSignal;
}

export interface ListChildrenResult {
  entries: ReferenceNode[];
  /** null/undefined 表示无更多。 */
  nextCursor?: string | null;
}

export interface SearchInput {
  query: string;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}

export interface SearchResult {
  entries: ReferenceNode[];
  nextCursor?: string | null;
}

/** 预览内容(复用 workspace 预览结构)。 */
export type ReferencePreview = WorkspaceFileReferencePreview;

/**
 * 选中 → 插入 composer 的产物。
 * 统一形态:所有源最终都归一为一个文件路径,与现有 picker 逐字段一致,
 * composer / 序列化 / agent 侧零改动。
 */
export interface SelectedReference {
  /** 应用产物 = daemon 解析的绝对路径;本地 = /workspace 逻辑路径。 */
  path: string;
  kind: "file" | "folder";
  displayName?: string;
}

export interface ReferenceSourceMetadata {
  id: string;
  label: string;
  icon?: string;
  /** 根层级排序,小者在前。 */
  order: number;
}

export interface ReferenceSourceCapabilities {
  searchable: boolean;
  previewable: boolean;
  paginated: boolean;
}

/**
 * 单源契约。各源自治:取数 / open / preview 各自负责。
 * 形状处理(kind 映射、排序去重、预览类型、cursor 累积、nodeKey 归一)走共享 base 工具。
 */
export interface ReferenceSourceService {
  readonly metadata: ReferenceSourceMetadata;
  readonly capabilities: ReferenceSourceCapabilities;

  /** 动态可用性。如:无支持 references 的 app 时应用产物源返回 false。 */
  isAvailable(scope: ReferenceScope): boolean | Promise<boolean>;

  listChildren(
    scope: ReferenceScope,
    input: ListChildrenInput
  ): Promise<ListChildrenResult>;

  search?(scope: ReferenceScope, input: SearchInput): Promise<SearchResult>;

  open?(scope: ReferenceScope, node: ReferenceNode): Promise<void>;
  readPreview?(
    scope: ReferenceScope,
    node: ReferenceNode
  ): Promise<ReferencePreview | null>;

  /** 选中产物归一,见 SelectedReference。 */
  resolveSelection(node: ReferenceNode): SelectedReference;
}

export interface ReferenceSourceRegistry {
  /** 已按 isAvailable 过滤、按 metadata.order 排序。 */
  getSources(scope: ReferenceScope): Promise<ReferenceSourceService[]>;
}
