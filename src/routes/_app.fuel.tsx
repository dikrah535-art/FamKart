import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Fuel, Bus, Wrench, Car, MapPin, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BackButton } from "@/components/BackButton";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_app/fuel")({ component: FuelPage });

const INDIAN_STATES = [
  "Andhra Pradesh", "Bihar", "Chhattisgarh", "Delhi", "Goa", 
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", 
  "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", 
  "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

type FuelType = "Petrol" | "Diesel" | "CNG";
type Hist = { id: string; item_name: string; cost: number | null; purchased_at: string };

function FuelPage() {
  const { family, user } = useAuth();
  const [fuelType, setFuelType] = useState<FuelType>("Petrol");
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [lastEdit, setLastEdit] = useState<"L" | "C">("L");
  const [maint, setMaint] = useState("");
  const [cab, setCab] = useState("");
  const [hist, setHist] = useState<Hist[]>([]);
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);

  // Core reactive fuel states
  const [stateName, setStateName] = useState<string>("Rajasthan");
  const [fuelRates, setFuelRates] = useState<Record<FuelType, number>>({ Petrol: 112.70, Diesel: 98.39, CNG: 96.00 });
  const [ratesLoading, setRatesLoading] = useState(true);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const price = fuelRates[fuelType];

  // Fetches accurate database variables dynamically
  const fetchStateRates = async (targetState: string) => {
    setRatesLoading(true);
    console.log(`[Fuel Sync] Querying DB for state: "${targetState}"`);
    
    const { data, error } = await supabase
      .from("daily_fuel_rates")
      .select("state_name, petrol_rate, diesel_rate, cng_rate")
      .ilike("state_name", targetState)
      .maybeSingle();

    if (error) {
      console.error("[Fuel Sync] Supabase query error:", error);
    }

    if (data) {
      console.log("[Fuel Sync] Database record matched:", data);
      setFuelRates({
        Petrol: Number(data.petrol_rate),
        Diesel: Number(data.diesel_rate),
        CNG: Number(data.cng_rate)
      });
    } else {
      console.warn(`[Fuel Sync] Warning: "${targetState}" missing from table rows.`);
    }
    setRatesLoading(false);
  };

  // Sync state view and set live web channel pipeline
  useEffect(() => {
    async function initLocation() {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("preferred_state")
        .eq("id", user.id)
        .single();

      const activeState = data?.preferred_state || "Rajasthan";
      setStateName(activeState);
      fetchStateRates(activeState);
    }
    initLocation();

    const channel = supabase
      .channel("live_fuel_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_fuel_rates" },
        () => {
          // Triggers instant background redraw when values shift
          fetchStateRates(stateName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, stateName]);

  // Dropdown persistence update handler
  const handleStateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextState = e.target.value;
    setStateName(nextState);
    await fetchStateRates(nextState);

    if (user?.id) {
      setUpdatingProfile(true);
      await supabase
        .from("profiles")
        .update({ preferred_state: nextState })
        .eq("id", user.id);
      setUpdatingProfile(false);
    }
  };

  // bi-directional calculator sync
  useEffect(() => {
    if (lastEdit !== "L") return;
    const l = parseFloat(litres);
    if (!isNaN(l) && l > 0) setCost((l * price).toFixed(2));
    else if (litres === "") setCost("");
  }, [litres, price, lastEdit]);

  useEffect(() => {
    if (lastEdit !== "C") return;
    const c = parseFloat(cost);
    if (!isNaN(c) && c > 0) setLitres((c / price).toFixed(2));
    else if (cost === "") setLitres("");
  }, [cost, price, lastEdit]);

  const load = async () => {
    if (!family) return;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: all } = await supabase
      .from("purchase_history")
      .select("id,item_name,cost,purchased_at")
      .eq("family_id", family.id)
      .gte("purchased_at", monthStart)
      .order("purchased_at", { ascending: false });
    const list = (all as Hist[]) ?? [];
    setHist(list.filter((h) => /^(Fuel|Transport):/i.test(h.item_name)).slice(0, 20));
    setSpent(list.reduce((s, h) => s + (Number(h.cost) || 0), 0));
    setBudget(Number(family.monthly_budget) || 0);
  };
  
  useEffect(() => { load(); }, [family]);

  const remaining = Math.max(0, budget - spent);

  const logFuel = async () => {
    if (!family || !user) return;
    const c = parseFloat(cost);
    const l = parseFloat(litres);
    if (!c || c <= 0 || !l || l <= 0) return toast.error("Enter litres or cost");
    const { error } = await supabase.from("purchase_history").insert({
      family_id: family.id,
      item_name: `Fuel: ${fuelType} (${l.toFixed(2)} ${fuelType === "CNG" ? "Kg" : "L"})`,
      cost: c,
      quantity: l,
      unit: fuelType === "CNG" ? "Kg" : "L",
      purchased_by: user.id,
    });
    if (error) return toast.error(friendlyError(error));
    toast.success(`Logged ₹${c.toFixed(0)} • ${l.toFixed(2)} ${fuelType === "CNG" ? "Kg" : "L"}`);
    setLitres(""); setCost("");
    load();
  };

  const logTransport = async (kind: "Maintenance" | "Cab", amt: string, clear: () => void) => {
    if (!family || !user) return;
    const n = parseFloat(amt);
    if (!n || n <= 0) return toast.error("Enter amount");
    const { error } = await supabase.from("purchase_history").insert({
      family_id: family.id,
      item_name: `Transport: ${kind}`,
      cost: n,
      purchased_by: user.id,
    });
    if (error) return toast.error(friendlyError(error));
    toast.success(`${kind} logged: ₹${n.toFixed(0)}`);
    clear();
    load();
  };

  return (
    <div className="space-y-6">
      <BackButton />
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Fuel & Transport</h1>
          <p className="text-sm text-muted-foreground">Track refills, fares and maintenance — auto-deducted from your monthly budget.</p>
          
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span>Tracking Rates for: </span>
            <select
              value={stateName}
              onChange={handleStateChange}
              disabled={updatingProfile}
              className="bg-transparent border-none text-primary font-semibold focus:outline-none cursor-pointer underline underline-offset-2"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st} className="bg-card text-foreground">{st}</option>
              ))}
            </select>
            {ratesLoading && <RefreshCw className="h-3 w-3 animate-spin text-primary ml-1" />}
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Monthly budget" value={inr(budget)} />
        <Stat label="Spent this month" value={inr(spent)} accent />
        <Stat label="Remaining" value={inr(remaining)} good />
      </div>

      <Tabs defaultValue="fuel">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="fuel"><Fuel className="mr-2 h-4 w-4" /> Fuel</TabsTrigger>
          <TabsTrigger value="transport"><Bus className="mr-2 h-4 w-4" /> Transport</TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {(["Petrol", "Diesel", "CNG"] as FuelType[]).map((k) => (
              <motion.button
                key={k} type="button" onClick={() => setFuelType(k)}
                whileHover={{ y: -2 }}
                className={`rounded-xl border p-4 text-left transition-all ${
                  fuelType === k
                    ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(62,207,142,0.25)]"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
                <p className="mt-1 text-2xl font-bold">
                  ₹{fuelRates[k].toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground">/{k === "CNG" ? "Kg" : "L"}</span>
                </p>
              </motion.button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 font-semibold">Bi-directional calculator</h3>
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto]">
              <div>
                <Label className="text-xs text-muted-foreground">{fuelType === "CNG" ? "Kilograms (Kg)" : "Litres"}</Label>
                <Input
                  type="number" inputMode="decimal" placeholder="0"
                  value={litres}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => { setLastEdit("L"); setLitres(e.target.value); }}
                />
              </div>
              <div className="hidden self-end pb-2 text-muted-foreground md:block">×</div>
              <div>
                <Label className="text-xs text-muted-foreground">Total cost (₹)</Label>
                <Input
                  type="number" inputMode="decimal" placeholder="0"
                  value={cost}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => { setLastEdit("C"); setCost(e.target.value); }}
                />
              </div>
              <div className="self-end">
                <Button onClick={logFuel} className="w-full md:w-auto">Log refill</Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {fuelType} @ ₹{price.toFixed(2)}/{fuelType === "CNG" ? "Kg" : "L"} — pulled automatically based on your saved location profile ({stateName}).
            </p>
          </div>
        </TabsContent>

        <TabsContent value="transport" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <TransportCard
              icon={<Wrench className="h-5 w-5 text-primary" />}
              title="Maintenance"
              desc="Servicing, repairs, parts"
              value={maint} setValue={setMaint}
              onSubmit={() => logTransport("Maintenance", maint, () => setMaint(""))}
            />
            <TransportCard
              icon={<Car className="h-5 w-5 text-primary" />}
              title="Cab / Auto"
              desc="Ride fares, parking"
              value={cab} setValue={setCab}
              onSubmit={() => logTransport("Cab", cab, () => setCab(""))}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4 font-semibold">Recent entries (this month)</div>
        {hist.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No fuel or transport entries yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {hist.map((h) => (
              <li key={h.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">{h.item_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(h.purchased_at).toLocaleString("en-IN")}</p>
                </div>
                <p className="font-semibold text-primary">{inr(Number(h.cost) || 0)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent, good }: { label: string; value: string; accent?: boolean; good?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${good ? "text-primary" : accent ? "text-foreground" : ""}`}>{value}</p>
    </div>
  );
}

function TransportCard({
  icon, title, desc, value, setValue, onSubmit,
}: {
  icon: React.ReactNode; title: string; desc: string;
  value: string; setValue: (v: string) => void; onSubmit: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">{icon}<h3 className="font-semibold">{title}</h3></div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
          <Input
            type="number" inputMode="decimal" placeholder="0" value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button onClick={onSubmit}>Log</Button>
      </div>
    </div>
  );
}
