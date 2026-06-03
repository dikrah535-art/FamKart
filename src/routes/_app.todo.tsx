import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_app/todo")({ component: TodoPage });

type Todo = {
  id: string;
  task_name: string;
  due_date: string;
  assigned_to: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  created_by: string;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TodoPage() {
  const { family, user } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [members, setMembers] = useState<{ id: string; full_name: string | null }[]>([]);
  const today = todayStr();

  const load = async () => {
    if (!family) return;
    const [t, m] = await Promise.all([
      supabase
        .from("todo_entries")
        .select("*")
        .eq("family_id", family.id)
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id,full_name").eq("family_id", family.id),
    ]);
    setTodos((t.data as Todo[]) ?? []);
    setMembers(m.data ?? []);
  };

  useEffect(() => { load(); }, [family]);
  useEffect(() => {
    if (!family) return;
    const ch = supabase
      .channel(`todo:${family.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todo_entries", filter: `family_id=eq.${family.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family]);

  const add = async () => {
    if (!user) return;
    let familyId = family?.id ?? null;
    if (!familyId) {
      const { data: f1 } = await supabase
        .from("families")
        .select("id")
        .eq("created_by", user.id)
        .maybeSingle();
      familyId = f1?.id ?? null;
    }
    if (!familyId) {
      const { data: f2 } = await supabase
        .from("families")
        .select("id")
        .limit(1)
        .maybeSingle();
      familyId = f2?.id ?? null;
    }
    if (!familyId) {
      toast.error("No family found. Create or join a family first.");
      return;
    }
    const { error } = await supabase.from("todo_entries").insert({
      family_id: familyId,
      task_name: "",
      due_date: today,
      created_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    load();
  };

  const updateTodo = async (id: string, patch: Partial<Todo>) => {
    const { error } = await supabase.from("todo_entries").update(patch).eq("id", id);
    if (error) toast.error(friendlyError(error));
  };

  const complete = async (t: Todo) => {
    await updateTodo(t.id, { is_completed: true, completed_at: new Date().toISOString() });
  };

  const remove = async (id: string) => {
    await supabase.from("todo_entries").delete().eq("id", id);
  };

  const memberLabel = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.full_name ?? "Member" : "Anyone";

  return (
    <div className="space-y-4">
      <BackButton />
      <div
        className="rounded-md border p-5 md:p-8"
        style={{
          background: "#1C1814",
          color: "#E8D5B0",
          borderColor: "rgba(255,220,150,0.1)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(255,220,150,0.08) 31px, rgba(255,220,150,0.08) 32px)",
        }}
      >
        <div className="relative pl-10 md:pl-14">
          <span
            className="pointer-events-none absolute top-0 bottom-0 left-8 md:left-12 w-[2px]"
            style={{ background: "rgba(239,68,68,0.3)" }}
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-[Caveat] text-3xl md:text-4xl font-semibold">To-Do List</p>
              <p className="font-[Caveat] text-xl md:text-2xl mt-1 opacity-80">
                {new Date().toLocaleDateString("en-GB", {
                  weekday: "long", day: "2-digit", month: "long", year: "numeric",
                })}
              </p>
            </div>
            <Button
              onClick={add}
              className="gap-1"
              style={{ background: "#3ECF8E", color: "#0a0a0a" }}
            >
              <Plus className="h-4 w-4" /> Add Task
            </Button>
          </div>

          <div className="mt-5 space-y-2">
            {todos.length === 0 && (
              <p className="font-[Caveat] text-xl opacity-60">
                No tasks for today — tap "Add Task" to start.
              </p>
            )}
            <AnimatePresence initial={false}>
              {todos.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 60 }}
                  className="grid grid-cols-12 items-center gap-2 rounded-md px-2 py-2"
                  style={{
                    background: "rgba(255,220,150,0.04)",
                    border: "1px solid rgba(255,220,150,0.12)",
                  }}
                >
                  <div className="col-span-12 md:col-span-5 relative">
                    <Input
                      defaultValue={t.task_name}
                      onBlur={(e) => {
                        if (e.target.value !== t.task_name) updateTodo(t.id, { task_name: e.target.value });
                      }}
                      onFocus={(e) => e.target.select()}
                      placeholder="Task..."
                      disabled={t.is_completed}
                      className="bg-transparent border-0 focus-visible:ring-0 px-0"
                      style={{ color: t.is_completed ? "#A1A1AA" : "#E8D5B0" }}
                    />
                    {t.is_completed && (
                      <motion.span
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                        className="pointer-events-none absolute left-0 top-1/2 h-[2px]"
                        style={{ background: "#3ECF8E" }}
                      />
                    )}
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <Input
                      type="date"
                      defaultValue={t.due_date}
                      disabled={t.is_completed}
                      onBlur={(e) => {
                        if (e.target.value !== t.due_date) updateTodo(t.id, { due_date: e.target.value });
                      }}
                      className="bg-transparent"
                      style={{ color: "#E8D5B0", colorScheme: "dark" }}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Select
                      value={t.assigned_to ?? "none"}
                      disabled={t.is_completed}
                      onValueChange={(v) =>
                        updateTodo(t.id, { assigned_to: v === "none" ? null : v })
                      }
                    >
                      <SelectTrigger className="bg-transparent" style={{ color: "#E8D5B0" }}>
                        <SelectValue>{memberLabel(t.assigned_to)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Anyone</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.full_name ?? "Member"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-10 md:col-span-1 flex justify-end">
                    <Button
                      size="sm"
                      disabled={t.is_completed}
                      onClick={() => complete(t)}
                      style={
                        t.is_completed
                          ? { background: "#3ECF8E", color: "#0a0a0a", opacity: 0.75 }
                          : { background: "transparent", border: "1px solid #3ECF8E", color: "#3ECF8E" }
                      }
                    >
                      {t.is_completed ? "Completed ✓" : "Complete"}
                    </Button>
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <button
                      onClick={() => remove(t.id)}
                      aria-label="Delete"
                      className="opacity-60 hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
