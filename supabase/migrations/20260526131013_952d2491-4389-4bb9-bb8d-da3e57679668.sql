
-- Helper: generate 6-char invite code
create or replace function public.generate_invite_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random()*length(chars))::int + 1, 1);
  end loop;
  return result;
end;
$$;

-- FAMILIES
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default public.generate_invite_code(),
  monthly_budget numeric default 0,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  family_id uuid references public.families(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Security definer helper to avoid RLS recursion
create or replace function public.current_family_id()
returns uuid language sql stable security definer set search_path = public as $$
  select family_id from public.profiles where id = auth.uid()
$$;

-- CATEGORIES
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  color text not null default '#3ECF8E',
  created_at timestamptz not null default now()
);
create index on public.categories(family_id);

-- ITEMS
create type public.item_status as enum ('needed','low_stock','stocked');
create type public.item_priority as enum ('urgent','normal','low');
create type public.recur_interval as enum ('daily','weekly','monthly');

create table public.items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  status public.item_status not null default 'needed',
  quantity numeric default 1,
  unit text default 'pcs',
  priority public.item_priority not null default 'normal',
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  is_recurring boolean not null default false,
  recur_interval public.recur_interval,
  estimated_cost numeric default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.items(family_id);
create index on public.items(category_id);

-- PURCHASE HISTORY
create table public.purchase_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  item_name text not null,
  category_id uuid references public.categories(id) on delete set null,
  purchased_by uuid references public.profiles(id) on delete set null,
  purchased_at timestamptz not null default now(),
  quantity numeric default 1,
  unit text,
  cost numeric default 0
);
create index on public.purchase_history(family_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_items_updated before update on public.items
  for each row execute function public.set_updated_at();
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Seed default categories when a family is created
create or replace function public.seed_default_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.categories (family_id, name, icon, color) values
    (new.id, 'Groceries', '🛒', '#3ECF8E'),
    (new.id, 'Personal Care', '🧴', '#7C3AED'),
    (new.id, 'Cleaning Supplies', '🧹', '#06B6D4'),
    (new.id, 'Stationery', '📚', '#F59E0B'),
    (new.id, 'Medicines', '💊', '#EF4444'),
    (new.id, 'Kitchen Essentials', '🍳', '#F97316'),
    (new.id, 'Clothing', '👗', '#EC4899'),
    (new.id, 'Hardware & Tools', '🔧', '#64748B'),
    (new.id, 'Pet Supplies', '🐾', '#84CC16'),
    (new.id, 'Miscellaneous', '📦', '#A1A1AA');
  return new;
end;
$$;
create trigger on_family_created
  after insert on public.families for each row execute function public.seed_default_categories();

-- RLS
alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.purchase_history enable row level security;

-- profiles
create policy "View own or same family profiles" on public.profiles for select
  using (id = auth.uid() or (family_id is not null and family_id = public.current_family_id()));
create policy "Update own profile" on public.profiles for update using (id = auth.uid());
create policy "Insert own profile" on public.profiles for insert with check (id = auth.uid());

-- families
create policy "View own family" on public.families for select
  using (id = public.current_family_id());
create policy "View family by invite (auth)" on public.families for select
  using (auth.uid() is not null);
create policy "Create family" on public.families for insert with check (created_by = auth.uid());
create policy "Update own family" on public.families for update using (id = public.current_family_id());

-- categories
create policy "Family categories select" on public.categories for select
  using (family_id = public.current_family_id());
create policy "Family categories insert" on public.categories for insert
  with check (family_id = public.current_family_id());
create policy "Family categories update" on public.categories for update
  using (family_id = public.current_family_id());
create policy "Family categories delete" on public.categories for delete
  using (family_id = public.current_family_id());

-- items
create policy "Family items select" on public.items for select
  using (family_id = public.current_family_id());
create policy "Family items insert" on public.items for insert
  with check (family_id = public.current_family_id() and created_by = auth.uid());
create policy "Family items update" on public.items for update
  using (family_id = public.current_family_id());
create policy "Family items delete" on public.items for delete
  using (family_id = public.current_family_id());

-- purchase_history
create policy "Family history select" on public.purchase_history for select
  using (family_id = public.current_family_id());
create policy "Family history insert" on public.purchase_history for insert
  with check (family_id = public.current_family_id());
create policy "Family history delete" on public.purchase_history for delete
  using (family_id = public.current_family_id());

-- Realtime
alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.purchase_history;
alter table public.items replica identity full;
alter table public.categories replica identity full;
alter table public.purchase_history replica identity full;
