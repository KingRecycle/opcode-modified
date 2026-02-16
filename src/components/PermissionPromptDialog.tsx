import React, { useState } from "react";
import {
  Shield,
  Terminal,
  FileEdit,
  FolderOpen,
  Globe,
  Wrench,
  HelpCircle,
  CheckCircle2,
  Circle,
  CheckSquare,
  Square,
  Send,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  onAllow: ( updatedInput?: Record<string, any> ) => void;
  onDeny: () => void;
}

function getToolIcon( toolName: string ) {
  const name = toolName.toLowerCase();
  if ( name.includes( "bash" ) || name.includes( "command" ) || name.includes( "terminal" ) ) {
    return <Terminal className="h-4 w-4" />;
  }
  if ( name.includes( "write" ) || name.includes( "edit" ) || name.includes( "create" ) ) {
    return <FileEdit className="h-4 w-4" />;
  }
  if ( name.includes( "read" ) || name.includes( "glob" ) || name.includes( "list" ) || name.includes( "find" ) ) {
    return <FolderOpen className="h-4 w-4" />;
  }
  if ( name.includes( "fetch" ) || name.includes( "web" ) || name.includes( "http" ) ) {
    return <Globe className="h-4 w-4" />;
  }
  return <Wrench className="h-4 w-4" />;
}

/**
 * Sub-component for rendering AskUserQuestion inside the permission dialog.
 * Shows one question at a time with Next/Back navigation and Submit on the last step.
 */
