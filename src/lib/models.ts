export const MODEL_INFO = {
  sonnet: { name: "Sonnet 4.5", description: "Faster, efficient for most tasks" },
  opus:   { name: "Opus 4.6",   description: "More capable, better for complex tasks" },
} as const;

export type PermissionMode = "plan" | "acceptEdits" | "default" | "bypassPermissions";

export const PERMISSION_MODES: {
  id: PermissionMode;
  name: string;
  description: string;
}[] = [
  { id: "bypassPermissions", name: "Bypass",      description: "Skip all permission prompts" },
  { id: "acceptEdits",       name: "Accept Edits", description: "Auto-accept edits, prompt for bash" },
  { id: "default",           name: "Default",      description: "Prompt for every tool use" },
  { id: "plan",              name: "Plan",          description: "Read-only, no file changes or commands" },
];
