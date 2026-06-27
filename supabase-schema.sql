create table if not exists public.cash_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  amount_cents integer not null check (amount_cents > 0),
  payment text not null check (payment in ('dinheiro', 'pix', 'credito', 'debito')),
  shift text not null check (shift in ('manha', 'tarde', 'noite')),
  sale_number integer not null,
  description text not null default '',
  entry_time text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.cash_day_meta (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  closed boolean not null default false,
  closed_at timestamptz,
  event_tag text not null default 'normal',
  custom_event text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index if not exists cash_entries_user_date_idx
  on public.cash_entries (user_id, date);

create index if not exists cash_day_meta_user_date_idx
  on public.cash_day_meta (user_id, date);

alter table public.cash_entries enable row level security;
alter table public.cash_day_meta enable row level security;

drop policy if exists cash_entries_select_own on public.cash_entries;
drop policy if exists cash_entries_insert_own on public.cash_entries;
drop policy if exists cash_entries_update_own on public.cash_entries;
drop policy if exists cash_entries_delete_own on public.cash_entries;

create policy cash_entries_select_own
  on public.cash_entries for select
  to authenticated
  using (auth.uid() = user_id);

create policy cash_entries_insert_own
  on public.cash_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy cash_entries_update_own
  on public.cash_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy cash_entries_delete_own
  on public.cash_entries for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists cash_day_meta_select_own on public.cash_day_meta;
drop policy if exists cash_day_meta_insert_own on public.cash_day_meta;
drop policy if exists cash_day_meta_update_own on public.cash_day_meta;
drop policy if exists cash_day_meta_delete_own on public.cash_day_meta;

create policy cash_day_meta_select_own
  on public.cash_day_meta for select
  to authenticated
  using (auth.uid() = user_id);

create policy cash_day_meta_insert_own
  on public.cash_day_meta for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy cash_day_meta_update_own
  on public.cash_day_meta for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy cash_day_meta_delete_own
  on public.cash_day_meta for delete
  to authenticated
  using (auth.uid() = user_id);

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
