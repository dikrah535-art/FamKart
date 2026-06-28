import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, RefreshCw, FileText, CloudCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function Notebook() {
  const { family, user } = useAuth();
  const [content, setContent] = useState<string>("");
  const [syncStatus, setSyncStatus] = useState<"synced" | "draft" | "saving" | "error">("synced");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // References used for control logic, queue handling, and state evaluations
  const localStorageKey = family?.id ? `famkart_notebook_draft_${family.id}` : null;
  const isSavingRef = useRef<boolean>(false);
  const serverContentRef = useRef<string>("");
  const pendingContentRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial State Initialization and Realtime Sync Subscriptions
  useEffect(() => {
    if (!family?.id) return;

    // Load baseline data from server
    async function loadInitialNotebook() {
      try {
        const { data, error } = await supabase
          .from("family_notebooks")
          .select("content")
          .eq("family_id", family.id)
          .maybeSingle();

        if (error) throw error;

        const serverText = data?.content || "";
        serverContentRef.current = serverText;

        // Check if a client-side recovery draft exists from a previous crash or offline period
        const cachedDraft = localStorageKey ? localStorage.getItem(localStorageKey) : null;

        if (cachedDraft !== null && cachedDraft !== serverText) {
          setContent(cachedDraft);
          setSyncStatus("draft");
        } else {
          setContent(serverText);
          setSyncStatus("synced");
        }
      } catch (err: any) {
        console.error("[Notebook Sync] Initial fetch error:", err);
        handleSystemError(err);
      }
    }

    loadInitialNotebook();

    // Set up Realtime listener focused exclusively on this family's row changes
    const channel = supabase
      .channel(`notebook_family_${family.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "family_notebooks",
          filter: `family_id=eq.${family.id}`,
        },
        (payload: any) => {
          const incomingContent = payload.new?.content ?? "";
          
          // Only update local state if the edit originated from another family member
          if (payload.new?.updated_by !== user?.id) {
            serverContentRef.current = incomingContent;
            
            // Overwrite locally if there are no pending unsaved local edits
            if (syncStatus === "synced" || content === serverContentRef.current) {
              setContent(incomingContent);
              if (localStorageKey) localStorage.removeItem(localStorageKey);
              setSyncStatus("synced");
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [family?.id, user?.id]);

  // 2. Central Structural Error Routing Engine
  const handleSystemError = (error: any) => {
    console.error("[Notebook Critical Error Log]:", error);
    setSyncStatus("error");

    if (!navigator.onLine) {
      setErrorMessage("Network offline");
      return;
    }

    if (error.code === "PGRST116") {
      setErrorMessage("Notebook unavailable");
      return;
    }
    if (error.code === "42501" || error.status === 403) {
      setErrorMessage("Permission denied");
      return;
    }
    if (error.code === "23505") {
      setErrorMessage("Duplicate constraint");
      return;
    }

    setErrorMessage(error.message || "Database unavailable");
  };

  // 3. Isolated Core Database Transaction Engine
  const executeServerSave = async (textToSave: string) => {
    if (!family?.id || !user?.id) {
      toast.error("Family profile context not resolved");
      return;
    }

    isSavingRef.current = true;
    setSyncStatus("saving");
    setErrorMessage(null);

    try {
      const { error } = await supabase.from("family_notebooks").upsert(
        {
          family_id: family.id,
          content: textToSave,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "family_id" }
      );

      if (error) throw error;

      serverContentRef.current = textToSave;
      
      // If the save payload matches the current client state, clean cache
      if (localStorageKey && localStorage.getItem(localStorageKey) === textToSave) {
        localStorage.removeItem(localStorageKey);
      }

      setSyncStatus("synced");
    } catch (err: any) {
      handleSystemError(err);
      throw err;
    } finally {
      isSavingRef.current = false;

      // Processing next item in the save queue if changes occurred during processing
      if (pendingContentRef.current !== null) {
        const nextText = pendingContentRef.current;
        pendingContentRef.current = null;
        executeServerSave(nextText);
      }
    }
  };

  // 4. Thread-Safe Transaction Request Queue
  const queueSaveRequest = (targetText: string) => {
    if (targetText === serverContentRef.current) {
      setSyncStatus("synced");
      if (localStorageKey) localStorage.removeItem(localStorageKey);
      return;
    }

    if (isSavingRef.current) {
      pendingContentRef.current = targetText;
    } else {
      executeServerSave(targetText);
    }
  };

  // 5. Input Mutation Handler
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setSyncStatus("draft");
    setErrorMessage(null);

    // Immediate local durability sync (protects against crash/refresh/disconnect)
    if (localStorageKey) {
      localStorage.setItem(localStorageKey, val);
    }

    // Clear and reset the auto-save debounce loop
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (val === serverContentRef.current) {
      setSyncStatus("synced");
      if (localStorageKey) localStorage.removeItem(localStorageKey);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      queueSaveRequest(val);
    }, 1500);
  };

  // 6. Manual Save Action Click Handler
  const handleManualSave = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (content === serverContentRef.current) {
      toast.info("No modifications detected");
      return;
    }
    queueSaveRequest(content);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">Family Shared Notebook</h3>
            <p className="text-xs text-muted-foreground">Collaborative space for notes — updates instantly for all family members.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Reactive Status Metrics Badge */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {syncStatus === "synced" && (
              <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <CloudCheck className="h-3.5 w-3.5" /> Synced
              </span>
            )}
            {syncStatus === "draft" && (
              <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                Unsaved Draft
              </span>
            )}
            {syncStatus === "saving" && (
              <span className="flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" /> Saving...
              </span>
            )}
            {syncStatus === "error" && (
              <span className="flex items-center gap-1 text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-3.5 w-3.5" /> Error: {errorMessage}
              </span>
            )}
          </div>

          <Button
            size="sm"
            onClick={handleManualSave}
            disabled={syncStatus === "saving" || content === serverContentRef.current}
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            <Save className="h-3.5 w-3.5" />
            Save Entry
          </Button>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={handleTextareaChange}
        placeholder="Type shared household checklists, guidelines, or sudden ideas here..."
        className="min-h-[220px] resize-y bg-background border-border text-foreground focus-visible:ring-primary font-sans leading-relaxed"
      />
    </div>
  );
}
