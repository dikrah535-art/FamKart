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
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", 
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", 
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", 
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi"
];

type FuelType = "Petrol" | "Diesel" | "CNG";
type Hist = { id: string; item_name: string; cost: number | null; purchased_at: string };

function FuelPage() {
  const { family, user } = useAuth();
  const [stateName, setStateName] = useState<string>("Rajasthan");
  const [fuelType, setFuelType] = useState<FuelType>("Petrol");
  const [fuelRates, setFuelRates] = useState<Record<FuelType, number>>({ Petrol: 100, Diesel: 90, CNG: 85 });
  const [ratesLoading, setRatesLoading] = useState(true);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [lastEdit, setLastEdit] = useState<"L" | "C">("L");
  const [maint, setMaint] = useState("");
  const [cab, setCab] = useState("");
  const [hist, setHist] = useState<Hist[]>([]);
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);

  const price = fuelRates[fuelType];

  // 1. Fetch live rates for chosen state
  const fetchStateRates = async (targetState: string) => {
    setRatesLoading(true);
    const { data, error } = await supabase
      .from("daily_fuel_rates")
      .select("petrol_rate, diesel_rate, cng_rate")
      .eq("state_name", targetState)
      .single();

    if (data && !error) {
      setFuelRates({
        Petrol: Number(data.petrol_rate),
        Diesel: Number(data.diesel_rate),
        CNG: Number(data.cng_rate)
      });
    } else {
      // Fallbacks if sync hasn't run for that state yet
      setFuelRates({ Petrol: 100, Diesel: 90, CNG: 85 });
    }
    setRatesLoading(false);
  };

  // 2. Initialize State preference from profile
  useEffect(() => {
    async function initLocation() {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("preferred_state")
        .eq("id", user.id)
        .single();

      if (data?.preferred_state) {
        setStateName(data.preferred_state);
        fetchStateRates(data.preferred_state);
      } else {
        fetchStateRates("Rajasthan");
      }
    }
    initLocation();
  }, [user]);

  // 3. Handle persistent state switcher change
  const handleStateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextState = e.target.value;
    setStateName(nextState);
    fetchStateRates(nextState);

    if (user?.id) {
      setUpdatingProfile(true);
      await supabase
        .from("profiles")
        .update({ preferred_state: nextState })
        .eq("id", user.id);
      setUpdatingProfile(false);
    }
  };

  // Bi-directional calculations sync
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
    <div className="space-y-6 font-mono">
      <BackButton />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Fuel & Transport</h1>
          <p className="text-sm text-zinc-400 mt-1">Track refills, fares and maintenance metrics linked to your ledger.</p>
        </div>

        {/* Tally Theme State Configuration Switcher */}
        <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl flex items-center gap-3 relative min-w-[240px]">
          <div className="absolute top-0 left-0 w-full h-[1.5px] bg-[#3ECF8E]" />
          <MapPin className="h-4 w-4 text-[#3ECF8E] shrink-0" />
          <div className="flex-1">
            <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-0.5">Active Region</label>
            <select
              value={stateName}
              onChange={handleStateChange}
              disabled={updatingProfile}
              className="bg-transparent text-sm text-[#3ECF8E] font-bold focus:outline-none w-full cursor-pointer"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st} className="bg-zinc-950 text-white">{st}</option>
              ))}
            </select>
          </div>
          {ratesLoading && <RefreshCw className="h-3 w-3 animate-spin text-[#3ECF8E]" />}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Monthly budget" value={inr(budget)} />
        <Stat label="Spent this month" value={inr(spent)} accent />
        <Stat label="Remaining" value={inr(remaining)} good />
      </div>

      <Tabs defaultValue="fuel">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-zinc-950 border border-zinc-800 p-1 rounded-xl">
          <TabsTrigger value="fuel" className="data-[state=active]:bg-zinc-900 data-[state=active]:text-[#3ECF8E] rounded-lg font-bold">
            <Fuel className="mr-2 h-4 w-4" /> Fuel Ledger
          </TabsTrigger>
          <TabsTrigger value="transport" className="data-[state=active]:bg-zinc-900 data-[state=active]:text-[#3ECF8E] rounded-lg font-bold">
            <Bus className="mr-2 h-4 w-4" /> Logs & Fares
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="space-y-4 pt-2">
          {/* Engine Slabs Display */}
          <div className="grid grid-cols-3 gap-3">
            {(["Petrol", "Diesel", "CNG"] as FuelType[]).map((k) => (
              <motion.button
                key={k} type="button" onClick={() => setFuelType(k)}
                whileHover={{ y: -1 }}
                className={`rounded-xl border p-4 text-left font-mono relative overflow-hidden transition-all ${
                  fuelType === k
                    ? "border-[#3ECF8E] bg-[#3ECF8E]/5 shadow-[0_0_15px_rgba(62,207,142,0.15)]"
                    : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                }`}
              >
                {fuelType === k && <div className="absolute left-0 top-0 h-full w-[3px] bg-[#3ECF8E]" />}
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{k}</p>
                <p className="mt-1 text-xl md:text-2xl font-bold text-white">
                  ₹{fuelRates[k].toFixed(2)}
                  <span className="text-xs font-normal text-zinc-500">/{k === "CNG" ? "Kg" : "L"}</span>
                </p>
              </motion.button>
            ))}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <h3 className="mb-4 font-semibold text-sm text-zinc-300 uppercase tracking-wider">Bi-directional calculator</h3>
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto]">
              <div>
                <Label className="text-xs text-zinc-500 uppercase tracking-wide">{fuelType === "CNG" ? "Kilograms (Kg)" : "Litres (L)"}</Label>
                <Input
                  type="number" inputMode="decimal" placeholder="0"
                  value={litres}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => { setLastEdit("L"); setLitres(e.target.value); }}
                  className="bg-black border-zinc-800 text-white focus-visible:ring-[#3ECF8E]"
                />
              </div>
              <div className="hidden self-end pb-2 text-zinc-600 font-bold md:block text-lg">×</div>
              <div>
                <Label className="text-xs text-zinc-500 uppercase tracking-wide">Total cost (₹)</Label>
                <Input
                  type="number" inputMode="decimal" placeholder="0"
                  value={cost}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => { setLastEdit("C"); setCost(e.target.value); }}
                  className="bg-black border-zinc-800 text-white focus-visible:ring-[#3ECF8E]"
                />
              </div>
              <div className="self-end">
                <Button onClick={logFuel} className="w-full md:w-auto bg-[#3ECF8E] text-black hover:bg-[#32b379] font-bold">Log refill</Button>
              </div>
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              {fuelType} dynamic rate: ₹{price.toFixed(2)} based on your saved configuration region ({stateName}).
            </p>
          </div>
        </TabsContent>

        <TabsContent value="transport" className="space-y-4 pt-2">
          <div className="grid gap-4 md:grid-cols-2">
            <TransportCard
              icon={<Wrench className="h-5 w-5 text-[#3ECF8E]" />}
              title="Maintenance"
              desc="Servicing, repairs, parts"
              value={maint} setValue={setMaint}
              onSubmit={() => logTransport("Maintenance", maint, () => setMaint(""))}
            />
            <TransportCard
              icon={<Car className="h-5 w-5 text-[#3ECF8E]" />}
              title="Cab / Auto"
              desc="Ride fares, parking logs"
              value={cab} setValue={setCab}
              onSubmit={() => logTransport("Cab", cab, () => setCab(""))}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <div className="border-b border-zinc-800 p-4 font-semibold text-sm text-zinc-300 uppercase tracking-wider bg-black">Recent entries (this month)</div>
        {hist.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500 text-center">No transactions registered in this track ledger.</p>
        ) : (
          <ul className="divide-y divide-zinc-900 bg-black">
            {hist.map((h) => (
              <li key={h.id} className="flex items-center justify-between p-4 hover:bg-zinc-950/40 transition-colors">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{h.item_name}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{new Date(h.purchased_at).toLocaleString("en-IN")}</p>
                </div>
                <p className="font-bold text-[#3ECF8E]">{inr(Number(h.cost) || 0)}</p>
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 relative overflow-hidden">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${good ? "text-[#3ECF8E]" : accent ? "text-white" : "text-zinc-300"}`}>{value}</p>
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center gap-2">{icon}<h3 className="font-semibold text-white uppercase text-sm tracking-wide">{title}</h3></div>
      <p className="mt-1 text-xs text-zinc-500">{desc}</p>
      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs text-zinc-500 uppercase tracking-wide">Amount (₹)</Label>
          <Input
            type="number" inputMode="decimal" placeholder="0" value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setValue(e.target.value)}
            className="bg-black border-zinc-800 text-white focus-visible:ring-[#3ECF8E]"
          />
        </div>
        <Button onClick={onSubmit} className="bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-700 font-bold">Log</Button>
      </div>
    </div>
  );
}
