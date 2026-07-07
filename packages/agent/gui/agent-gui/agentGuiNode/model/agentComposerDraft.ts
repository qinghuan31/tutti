import type { AgentPromptContentBlock } from "../../../shared/contracts/dto";
import type {
  AgentComposerDraft,
  AgentComposerDraftFile,
  AgentComposerDraftLargeText,
  AgentComposerDraftImage,
  AgentGUIProviderSkillOption
} from "./agentGuiNodeTypes";
import { AGENT_PASTED_TEXT_BLOCK_KIND } from "./agentGuiNodeTypes";
import {
  promptForProviderSkills,
  skillTriggerForPrefix
} from "./agentSkillOptions";

export const MAX_AGENT_COMPOSER_DRAFT_IMAGES = 8;

type AgentPromptImageContentBlock = AgentPromptContentBlock & {
  type: "image";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data?: string;
  path?: string;
};

export function emptyAgentComposerDraft(): AgentComposerDraft {
  return { prompt: "", images: [], files: [] };
}

export function agentComposerDraftHasContent(
  draft: AgentComposerDraft
): boolean {
  return (
    draft.prompt.trim() !== "" ||
    draft.images.length > 0 ||
    (draft.files?.length ?? 0) > 0 ||
    (draft.largeTexts?.some(
      (item) => item.text.trim() !== "" || Boolean(item.path)
    ) ??
      false)
  );
}

export function normalizeAgentPromptContentBlocks(
  content: readonly AgentPromptContentBlock[]
): AgentPromptContentBlock[] {
  const result: AgentPromptContentBlock[] = [];
  for (const block of content) {
    if (block.type === "text") {
      const text = block.text?.trim() ?? "";
      if (text) {
        result.push({ type: "text", text });
      }
      continue;
    }
    if (block.type === "image") {
      const mimeType = block.mimeType?.trim();
      const data = block.data?.trim();
      const imagePath = block.path?.trim();
      if (
        (!data && !imagePath) ||
        (mimeType !== "image/png" &&
          mimeType !== "image/jpeg" &&
          mimeType !== "image/webp")
      ) {
        continue;
      }
      result.push({
        type: "image",
        mimeType,
        ...(imagePath ? { path: imagePath } : { data }),
        ...(block.name?.trim() ? { name: block.name.trim() } : {})
      });
      continue;
    }
    if (block.type === "file") {
      const filePath = block.path?.trim();
      const hostPath = block.hostPath?.trim();
      if (!filePath && !hostPath) {
        continue;
      }
      result.push({
        type: "file",
        ...(block.mimeType?.trim() ? { mimeType: block.mimeType.trim() } : {}),
        ...(filePath ? { path: filePath } : {}),
        ...(hostPath ? { hostPath } : {}),
        ...(block.name?.trim() ? { name: block.name.trim() } : {}),
        ...(block.uri?.trim() ? { uri: block.uri.trim() } : {}),
        ...(block.uploadStatus?.trim()
          ? { uploadStatus: block.uploadStatus.trim() }
          : {}),
        ...(block.assetId?.trim() ? { assetId: block.assetId.trim() } : {}),
        ...(typeof block.sizeBytes === "number"
          ? { sizeBytes: block.sizeBytes }
          : {}),
        kind:
          block.kind === AGENT_PASTED_TEXT_BLOCK_KIND
            ? AGENT_PASTED_TEXT_BLOCK_KIND
            : "file"
      });
      continue;
    }
    if (block.type === "skill" || block.type === "mention") {
      const name = block.name?.trim();
      const path = block.path?.trim();
      if (name && path) {
        result.push({ type: block.type, name, path });
      }
    }
  }
  return result;
}

export function agentPromptContentDisplayText(
  content: readonly AgentPromptContentBlock[]
): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}

export function agentPromptContentHasImage(
  content: readonly AgentPromptContentBlock[]
): boolean {
  return content.some((block) => block.type === "image");
}

export function agentPromptContentHasFile(
  content: readonly AgentPromptContentBlock[]
): boolean {
  return content.some((block) => block.type === "file");
}

export function agentPromptContentImageBlocks(
  content: readonly AgentPromptContentBlock[]
): AgentPromptImageContentBlock[] {
  return normalizeAgentPromptContentBlocks(content).filter(
    (block): block is AgentPromptImageContentBlock =>
      block.type === "image" &&
      (typeof block.data === "string" || typeof block.path === "string") &&
      typeof block.mimeType === "string"
  );
}