const AskUserQuestionForm: React.FC<{
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
  onSubmit: ( answers: Record<string, string> ) => void;
  onDeny: () => void;
}> = ( { questions, onSubmit, onDeny } ) => {
  const OTHER_KEY = "__other__";
  const [currentStep, setCurrentStep] = useState( 0 );

  const [selections, setSelections] = useState<Map<number, Set<string>>>( () => {
    const init = new Map<number, Set<string>>();
    questions.forEach( ( _, i ) => init.set( i, new Set() ) );
    return init;
  } );

  const [otherTexts, setOtherTexts] = useState<Map<number, string>>( () => {
    const init = new Map<number, string>();
    questions.forEach( ( _, i ) => init.set( i, "" ) );
    return init;
  } );

  const toggleSelection = ( questionIdx: number, label: string, multiSelect: boolean ) => {
    setSelections( prev => {
      const next = new Map( prev );
      const current = new Set( prev.get( questionIdx ) || [] );

      if ( multiSelect ) {
        if ( current.has( label ) ) {
          current.delete( label );
        } else {
          current.add( label );
        }
      } else {
        current.clear();
        current.add( label );
      }

      next.set( questionIdx, current );
      return next;
    } );
  };

  const handleOtherTextChange = ( questionIdx: number, text: string ) => {
    setOtherTexts( prev => {
      const next = new Map( prev );
      next.set( questionIdx, text );
      return next;
    } );
  };

  const currentStepHasSelection = ( () => {
    const s = selections.get( currentStep );
    if ( !s || s.size === 0 ) return false;
    if ( s.size === 1 && s.has( OTHER_KEY ) ) {
      return ( otherTexts.get( currentStep )?.trim() || "" ).length > 0;
    }
    return true;
  } )();

  const isLastStep = currentStep === questions.length - 1;
  const isSingleQuestion = questions.length === 1;

  const handleSubmit = () => {
    const answers: Record<string, string> = {};

    questions.forEach( ( q, idx ) => {
      const selected = selections.get( idx ) || new Set();
      const labels: string[] = [];

      selected.forEach( key => {
        if ( key === OTHER_KEY ) {
          const txt = otherTexts.get( idx )?.trim();
          if ( txt ) labels.push( txt );
        } else {
          labels.push( key );
        }
      } );

      if ( labels.length > 0 ) {
        answers[q.question] = labels.join( ", " );
      }
    } );

    onSubmit( answers );
  };

  const q = questions[currentStep];
  const selected = selections.get( currentStep ) || new Set();
  const isOtherSelected = selected.has( OTHER_KEY );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-purple-500" />
          Question from Claude
        </DialogTitle>
        <DialogDescription className="flex items-center justify-between">
          <span>Claude needs your input to continue.</span>
          {!isSingleQuestion && (
            <span className="text-xs text-muted-foreground">
              {currentStep + 1} / {questions.length}
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

      {/* Step indicator dots */}
      {!isSingleQuestion && (
        <div className="flex items-center justify-center gap-1.5 py-1">
          {questions.map( ( _, i ) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentStep( i )}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === currentStep
                  ? "w-6 bg-purple-500"
                  : selections.get( i )?.size
                    ? "w-1.5 bg-purple-500/50"
                    : "w-1.5 bg-muted-foreground/30"
              )}
            />
          ) )}
        </div>
      )}

      {/* Current question */}
      <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto">
        <div className="space-y-1.5">
          <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/20">
            {q.header}
          </Badge>
          <p className="text-sm font-medium">{q.question}</p>
        </div>

        <div className="grid gap-2">
          {q.options.map( ( opt ) => {
            const isSelected = selected.has( opt.label );
            const SelectIcon = q.multiSelect
              ? ( isSelected ? CheckSquare : Square )
              : ( isSelected ? CheckCircle2 : Circle );

            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => toggleSelection( currentStep, opt.label, q.multiSelect )}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                  isSelected
                    ? "border-purple-500/40 bg-purple-500/10"
                    : "border-border bg-card/50 hover:bg-muted/50"
                )}
              >
                <SelectIcon className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  isSelected ? "text-purple-500" : "text-muted-foreground"
                )} />
                <div className="space-y-0.5 min-w-0">
                  <span className={cn( "text-sm font-medium", isSelected && "text-purple-500" )}>
                    {opt.label}
                  </span>
                  {opt.description && (
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  )}
                </div>
              </button>
            );
          } )}

          {/* "Other" option */}
          <button
            type="button"
            onClick={() => toggleSelection( currentStep, OTHER_KEY, q.multiSelect )}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
              isOtherSelected
                ? "border-purple-500/40 bg-purple-500/10"
                : "border-border bg-card/50 hover:bg-muted/50"
            )}
          >
            {( () => {
              const OtherIcon = q.multiSelect
                ? ( isOtherSelected ? CheckSquare : Square )
                : ( isOtherSelected ? CheckCircle2 : Circle );
              return (
                <OtherIcon className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  isOtherSelected ? "text-purple-500" : "text-muted-foreground"
                )} />
              );
            } )()}
            <div className="space-y-1.5 min-w-0 flex-1">
              <span className={cn( "text-sm font-medium", isOtherSelected && "text-purple-500" )}>
                Other
              </span>
              {isOtherSelected && (
                <Input
                  autoFocus
                  placeholder="Type your answer..."
                  value={otherTexts.get( currentStep ) || ""}
                  onChange={( e ) => handleOtherTextChange( currentStep, e.target.value )}
                  onClick={( e ) => e.stopPropagation()}
                  className="text-sm h-8"
                />
              )}
            </div>
          </button>
        </div>
      </div>

      <DialogFooter className="flex items-center justify-between sm:justify-between">
        <Button variant="outline" onClick={onDeny}>
          Skip
        </Button>
        <div className="flex items-center gap-2">
          {!isSingleQuestion && currentStep > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCurrentStep( s => s - 1 )} className="gap-1">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          )}
          {isLastStep ? (
            <Button disabled={!currentStepHasSelection} onClick={handleSubmit} className="gap-2">
              <Send className="h-3.5 w-3.5" />
              Submit
            </Button>
          ) : (
            <Button disabled={!currentStepHasSelection} onClick={() => setCurrentStep( s => s + 1 )} className="gap-2">
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
};

export function PermissionPromptDialog( {
  open,
  toolName,
  input,
  onAllow,
  onDeny,
}: PermissionPromptDialogProps ) {
  const isAskUserQuestion = toolName === "AskUserQuestion" && input?.questions;

  const handleQuestionSubmit = ( answers: Record<string, string> ) => {
    onAllow( {
      questions: input.questions,
      answers,
    } );
  };

  return (
    <Dialog open={open} onOpenChange={( isOpen ) => { if ( !isOpen ) onDeny(); }}>
      <DialogContent className={cn( "max-w-lg", isAskUserQuestion && "max-w-xl" )}>
        {isAskUserQuestion ? (
          <AskUserQuestionForm
            questions={input.questions}
            onSubmit={handleQuestionSubmit}
            onDeny={onDeny}
          />
        ) : (
          <>
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
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tool:</span>
                <Badge variant="secondary" className="flex items-center gap-1.5">
                  {getToolIcon( toolName )}
                  {toolName}
                </Badge>
              </div>

              {input && Object.keys( input ).length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Input:</span>
                  <pre className="text-xs rounded-md bg-muted/50 p-3 border overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {JSON.stringify( input, null, 2 )}
                  </pre>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={onDeny}>
                Deny
              </Button>
              <Button onClick={() => onAllow()}>
                Allow
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
