-- 견적 작업실 — Supabase 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 이 내용을 전부 붙여넣고 Run 을 누르세요. (한 번만)

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  col text not null,              -- materials / estimates / settings
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  client_updated bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, col, id)
);
create index if not exists records_user_updated on public.records (user_id, updated_at);

-- 본인 데이터만 읽고 쓸 수 있게
alter table public.records enable row level security;
drop policy if exists "own rows select" on public.records;
drop policy if exists "own rows insert" on public.records;
drop policy if exists "own rows update" on public.records;
drop policy if exists "own rows delete" on public.records;
create policy "own rows select" on public.records for select to authenticated using (auth.uid() = user_id);
create policy "own rows insert" on public.records for insert to authenticated with check (auth.uid() = user_id);
create policy "own rows update" on public.records for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.records for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.records to authenticated;
revoke all on public.records from anon;

-- 변경 시각은 서버 시계로 기록 (기기 시계가 달라도 동기화가 꼬이지 않게)
create or replace function public.records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();
