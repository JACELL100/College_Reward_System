-- College Reward Points (CRP) — database schema (idempotent).
-- Applied by `python migrate.py`. All addresses stored lowercase.

create table if not exists profiles (
  id uuid primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text not null default 'student' check (role in ('student','issuer','admin')),
  wallet_address text unique,
  department text,
  roll_no text,
  gas_dripped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists reward_categories (
  id serial primary key,
  name text unique not null,
  description text,
  default_points int not null check (default_points > 0),
  icon text,
  active bool default true,
  created_at timestamptz default now()
);

create table if not exists store_items (
  id serial primary key,
  name text not null,
  description text,
  cost int not null check (cost > 0),
  stock int,
  icon text,
  active bool default true,
  created_at timestamptz default now()
);

create table if not exists chain_events (
  tx_hash text,
  log_index int,
  block_number bigint not null,
  block_time timestamptz,
  event text not null,
  from_address text,
  to_address text,
  amount numeric(78,0),
  reason text,
  item_id bigint,
  issuer text,
  primary key (tx_hash, log_index)
);

create table if not exists tx_meta (
  tx_hash text primary key,
  category_id int references reward_categories(id),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists redemptions (
  id serial primary key,
  tx_hash text unique not null,
  profile_id uuid references profiles(id),
  wallet_address text not null,
  item_id int references store_items(id),
  amount int not null,
  status text not null default 'pending' check (status in ('pending','fulfilled','rejected')),
  code text not null,
  created_at timestamptz default now(),
  fulfilled_at timestamptz,
  fulfilled_by uuid references profiles(id)
);

create table if not exists sync_state (
  key text primary key,
  last_block bigint not null,
  updated_at timestamptz default now()
);

create index if not exists chain_events_to_idx on chain_events (to_address);
create index if not exists chain_events_from_idx on chain_events (from_address);
create index if not exists chain_events_block_idx on chain_events (block_number desc);
create index if not exists chain_events_event_idx on chain_events (event);
create index if not exists redemptions_profile_idx on redemptions (profile_id);
create index if not exists redemptions_status_idx on redemptions (status);

-- RLS on, no policies: only the backend's postgres role (bypasses RLS) can access.
alter table profiles enable row level security;
alter table reward_categories enable row level security;
alter table store_items enable row level security;
alter table chain_events enable row level security;
alter table tx_meta enable row level security;
alter table redemptions enable row level security;
alter table sync_state enable row level security;

-- Seed data
insert into reward_categories (name, description, default_points, icon) values
  ('Hackathon Win', 'Winning or placing in a hackathon', 200, 'Trophy'),
  ('Paper Publication', 'Publishing a research paper in a journal or conference', 300, 'FileText'),
  ('Event Volunteering', 'Volunteering at a college event or fest', 50, 'HandHeart'),
  ('Perfect Attendance', '100% attendance for the month/semester', 100, 'CalendarCheck'),
  ('Sports Achievement', 'Representing or winning for the college in sports', 150, 'Medal'),
  ('Club Leadership', 'Leading a student club or committee', 120, 'Users')
on conflict (name) do nothing;

insert into store_items (name, description, cost, stock, icon)
select v.name, v.description, v.cost, v.stock, v.icon from (values
  ('Canteen Meal Voucher', 'One full meal at the college canteen', 50, null::int, 'UtensilsCrossed'),
  ('Library Late-Fee Waiver', 'Waive one library late fee', 80, null::int, 'BookOpen'),
  ('College Hoodie', 'Official FRCRCE hoodie', 400, 25, 'Shirt'),
  ('Printing Credits ×50 pages', '50 pages of printing at the college print centre', 30, null::int, 'Printer'),
  ('Fest Pass', 'Entry pass to the annual college fest', 250, 100, 'Ticket'),
  ('Lab Priority Slot', 'Priority booking for a lab slot', 120, null::int, 'FlaskConical')
) as v(name, description, cost, stock, icon)
where not exists (select 1 from store_items);