export function agentPromptContentToComposerDraft(
  content: readonly AgentPromptContentBlock[],
  idPrefix: string
): AgentComposerDraft {
  const normalizedContent = normalizeAgentPromptContentBlocks(content);
  const largeTexts = agentPromptPastedTextBlocks(normalizedContent).map(
    (block) => agentPromptPastedTextBlockToDraftLargeText(block)
  );
  return {
    prompt: agentPromptContentDisplayText(normalizedContent),
    images: agentPromptContentImageBlocks(normalizedContent)
      .slice(0, MAX_AGENT_COMPOSER_DRAFT_IMAGES)
      .map((image, index) =>
        agentPromptImageBlockToDraftImage(image, idPrefix, index)
      ),
    files: agentPromptFileBlocks(normalizedContent).map((file, index) =>
      agentPromptFileBlockToDraftFile(file, idPrefix, index)
    ),
    ...(largeTexts.length > 0 ? { largeTexts } : {})
  };
}

function agentPromptPastedTextBlockToDraftLargeText(
  block: AgentPromptContentBlock & { type: "file" }
): AgentComposerDraftLargeText {
  return {
    id: crypto.randomUUID(),
    name: block.name?.trim() || "pasted-text.txt",
    text: "",
    ...(block.path ? { path: block.path } : {}),
    ...(typeof block.sizeBytes === "number"
      ? { sizeBytes: block.sizeBytes }
      : {})
  };
}

export function agentComposerDraftToPromptContent(input: {
  draft: AgentComposerDraft;
  provider: string;
  skills: readonly AgentGUIProviderSkillOption[];
}): AgentPromptContentBlock[] {
  const prompt = promptForProviderSkills({
    prompt: input.draft.prompt,
    provider: input.provider,
    skills: input.skills
  });
  return normalizeAgentPromptContentBlocks([
    ...textPromptContent(prompt),
    ...promptItemBlocksForProviderSkills({
      prompt,
      provider: input.provider,
      skills: input.skills
    }),
    ...input.draft.images
      .slice(0, MAX_AGENT_COMPOSER_DRAFT_IMAGES)
      .filter((image) => !image.uploading && !image.uploadError)
      .map((image) => ({
        type: "image" as const,
        mimeType: image.mimeType,
        ...(image.path ? { path: image.path } : { data: image.data }),
        name: image.name
      })),
    ...(input.draft.files ?? [])
      .filter((file) => !file.uploading && !file.uploadError)
      .map((file) => ({
        type: "file" as const,
        ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        ...(file.path ? { path: file.path } : {}),
        ...(!file.path && file.hostPath ? { hostPath: file.hostPath } : {}),
        ...(file.assetId ? { assetId: file.assetId } : {}),
        ...(file.sizeBytes ? { sizeBytes: file.sizeBytes } : {}),
        name: file.name,
        kind: "file"
      })),
    ...largeTextPromptContent(input.draft.largeTexts ?? [])
  ]);
}

export function agentComposerDraftSubmittedText(
  draft: AgentComposerDraft
): string {
  return agentPromptContentDisplayText(
    normalizeAgentPromptContentBlocks([
      ...textPromptContent(draft.prompt),
      ...largeTextPromptContent(draft.largeTexts ?? [])
    ])
  );
}

export function agentComposerDraftDisplayPrompt(
  draft: AgentComposerDraft
): string | undefined {
  const largeTexts = draft.largeTexts?.filter(
    (item) => Boolean(item.path) && !item.uploading && !item.uploadError
  );
  if (!largeTexts?.length) {
    return undefined;
  }
  const parts = [draft.prompt.trim()].filter(Boolean);
  parts.push(
    ...largeTexts.map((item, index) => {
      const name = pastedTextDraftDisplayName(index);
      const sizeLabel =
        typeof item.sizeBytes === "number" && Number.isFinite(item.sizeBytes)
          ? ` · ${formatAgentComposerDraftBytes(item.sizeBytes)}`
          : "";
      return `[${name}${sizeLabel}]`;
    })
  );
  return parts.join("\n");
}

function agentPromptFileBlocks(
  content: readonly AgentPromptContentBlock[]
): Array<AgentPromptContentBlock & { type: "file" }> {
  return normalizeAgentPromptContentBlocks(content).filter(
    (block): block is AgentPromptContentBlock & { type: "file" } =>
      block.type === "file" &&
      !isPastedTextPromptBlock(block) &&
      (typeof block.path === "string" || typeof block.hostPath === "string")
  );
}

function agentPromptPastedTextBlocks(
  content: readonly AgentPromptContentBlock[]
): Array<AgentPromptContentBlock & { type: "file" }> {
  return normalizeAgentPromptContentBlocks(content).filter(
    (block): block is AgentPromptContentBlock & { type: "file" } =>
      isPastedTextPromptBlock(block) && typeof block.path === "string"
  );
}

