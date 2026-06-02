import { supabase } from "@/integrations/supabase/client";

const INTERVAL_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Re-queue recurring items whose interval has elapsed since they were stocked.
 * Sets status back to 'needed' so they reappear in the shopping list.
 */
export async function requeueRecurringItems(familyId: string) {
  const { data, error } = await supabase
    .from("items")
    .select("id,recur_interval,updated_at")
    .eq("family_id", familyId)
    .eq("is_recurring", true)
    .eq("status", "stocked");
  if (error || !data?.length) return;

  const now = Date.now();
  const toReset: string[] = [];
  for (const it of data) {
    const ms = INTERVAL_MS[String(it.recur_interval ?? "")];
    if (!ms) continue;
    const updated = new Date(it.updated_at as string).getTime();
    if (now - updated >= ms) toReset.push(it.id as string);
  }
  if (toReset.length) {
    await supabase.from("items").update({ status: "needed" }).in("id", toReset);
  }
}
