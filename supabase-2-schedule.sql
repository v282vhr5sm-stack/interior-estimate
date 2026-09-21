-- 견적 작업실 2단계 — 현장 일정 공유 링크 + 도면 파일 보관
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. (한 번만)

-- 1) 공유 스냅샷: 공유 링크로 보여줄 내용만 담습니다. 견적·원가는 절대 들어가지 않습니다.
create table if not exists public.shares (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.shares enable row level security;
drop policy if exists "shares owner all" on public.shares;
create policy "shares owner all" on public.shares for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.shares to authenticated;
revoke all on public.shares from anon;

-- 링크를 아는 사람만 그 현장 내용을 볼 수 있게 하는 함수 (목록 조회는 불가능)
create or replace function public.get_share(p_token text)
returns jsonb language sql security definer stable set search_path = public as $$
  select payload from public.shares where token = p_token;
$$;
grant execute on function public.get_share(text) to anon, authenticated;

-- 2) 도면·사진 보관함
insert into storage.buckets (id, name, public)
values ('plans', 'plans', true)
on conflict (id) do update set public = true;

drop policy if exists "plans owner insert" on storage.objects;
drop policy if exists "plans owner update" on storage.objects;
drop policy if exists "plans owner delete" on storage.objects;
create policy "plans owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'plans' and owner = auth.uid());
create policy "plans owner update" on storage.objects for update to authenticated
  using (bucket_id = 'plans' and owner = auth.uid());
create policy "plans owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'plans' and owner = auth.uid());