function promptItemBlocksForProviderSkills(input: {
  prompt: string;
  provider: string;
  skills: readonly AgentGUIProviderSkillOption[];
}): AgentPromptContentBlock[] {
  if (input.provider.trim() !== "codex") {
    return [];
  }
  const result: AgentPromptContentBlock[] = [];
  for (const skill of input.skills) {
    const path = skill.path?.trim();
    if (!path) {
      continue;
    }
    const trigger = skillTriggerForPrefix(skill, "$");
    if (!trigger || !promptHasTrigger(input.prompt, trigger)) {
      continue;
    }
    result.push({
      type: skill.kind === "connector" ? "mention" : "skill",
      name: skill.name,
      path
    });
  }
  return result;
}

function promptHasTrigger(prompt: string, trigger: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(trigger)}(?=$|\\s)`).test(prompt);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function textPromptContent(prompt: string): AgentPromptContentBlock[] {
  const text = prompt.trim();
  return text ? [{ type: "text", text }] : [];
}

/**
 * Display/label name for a pasted-text attachment, addressed purely by its
 * position in the draft (`pasted-text-1.txt`, `pasted-text-2.txt`, …). The
 * stored `item.name` is content-addressed and intentionally not used here, so
 * labels never collide and always renumber with the list.
 */
export function pastedTextDraftDisplayName(index: number): string {
  return `pasted-text-${index + 1}.txt`;
}

/**
 * Pasted long text submits as a structured `file` block (content-addressed
 * archive path) tagged with {@link AGENT_PASTED_TEXT_BLOCK_KIND}. Only landed
 * items are emitted — same rule as images: still-uploading or errored items are
 * dropped from submit (a visible error chip remains for the user to retry or
 * remove). The codex-style "read this file" instruction is NOT added here; it
 * is materialized in the controller at send time via
 * {@link materializePastedTextInstructions} so translations never enter the
 * model layer or the persisted/queued draft.
 */
function largeTextPromptContent(
  largeTexts: readonly AgentComposerDraftLargeText[]
): AgentPromptContentBlock[] {
  return largeTexts
    .filter((item) => {
      const path = item.path?.trim();
      return Boolean(path) && !item.uploading && !item.uploadError;
    })
    .map((item, index) => ({
      type: "file" as const,
      kind: AGENT_PASTED_TEXT_BLOCK_KIND,
      path: item.path,
      name: pastedTextDraftDisplayName(index),
      ...(typeof item.sizeBytes === "number"
        ? { sizeBytes: item.sizeBytes }
        : {})
    }));
}

/**
 * True when a prompt `file` block is a pasted-text attachment rather than a
 * user-attached file.
 */
export function isPastedTextPromptBlock(
  block: AgentPromptContentBlock
): boolean {
  return block.type === "file" && block.kind === AGENT_PASTED_TEXT_BLOCK_KIND;
}

/**
 * Returns a copy of `content` with a codex-style instruction text block appended
 * for the pasted-text file blocks it contains (placed at the tail, after the
 * user's own content). The instruction copy is passed in already-translated so
 * the model layer stays free of any i18n dependency. When there are no
 * pasted-text blocks the input is returned unchanged.
 */
export function materializePastedTextInstructions(
  content: readonly AgentPromptContentBlock[],
  format: {
    header: () => string;
    line: (path: string) => string;
  }
): AgentPromptContentBlock[] {
  const pastedPaths = content
    .filter(isPastedTextPromptBlock)
    .map((block) => block.path?.trim() ?? "")
    .filter(Boolean);
  if (pastedPaths.length === 0) {
    return [...content];
  }
  const instruction = [
    format.header(),
    ...pastedPaths.map((path) => format.line(path))
  ].join("\n");
  return [...content, { type: "text", text: instruction }];
}

function formatAgentComposerDraftBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  const kib = sizeBytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`;
  }
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
}

function agentPromptImageBlockToDraftImage(
  image: AgentPromptImageContentBlock,
  idPrefix: string,
  index: number
): AgentComposerDraftImage {
  return {
    id: `${idPrefix}:image:${index}`,
    name: image.name?.trim() || `image-${index + 1}`,
    mimeType: image.mimeType,
    ...(image.data ? { data: image.data } : {}),
    ...(image.path ? { path: image.path } : {}),
    previewUrl:
      typeof image.data === "string" && image.data
        ? `data:${image.mimeType};base64,${image.data}`
        : (image.path ?? "")
  };
}

function agentPromptFileBlockToDraftFile(
  file: AgentPromptContentBlock & { type: "file" },
  idPrefix: string,
  index: number
): AgentComposerDraftFile {
  return {
    id: `${idPrefix}:file:${index}`,
    name: file.name?.trim() || `file-${index + 1}`,
    mimeType: file.mimeType,
    path: file.path,
    hostPath: file.hostPath,
    assetId: file.assetId,
    sizeBytes: file.sizeBytes
  };
}
