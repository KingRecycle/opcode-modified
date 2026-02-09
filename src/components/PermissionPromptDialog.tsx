import { Shield, Terminal, FileEdit, FolderOpen, Globe, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface PermissionPromptDialogProps {
  open: boolean;
  toolName: string;
  input: Record<string, any>;
  onAllow: () => void;
  onDeny: () => void;
}

function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase();
  if (name.includes("bash") || name.includes("command") || name.includes("terminal")) {
    return <Terminal className="h-4 w-4" />;
  }
  if (name.includes("write") || name.includes("edit") || name.includes("create")) {
    return <FileEdit className="h-4 w-4" />;
  }
  if (name.includes("read") || name.includes("glob") || name.includes("list") || name.includes("find")) {
    return <FolderOpen className="h-4 w-4" />;
  }
  if (name.includes("fetch") || name.includes("web") || name.includes("http")) {
    return <Globe className="h-4 w-4" />;
  }
  return <Wrench className="h-4 w-4" />;
}

export function PermissionPromptDialog({
  open,
  toolName,
  input,
  onAllow,
  onDeny,
}: PermissionPromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDeny(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-500" />
            Permission Required
          </DialogTitle>
          <DialogDescription>
            Claude wants to use a tool that requires your approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Tool name */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tool:</span>
            <Badge variant="secondary" className="flex items-center gap-1.5">
              {getToolIcon(toolName)}
              {toolName}
            </Badge>
          </div>

          {/* Tool input (scrollable JSON block) */}
          {input && Object.keys(input).length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Input:</span>
              <pre className="text-xs rounded-md bg-muted/50 p-3 border overflow-auto max-h-48 whitespace-pre-wrap break-all">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onDeny}>
            Deny
          </Button>
          <Button onClick={onAllow}>
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
